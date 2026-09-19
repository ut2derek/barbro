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
-- Funkcja jest długa i nie chcemy jej przepisywać dla jednego warunku, więc
-- dokładamy sprawdzenie na wejściu, zaraz obok istniejącego sprawdzenia, czy
-- salon jest włączony. Reszta ciała pozostaje bez zmian.

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
  -- Cudzy salon nie odpowiada nic — tak samo, jakby nie istniał.
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

  return query
  select q.slot_start, q.slot_end, q.staff_id
  from public.available_slots_unchecked(
    p_salon_id, p_service_ids, p_from, p_to, p_staff_id, v_extra
  ) q;
end;
$$;

grant execute on function public.get_available_slots(uuid, uuid[], date, date, uuid, integer)
  to authenticated;
