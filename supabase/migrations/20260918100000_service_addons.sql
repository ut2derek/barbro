
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