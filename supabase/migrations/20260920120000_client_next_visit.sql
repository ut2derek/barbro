-- ---------------------------------------------------------------------------
-- Najbliższa wizyta klienta
--
-- Widok znał dotąd tylko datę ostatniej wizyty. To dwie różne rzeczy:
-- „kiedy go zobaczę” barber musi widzieć od razu przy nazwisku, a „kiedy był”
-- to historia, po którą sięga się rzadziej.
--
-- Najbliższa wizyta to pierwsza jeszcze nieodbyta, w statusie blokującym
-- termin — odwołana ani nieodbyta nie jest umówionym spotkaniem.
-- ---------------------------------------------------------------------------

-- Nowa kolumna trafia w środek listy, a `create or replace view` pozwala tylko
-- dopisywać na końcu — stąd usunięcie i utworzenie od nowa. Widok nie ma
-- zależności, więc nic za nim nie przepada.
drop view if exists public.client_overview;

create view public.client_overview
with (security_invoker = true)
as
  select
    c.id,
    c.salon_id,
    c.first_name,
    c.last_name,
    c.phone,
    c.email,
    c.no_show_count,
    c.blocked,
    c.created_at,
    -- Wizyty odwołane nie liczą się jako „był ostatnio”.
    max(b.starts_at) filter (
      where b.status in ('pending_confirmation', 'pending_approval', 'confirmed', 'completed')
        and b.starts_at <= now()
    ) as last_visit_at,
    min(b.starts_at) filter (
      where b.status in ('pending_confirmation', 'pending_approval', 'confirmed')
        and b.starts_at > now()
    ) as next_visit_at,
    count(b.id) filter (where b.status = 'completed')::integer as completed_count
  from public.clients c
  left join public.bookings b on b.client_id = c.id
  group by c.id;

comment on view public.client_overview is
  'Klient z datą ostatniej i najbliższej wizyty — do listy klientów.';

grant select on public.client_overview to authenticated;
