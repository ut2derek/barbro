-- LICZENIE WOLNYCH TERMINÓW
--
-- Jedyne miejsce, w którym system decyduje, co jest wolne. Używa jej zarówno
-- aplikacja barbera, jak i (w przyszłości) strona rezerwacji dla klientów —
-- dlatego mieszka w bazie, a nie w kodzie którejkolwiek z aplikacji.
--
-- Bierze pod uwagę:
--   1. godziny otwarcia salonu,
--   2. grafik tygodniowy fryzjera (część wspólna z godzinami salonu),
--   3. wyjątki: urlopy, dni wolne, inne godziny (per fryzjer lub cały salon),
--   4. ręczne blokady czasu,
--   5. istniejące rezerwacje w statusach blokujących, razem z przerwą po nich,
--   6. łączny czas wybranych usług z nadpisaniami danego fryzjera,
--   7. minimalne wyprzedzenie i horyzont rezerwacji,
--   8. siatkę slotów ustawioną w salonie.
--
-- Czas liczony jest w strefie salonu, więc zmiana czasu letniego i zimowego
-- wypada poprawnie: 9:00 rano zawsze znaczy 9:00 rano.

create or replace function public.get_available_slots(
  p_salon_id uuid,
  p_service_ids uuid[],
  p_from date,
  p_to date,
  p_staff_id uuid default null
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
begin
  select s.timezone, s.slot_step_minutes, s.min_lead_minutes, s.booking_horizon_days
    into v_tz, v_step, v_min_lead, v_horizon
  from public.salons s
  where s.id = p_salon_id and s.active;

  -- Salon nie istnieje albo jest wyłączony.
  if v_tz is null then
    return;
  end if;

  -- Brak usług = brak czego szukać.
  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    return;
  end if;

  -- Wszystkie wskazane usługi muszą należeć do tego salonu.
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
  -- Fryzjer musi mieć przypisane wszystkie wybrane usługi.
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
  -- Czas wizyty u konkretnego fryzjera (z jego nadpisaniami) oraz przerwa
  -- po ostatniej usłudze — ta przerwa blokuje czas, ale nie jest wizytą.
  durations as (
    select
      c.staff_id,
      (
        select sum(coalesce(ss.duration_minutes_override, w.duration_minutes))::int
        from wanted w
        left join public.staff_services ss
          on ss.staff_id = c.staff_id and ss.service_id = w.service_id
      ) as visit_minutes,
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
  -- Dni, w których fryzjer w ogóle pracuje (bez urlopów i dni wolnych,
  -- również tych ogłoszonych dla całego salonu).
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
  -- Wyjątek „inne godziny” zastępuje grafik na ten dzień.
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
  -- Część wspólna grafiku fryzjera i godzin otwarcia salonu.
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
  -- Siatka slotów. Czas lokalny salonu zamieniany na znacznik czasu dopiero
  -- tutaj, dzięki czemu doba ze zmianą czasu ma poprawne godziny.
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
    -- minimalne wyprzedzenie
    cs.slot_start >= v_now + make_interval(mins => v_min_lead)
    -- horyzont rezerwacji
    and (cs.slot_start at time zone v_tz)::date <= v_today + v_horizon
    -- kolizja z istniejącą wizytą (jej zakres zawiera już przerwę po niej)
    and not exists (
      select 1 from public.bookings b
      where b.staff_id = cs.staff_id
        and b.status in ('pending_confirmation', 'pending_approval', 'confirmed', 'completed')
        and b.time_range && tstzrange(cs.slot_start, cs.block_end, '[)')
    )
    -- kolizja z ręczną blokadą czasu
    and not exists (
      select 1 from public.time_blocks tb
      where tb.staff_id = cs.staff_id
        and tstzrange(tb.starts_at, tb.ends_at, '[)') && tstzrange(cs.slot_start, cs.block_end, '[)')
    )
  order by cs.slot_start, cs.staff_id;
end;
$$;

comment on function public.get_available_slots is
  'Wolne terminy dla wybranych usług. Jedyne źródło prawdy o dostępności — używa jej aplikacja barbera i strona rezerwacji.';

grant execute on function public.get_available_slots(uuid, uuid[], date, date, uuid) to authenticated;