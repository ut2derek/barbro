-- ---------------------------------------------------------------------------
-- USZCZELNIENIE
--
-- Dwie rzeczy, które wyszły z przeglądu kodu:
--
-- 1. Limit zapytań dla publicznej funkcji rezerwacji. CLAUDE.md §7 wymaga go
--    od początku, ale go nie było — każdy mógł w pętli tworzyć klientów
--    i niepotwierdzone rezerwacje, blokując realne terminy po 20 minut każdy.
--
-- 2. Funkcje `security definer` obchodzą reguły dostępu (RLS) z definicji.
--    Trzy z nich nie sprawdzały, czy pytający należy do salonu, więc barber
--    salonu A mógł odczytać dostępność i oceny salonu B, znając jego numer.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Limit zapytań
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0
);

comment on table public.rate_limits is
  'Licznik zapytań dla funkcji publicznych. Klucz to operacja + adres IP.';

-- Nikt poza roli serwisowej nie ma tu czego szukać. RLS bez żadnej reguły
-- dostępu oznacza: dla zwykłych użytkowników tabela jest pusta.
alter table public.rate_limits enable row level security;

create index rate_limits_window_idx on public.rate_limits (window_started_at);

/**
 * Zwraca prawdę, gdy zapytanie mieści się w limicie, i fałsz, gdy trzeba je
 * odrzucić. Okno jest przesuwane skokowo: po jego upływie licznik startuje
 * od zera. Prostsze niż okno kroczące i w zupełności wystarcza na boty.
 */
