-- ---------------------------------------------------------------------------
-- Klient z datą ostatniej wizyty
--
-- Lista klientów daje się układać alfabetycznie, po dacie dodania i po tym,
-- kto był ostatnio (albo najdawniej). Dwa ostatnie porządki potrzebują daty
-- ostatniej wizyty — liczy ją baza, tak jak wszystkie inne reguły. Aplikacja
-- tylko wybiera kolejność.
--
-- `security_invoker` sprawia, że widok działa w imieniu pytającego, więc
-- obowiązują go reguły dostępu z tabel `clients` i `bookings`. Bez tego widok
-- pokazywałby klientów każdego salonu.
-- ---------------------------------------------------------------------------

create or replace view public.client_overview
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
    ) as last_visit_at,
    count(b.id) filter (where b.status = 'completed')::integer as completed_count
  from public.clients c
  left join public.bookings b on b.client_id = c.id
  group by c.id;

comment on view public.client_overview is
  'Klient wraz z datą ostatniej wizyty — do układania listy klientów.';

grant select on public.client_overview to authenticated;
