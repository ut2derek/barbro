-- PANEL ADMINISTRATORA PLATFORMY
--
-- Widok dla właściciela produktu, nie dla salonów. Pokazuje listę salonów
-- i ruch, ale nie zagląda w dane osobowe klientów — administrator platformy
-- nie ma powodu znać nazwisk ani telefonów.

create or replace function public.admin_salon_overview()
returns table (
  salon_id uuid,
  name text,
  slug text,
  city text,
  active boolean,
  online_booking_enabled boolean,
  created_at timestamptz,
  owner_count integer,
  staff_count integer,
  bookings_last_30_days integer,
  upcoming_bookings integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.name,
    s.slug,
    s.city,
    s.active,
    s.online_booking_enabled,
    s.created_at,
    (select count(*)::int from public.salon_members m
      where m.salon_id = s.id and m.role = 'owner'),
    (select count(*)::int from public.staff st
      where st.salon_id = s.id and st.active),
    (select count(*)::int from public.bookings b
      where b.salon_id = s.id
        and b.created_at >= now() - interval '30 days'),
    (select count(*)::int from public.bookings b
      where b.salon_id = s.id
        and b.starts_at >= now()
        and b.status in ('pending_confirmation', 'pending_approval', 'confirmed'))
  from public.salons s
  -- Funkcja działa z uprawnieniami właściciela, więc dostęp sprawdzamy wprost.
  where public.is_app_admin()
  order by s.created_at desc;
$$;

comment on function public.admin_salon_overview is
  'Lista salonów z ruchem dla administratora platformy. Bez danych osobowych klientów.';

grant execute on function public.admin_salon_overview() to authenticated;

-- Włączanie i wyłączanie salonu przez administratora platformy.
create or replace function public.admin_set_salon_active(p_salon_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Tylko administrator platformy' using errcode = '42501';
  end if;

  update public.salons set active = p_active where id = p_salon_id;
end;
$$;

grant execute on function public.admin_set_salon_active(uuid, boolean) to authenticated;
