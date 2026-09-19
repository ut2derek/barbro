-- OPERACJE NA REZERWACJACH
--
-- Tworzenie, przekładanie i zmiana statusu wizyty. Każda z tych operacji
-- dzieje się w całości albo wcale — nie ma stanu pośredniego, w którym stary
-- termin jest już zwolniony, a nowy jeszcze nie zapisany.
--
-- Funkcje działają z uprawnieniami wywołującego, więc reguły dostępu (RLS)
-- obowiązują tak samo jak przy zwykłym zapytaniu: nikt nie zapisze rezerwacji
-- w cudzym salonie.

-- ---------------------------------------------------------------------------
-- Tworzenie rezerwacji
-- ---------------------------------------------------------------------------

create or replace function public.create_booking(
  p_salon_id uuid,
  p_staff_id uuid,
  p_client_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_source public.booking_source default 'manual',
  p_client_note text default null,
  p_status public.booking_status default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_total_minutes integer := 0;
  v_buffer_minutes integer := 0;
  v_total_price integer := 0;
  v_status public.booking_status;
  v_auto_accept boolean;
  v_timezone text;
  v_item record;
  v_order smallint := 0;
begin
  if p_service_ids is null or array_length(p_service_ids, 1) is null then
    raise exception 'Rezerwacja musi zawierać co najmniej jedną usługę' using errcode = 'P0001';
  end if;

  select s.auto_accept, s.timezone into v_auto_accept, v_timezone
  from public.salons s where s.id = p_salon_id and s.active;

  if v_timezone is null then
    raise exception 'Salon nie istnieje albo jest wyłączony' using errcode = 'P0002';
  end if;

  -- Fryzjer musi wykonywać wszystkie wybrane usługi.
  if exists (
    select 1 from unnest(p_service_ids) as requested(service_id)
    where not exists (
      select 1 from public.staff_services ss
      where ss.staff_id = p_staff_id and ss.service_id = requested.service_id
    )
  ) then
    raise exception 'Wybrany fryzjer nie wykonuje jednej z tych usług' using errcode = 'P0003';
  end if;

  -- Rezerwacja z internetu musi trafić w wolny termin wyliczony przez system.
  -- Wizyta dopisywana ręcznie przez salon może wyjść poza siatkę i grafik —
  -- barber czasem musi kogoś wcisnąć. Przed nałożeniem na inną wizytę i tak
  -- chroni ograniczenie w bazie.
  if p_source = 'web' then
    if not exists (
      select 1 from public.get_available_slots(
        p_salon_id,
        p_service_ids,
        (p_starts_at at time zone v_timezone)::date,
        (p_starts_at at time zone v_timezone)::date,
        p_staff_id
      ) slots
      where slots.slot_start = p_starts_at
    ) then
      raise exception 'Ten termin nie jest już dostępny' using errcode = 'P0004';
    end if;
  end if;

  v_status := coalesce(
    p_status,
    case
      when p_source = 'web' then 'pending_confirmation'::public.booking_status
      else 'confirmed'::public.booking_status
    end
  );

  -- Ceny i czasy zapisujemy w chwili rezerwacji i nigdy ich później nie ruszamy.
  create temporary table if not exists tmp_booking_items (
    service_id uuid,
    item_order smallint,
    name_snapshot text,
    price_grosz integer,
    duration_minutes integer,
    buffer_after_minutes integer
  ) on commit drop;
  delete from tmp_booking_items;

  for v_item in
    select
      sv.id as service_id,
      requested.ord::smallint as item_order,
      sv.name as name_snapshot,
      coalesce(
        ss.price_grosz_override,
        case
          when sv.promo_price_grosz is not null
           and now() between sv.promo_starts_at and sv.promo_ends_at
          then sv.promo_price_grosz
          else sv.price_grosz
        end
      ) as price_grosz,
      coalesce(ss.duration_minutes_override, sv.duration_minutes) as duration_minutes,
      sv.buffer_after_minutes
    from unnest(p_service_ids) with ordinality as requested(service_id, ord)
    join public.services sv on sv.id = requested.service_id and sv.salon_id = p_salon_id
    left join public.staff_services ss
      on ss.staff_id = p_staff_id and ss.service_id = sv.id
    order by requested.ord
  loop
    v_order := v_item.item_order;
    v_total_minutes := v_total_minutes + v_item.duration_minutes;
    v_total_price := v_total_price + v_item.price_grosz;
    -- Liczy się przerwa po ostatniej usłudze w kolejności.
    v_buffer_minutes := v_item.buffer_after_minutes;

    insert into tmp_booking_items values (
      v_item.service_id, v_item.item_order, v_item.name_snapshot,
      v_item.price_grosz, v_item.duration_minutes, v_item.buffer_after_minutes
    );
  end loop;

  if v_order = 0 then
    raise exception 'Żadna ze wskazanych usług nie należy do tego salonu' using errcode = 'P0005';
  end if;

  insert into public.bookings (
    salon_id, staff_id, client_id, starts_at, ends_at, buffer_after_minutes,
    status, total_price_grosz, source, client_note, created_by
  ) values (
    p_salon_id, p_staff_id, p_client_id,
    p_starts_at,
    p_starts_at + make_interval(mins => v_total_minutes),
    v_buffer_minutes,
    v_status, v_total_price, p_source, p_client_note, auth.uid()
  )
  returning id into v_booking_id;

  insert into public.booking_items (
    salon_id, booking_id, service_id, item_order, name_snapshot,
    price_grosz, duration_minutes, buffer_after_minutes
  )
  select p_salon_id, v_booking_id, service_id, item_order, name_snapshot,
         price_grosz, duration_minutes, buffer_after_minutes
  from tmp_booking_items;

  return v_booking_id;
end;
$$;

comment on function public.create_booking is
  'Tworzy wizytę wraz z pozycjami. Ceny i czasy zapisywane są w chwili rezerwacji.';

-- ---------------------------------------------------------------------------
-- Zmiana statusu
-- ---------------------------------------------------------------------------

create or replace function public.change_booking_status(
  p_booking_id uuid,
  p_status public.booking_status,
  p_comment text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_current public.booking_status;
  v_allowed public.booking_status[];
begin
  select status into v_current from public.bookings where id = p_booking_id;

  if v_current is null then
    raise exception 'Nie znaleziono rezerwacji' using errcode = 'P0006';
  end if;

  -- Dozwolone przejścia. Statusy końcowe zamykają sprawę.
  v_allowed := case v_current
    when 'pending_confirmation' then array['pending_approval', 'confirmed', 'expired',
                                           'cancelled_by_client', 'cancelled_by_salon']
    when 'pending_approval' then array['confirmed', 'cancelled_by_client', 'cancelled_by_salon']
    when 'confirmed' then array['completed', 'no_show', 'cancelled_by_client', 'cancelled_by_salon']
    else array[]::text[]
  end::public.booking_status[];

  if not (p_status = any (v_allowed)) then
    raise exception 'Nie można zmienić statusu z % na %', v_current, p_status
      using errcode = 'P0007';
  end if;

  if p_status = 'cancelled_by_salon' and coalesce(trim(p_comment), '') = '' then
    raise exception 'Anulowanie przez salon wymaga komentarza' using errcode = 'P0008';
  end if;

  update public.bookings
  set status = p_status,
      cancellation_comment = coalesce(p_comment, cancellation_comment)
  where id = p_booking_id;
end;
$$;

comment on function public.change_booking_status is
  'Zmienia status wizyty, pilnując dozwolonych przejść i komentarza przy anulowaniu przez salon.';

-- ---------------------------------------------------------------------------
-- Przełożenie terminu
-- ---------------------------------------------------------------------------

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_new_starts_at timestamptz,
  p_new_staff_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old public.bookings%rowtype;
  v_new_id uuid;
  v_minutes integer;
  v_staff_id uuid;
begin
  select * into v_old from public.bookings where id = p_booking_id;

  if v_old.id is null then
    raise exception 'Nie znaleziono rezerwacji' using errcode = 'P0006';
  end if;

  if v_old.status not in ('pending_confirmation', 'pending_approval', 'confirmed') then
    raise exception 'Tej wizyty nie można już przełożyć' using errcode = 'P0009';
  end if;

  v_staff_id := coalesce(p_new_staff_id, v_old.staff_id);
  select sum(duration_minutes)::int into v_minutes
  from public.booking_items where booking_id = p_booking_id;

  -- Najpierw zwalniamy stary termin, potem zapisujemy nowy. Jeśli nowy termin
  -- okaże się zajęty, cała operacja się cofa i stary zostaje nietknięty.
  update public.bookings set status = 'rescheduled' where id = p_booking_id;

  insert into public.bookings (
    salon_id, staff_id, client_id, starts_at, ends_at, buffer_after_minutes,
    status, total_price_grosz, source, client_note, previous_booking_id, created_by
  ) values (
    v_old.salon_id, v_staff_id, v_old.client_id,
    p_new_starts_at,
    p_new_starts_at + make_interval(mins => coalesce(v_minutes, 0)),
    v_old.buffer_after_minutes,
    v_old.status, v_old.total_price_grosz, v_old.source, v_old.client_note,
    p_booking_id, auth.uid()
  )
  returning id into v_new_id;

  -- Pozycje przenosimy bez zmian — cena ustalona przy pierwszej rezerwacji zostaje.
  insert into public.booking_items (
    salon_id, booking_id, service_id, item_order, name_snapshot,
    price_grosz, duration_minutes, buffer_after_minutes
  )
  select salon_id, v_new_id, service_id, item_order, name_snapshot,
         price_grosz, duration_minutes, buffer_after_minutes
  from public.booking_items
  where booking_id = p_booking_id;

  return v_new_id;
end;
$$;

comment on function public.reschedule_booking is
  'Przekłada wizytę na nowy termin. Stary slot zwalniany jest w tej samej transakcji, ceny zostają bez zmian.';

grant execute on function public.create_booking(uuid, uuid, uuid, uuid[], timestamptz, public.booking_source, text, public.booking_status) to authenticated;
grant execute on function public.change_booking_status(uuid, public.booking_status, text) to authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz, uuid) to authenticated;