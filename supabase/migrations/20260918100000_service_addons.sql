-- DODATKI DO USŁUG
--
-- Dodatek to drobna usługa doczepiana do głównej: tuszowanie siwizny,
-- depilacja nosa. Ma własną cenę i własny czas, który wydłuża wizytę —
-- dlatego musi wchodzić do liczenia wolnych terminów, a nie tylko do rachunku.

create table public.service_addons (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  -- Puste = dodatek proponowany przy każdej usłudze salonu.
  service_id uuid references public.services (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  price_grosz integer not null check (price_grosz >= 0),
  duration_minutes integer not null default 0 check (duration_minutes between 0 and 240),
  max_quantity smallint not null default 1 check (max_quantity between 1 and 10),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_addons_salon_idx on public.service_addons (salon_id) where active;
create index service_addons_service_idx on public.service_addons (service_id);

create trigger service_addons_set_updated_at
  before update on public.service_addons
  for each row execute function public.tg_set_updated_at();

comment on table public.service_addons is
  'Dodatki doczepiane do usługi. Czas dodatku wydłuża wizytę, cena wchodzi do rachunku.';

-- Dodatki wybrane przy konkretnej wizycie — z ceną i czasem zapisanymi w chwili
-- rezerwacji, tak samo jak pozycje usług.
create table public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  addon_id uuid references public.service_addons (id) on delete set null,
  name_snapshot text not null,
  price_grosz integer not null check (price_grosz >= 0),
  duration_minutes integer not null check (duration_minutes >= 0),
  quantity smallint not null default 1 check (quantity between 1 and 10),
  created_at timestamptz not null default now()
);

create index booking_addons_booking_idx on public.booking_addons (booking_id);

alter table public.service_addons enable row level security;
alter table public.booking_addons enable row level security;

create policy service_addons_select on public.service_addons
  for select to authenticated using (public.is_salon_member(salon_id));
create policy service_addons_write on public.service_addons
  for all to authenticated
  using (public.is_salon_owner(salon_id)) with check (public.is_salon_owner(salon_id));

create policy booking_addons_select on public.booking_addons
  for select to authenticated
  using (
    public.is_salon_member(salon_id)
    or exists (
      select 1 from public.bookings b
      join public.clients c on c.id = b.client_id
      where b.id = booking_addons.booking_id and c.user_id = auth.uid()
    )
  );
create policy booking_addons_write on public.booking_addons
  for all to authenticated
  using (public.is_salon_member(salon_id))
  with check (public.is_salon_member(salon_id));

-- ---------------------------------------------------------------------------
-- Dodatki wydłużają wizytę, więc funkcja liczenia terminów musi o nich wiedzieć.
--
-- Nowy parametr ma wartość domyślną, więc stara i nowa wersja byłyby dla
-- Postgresa równie dobrym dopasowaniem — dlatego najpierw usuwamy poprzednią.
-- ---------------------------------------------------------------------------

drop function if exists public.get_available_slots(uuid, uuid[], date, date, uuid);

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

grant execute on function public.get_available_slots(uuid, uuid[], date, date, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Rezerwacja z dodatkami
--
-- Dodatki przychodzą jako lista par: który dodatek i ile sztuk. Ich czas
-- wydłuża wizytę, a cena wchodzi do kwoty zapisanej przy rezerwacji.
-- ---------------------------------------------------------------------------

drop function if exists public.create_booking(
  uuid, uuid, uuid, uuid[], timestamptz, public.booking_source, text, public.booking_status
);

create or replace function public.create_booking(
  p_salon_id uuid,
  p_staff_id uuid,
  p_client_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_source public.booking_source default 'manual',
  p_client_note text default null,
  p_status public.booking_status default null,
  p_addons jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_total_minutes integer;
  v_buffer_minutes integer;
  v_total_price integer;
  v_items integer;
  v_addon_minutes integer := 0;
  v_addon_price integer := 0;
  v_status public.booking_status;
  v_auto_accept boolean;
  v_timezone text;
begin
  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Rezerwacja musi zawierać co najmniej jedną usługę' using errcode = 'P0001';
  end if;

  select s.auto_accept, s.timezone into v_auto_accept, v_timezone
  from public.salons s where s.id = p_salon_id and s.active;

  if v_timezone is null then
    raise exception 'Salon nie istnieje albo jest wyłączony' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from unnest(p_service_ids) as requested(service_id)
    where not exists (
      select 1 from public.staff_services ss
      where ss.staff_id = p_staff_id and ss.service_id = requested.service_id
    )
  ) then
    raise exception 'Wybrany fryzjer nie wykonuje jednej z tych usług' using errcode = 'P0003';
  end if;

  -- Dodatki liczymy przed sprawdzeniem terminu, bo wydłużają wizytę.
  if p_addons is not null and jsonb_array_length(p_addons) > 0 then
    -- Dodatek musi należeć do tego salonu i być aktywny.
    if exists (
      select 1
      from jsonb_array_elements(p_addons) as chosen
      where not exists (
        select 1 from public.service_addons a
        where a.id = (chosen->>'id')::uuid
          and a.salon_id = p_salon_id
          and a.active
      )
    ) then
      raise exception 'Wybrano dodatek spoza tego salonu' using errcode = 'P0010';
    end if;

    select
      coalesce(sum(a.duration_minutes * quantity), 0),
      coalesce(sum(a.price_grosz * quantity), 0)
    into v_addon_minutes, v_addon_price
    from jsonb_array_elements(p_addons) as chosen
    join public.service_addons a on a.id = (chosen->>'id')::uuid
    cross join lateral (
      select least(greatest(coalesce((chosen->>'quantity')::int, 1), 1), a.max_quantity) as quantity
    ) q;
  end if;

  if p_source = 'web' then
    if not exists (
      select 1 from public.get_available_slots(
        p_salon_id,
        p_service_ids,
        (p_starts_at at time zone v_timezone)::date,
        (p_starts_at at time zone v_timezone)::date,
        p_staff_id,
        v_addon_minutes
      ) slots
      where slots.slot_start = p_starts_at
    ) then
      raise exception 'Ten termin nie jest już dostępny' using errcode = 'P0004';
    end if;
  end if;

  select
    sum(lines.duration_minutes)::int,
    sum(lines.price_grosz)::int,
    count(*)::int,
    (array_agg(lines.buffer_after_minutes order by lines.item_order desc))[1]
  into v_total_minutes, v_total_price, v_items, v_buffer_minutes
  from public.booking_item_lines(p_salon_id, p_staff_id, p_service_ids) lines;

  if coalesce(v_items, 0) = 0 then
    raise exception 'Żadna ze wskazanych usług nie należy do tego salonu' using errcode = 'P0005';
  end if;

  v_status := coalesce(
    p_status,
    case
      when p_source = 'web' then 'pending_confirmation'::public.booking_status
      else 'confirmed'::public.booking_status
    end
  );

  insert into public.bookings (
    salon_id, staff_id, client_id, starts_at, ends_at, buffer_after_minutes,
    status, total_price_grosz, source, client_note, created_by
  ) values (
    p_salon_id, p_staff_id, p_client_id,
    p_starts_at,
    p_starts_at + make_interval(mins => v_total_minutes + v_addon_minutes),
    coalesce(v_buffer_minutes, 0),
    v_status, v_total_price + v_addon_price, p_source, p_client_note, auth.uid()
  )
  returning id into v_booking_id;

  insert into public.booking_items (
    salon_id, booking_id, service_id, item_order, name_snapshot,
    price_grosz, duration_minutes, buffer_after_minutes
  )
  select p_salon_id, v_booking_id, lines.service_id, lines.item_order, lines.name_snapshot,
         lines.price_grosz, lines.duration_minutes, lines.buffer_after_minutes
  from public.booking_item_lines(p_salon_id, p_staff_id, p_service_ids) lines;

  if p_addons is not null and jsonb_array_length(p_addons) > 0 then
    insert into public.booking_addons (
      salon_id, booking_id, addon_id, name_snapshot, price_grosz, duration_minutes, quantity
    )
    select
      p_salon_id,
      v_booking_id,
      a.id,
      a.name,
      a.price_grosz,
      a.duration_minutes,
      q.quantity
    from jsonb_array_elements(p_addons) as chosen
    join public.service_addons a on a.id = (chosen->>'id')::uuid
    cross join lateral (
      select least(greatest(coalesce((chosen->>'quantity')::int, 1), 1), a.max_quantity)::smallint as quantity
    ) q;
  end if;

  return v_booking_id;
end;
$$;

grant execute on function public.create_booking(
  uuid, uuid, uuid, uuid[], timestamptz, public.booking_source, text, public.booking_status, jsonb
) to authenticated;