create or replace function public.rate_limit_take(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as rl (bucket, window_started_at, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set
      -- Okno wygasło? Zaczynamy liczyć od nowa.
      window_started_at = case
        when rl.window_started_at < now() - make_interval(secs => p_window_seconds)
          then now()
        else rl.window_started_at
      end,
      hits = case
        when rl.window_started_at < now() - make_interval(secs => p_window_seconds)
          then 1
        else rl.hits + 1
      end
  returning rl.hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

comment on function public.rate_limit_take is
  'Zlicza zapytanie w oknie czasowym. Fałsz = limit przekroczony.';

/** Sprzątanie liczników, których okno dawno minęło. */
create or replace function public.purge_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_started_at < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

select cron.schedule(
  'purge-rate-limits',
  '17 4 * * *',
  $$select public.purge_rate_limits();$$
);

-- ---------------------------------------------------------------------------
-- 2. Sprawdzenie przynależności w funkcjach `security definer`
--
-- Zasada: gdy wywołanie przychodzi od zalogowanego użytkownika, musi on
-- należeć do salonu. Wywołanie rolą serwisową (funkcja brzegowa obsługująca
-- stronę rezerwacji dla klienta) nie ma `auth.uid()` i przechodzi dalej —
-- tam dostępu pilnuje sama funkcja brzegowa.
-- ---------------------------------------------------------------------------

create or replace function public.caller_may_read_salon(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is null
      or public.is_salon_member(p_salon_id)
      or public.is_app_admin();
$$;

comment on function public.caller_may_read_salon is
  'Zalogowany użytkownik musi należeć do salonu. Rola serwisowa przechodzi.';

grant execute on function public.caller_may_read_salon(uuid) to authenticated;

-- --- oceny salonu ---

create or replace function public.salon_rating(p_salon_id uuid)
returns table (average numeric, reviews_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select round(avg(r.rating)::numeric, 2), count(*)::int
  from public.booking_reviews r
  where r.salon_id = p_salon_id
    and public.caller_may_read_salon(p_salon_id);
$$;

create or replace function public.staff_ratings(p_salon_id uuid)
returns table (staff_id uuid, average numeric, reviews_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.staff_id, round(avg(r.rating)::numeric, 2), count(*)::int
  from public.booking_reviews r
  where r.salon_id = p_salon_id
    and r.staff_id is not null
    and public.caller_may_read_salon(p_salon_id)
  group by r.staff_id;
$$;

-- --- wolne terminy ---
--
-- Ta sama funkcja co dotąd, z jednym warunkiem dołożonym na samym wejściu.

create or replace function public.get_available_slots(
  p_salon_id uuid,
  p_service_ids uuid[],
  p_from date,
  p_to date,
  p_staff_id uuid default null,
  p_extra_minutes integer default 0
)
returns table (slot_start timestamptz, slot_end timestamptz, staff_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_step integer;
  v_min_lead integer;
  v_horizon integer;
  v_now timestamptz := now();
  v_today date;
  v_extra integer := greatest(coalesce(p_extra_minutes, 0), 0);
begin
  -- Cudzy salon nie odpowiada nic — tak samo, jakby nie istniał. Funkcja jest
  -- `security definer`, czyli obchodzi reguły dostępu, więc sprawdzenie musi
  -- stać tutaj, w pierwszej linijce ciała.
  if not public.caller_may_read_salon(p_salon_id) then
    return;
  end if;

  select s.timezone, s.slot_step_minutes, s.min_lead_minutes, s.booking_horizon_days
    into v_tz, v_step, v_min_lead, v_horizon
  from public.salons s
  where s.id = p_salon_id and s.active;

  if v_tz is null then
    return;
  end if;

  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    return;
  end if;

  if exists (
    select 1 from unnest(p_service_ids) as requested(service_id)
    where not exists (
      select 1 from public.services sv
      where sv.id = requested.service_id and sv.salon_id = p_salon_id
    )
  ) then
    return;
  end if;

  v_today := (v_now at time zone v_tz)::date;

  return query
  with wanted as (
    select o.service_id, o.pos, sv.duration_minutes, sv.buffer_after_minutes
    from unnest(p_service_ids) with ordinality as o(service_id, pos)
    join public.services sv on sv.id = o.service_id
  ),
  candidates as (
    select st.id as staff_id
    from public.staff st
    where st.salon_id = p_salon_id
      and st.active
      and (p_staff_id is null or st.id = p_staff_id)
      and (select count(distinct w.service_id) from wanted w) = (
        select count(distinct ss.service_id)
        from public.staff_services ss
        where ss.staff_id = st.id
          and ss.service_id in (select w.service_id from wanted w)
      )
  ),
  durations as (
    select
      c.staff_id,
      (
        select sum(coalesce(ss.duration_minutes_override, w.duration_minutes))::int
        from wanted w
        left join public.staff_services ss
          on ss.staff_id = c.staff_id and ss.service_id = w.service_id
      ) + v_extra as visit_minutes,
      (select w.buffer_after_minutes from wanted w order by w.pos desc limit 1) as buffer_minutes
    from candidates c
  ),
  days as (
    select d::date as day
    from generate_series(
      greatest(p_from, v_today)::timestamp,
      p_to::timestamp,
      interval '1 day'
    ) as d
  ),
  staff_days as (
    select dur.staff_id, dd.day, dur.visit_minutes, dur.buffer_minutes
    from durations dur
    cross join days dd
    where dur.visit_minutes is not null
      and not exists (
        select 1 from public.schedule_exceptions e
        where e.salon_id = p_salon_id
          and e.exception_type = 'day_off'
          and (e.staff_id is null or e.staff_id = dur.staff_id)
          and dd.day between e.starts_on and e.ends_on
      )
  ),
  custom_windows as (
    select sd.staff_id, sd.day, e.start_time, e.end_time
    from staff_days sd
    join public.schedule_exceptions e
      on e.salon_id = p_salon_id
     and e.exception_type = 'custom_hours'
     and (e.staff_id is null or e.staff_id = sd.staff_id)
     and sd.day between e.starts_on and e.ends_on
  ),
  regular_windows as (
    select sd.staff_id, sd.day, wh.start_time, wh.end_time
    from staff_days sd
    join public.working_hours wh
      on wh.staff_id = sd.staff_id
     and wh.weekday = extract(isodow from sd.day)::smallint
    where not exists (
      select 1 from custom_windows cw
      where cw.staff_id = sd.staff_id and cw.day = sd.day
    )
  ),
  staff_windows as (
    select * from custom_windows
    union all
    select * from regular_windows
  ),
  open_windows as (
    select
      sw.staff_id,
      sw.day,
      greatest(sw.start_time, sh.open_time) as start_time,
      least(sw.end_time, sh.close_time) as end_time
    from staff_windows sw
    join public.salon_hours sh
      on sh.salon_id = p_salon_id
     and sh.weekday = extract(isodow from sw.day)::smallint
    where greatest(sw.start_time, sh.open_time) < least(sw.end_time, sh.close_time)
  ),
  candidate_slots as (
    select
      ow.staff_id,
      (gs at time zone v_tz) as slot_start,
      ((gs + make_interval(mins => sd.visit_minutes)) at time zone v_tz) as slot_end,
      ((gs + make_interval(mins => sd.visit_minutes + coalesce(sd.buffer_minutes, 0))) at time zone v_tz) as block_end
    from open_windows ow
    join staff_days sd on sd.staff_id = ow.staff_id and sd.day = ow.day
    cross join lateral generate_series(
      ow.day + ow.start_time,
      ow.day + ow.end_time - make_interval(mins => sd.visit_minutes),
      make_interval(mins => v_step)
    ) as gs
  )
  select distinct cs.slot_start, cs.slot_end, cs.staff_id
  from candidate_slots cs
  where
    cs.slot_start >= v_now + make_interval(mins => v_min_lead)
    and (cs.slot_start at time zone v_tz)::date <= v_today + v_horizon
    and not exists (
      select 1 from public.bookings b
      where b.staff_id = cs.staff_id
        and b.status in ('pending_confirmation', 'pending_approval', 'confirmed', 'completed')
        and b.time_range && tstzrange(cs.slot_start, cs.block_end, '[)')
    )
    and not exists (
      select 1 from public.time_blocks tb
      where tb.staff_id = cs.staff_id
        and tstzrange(tb.starts_at, tb.ends_at, '[)') && tstzrange(cs.slot_start, cs.block_end, '[)')
    )
  order by cs.slot_start, cs.staff_id;
end;
$$;

grant execute on function public.get_available_slots(uuid, uuid[], date, date, uuid, integer)
  to authenticated;
