-- CENY USŁUG
--
-- Jedno miejsce, które odpowiada na pytanie „ile to kosztuje”. Aplikacja
-- barbera i strona rezerwacji pytają tę samą funkcję, więc nie mogą pokazać
-- różnych kwot.
--
-- Przy aktywnej promocji ustawa o informowaniu o cenach wymaga podania
-- najniższej ceny z 30 dni przed obniżką. Liczymy ją z historii cen, a nie
-- „na oko”.

create or replace function public.lowest_price_before_promo(p_service_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    -- najniższa cena w oknie 30 dni przed startem promocji
    (
      select min(h.price_grosz)
      from public.service_price_history h
      where h.service_id = sv.id
        and h.effective_from >= sv.promo_starts_at - interval '30 days'
        and h.effective_from < sv.promo_starts_at
    ),
    -- usługa jest w cenniku krócej niż 30 dni — bierzemy ostatnią cenę sprzed okna
    (
      select h.price_grosz
      from public.service_price_history h
      where h.service_id = sv.id
        and h.effective_from < sv.promo_starts_at - interval '30 days'
      order by h.effective_from desc
      limit 1
    ),
    -- brak jakiejkolwiek historii: cena podstawowa
    sv.price_grosz
  )
  from public.services sv
  where sv.id = p_service_id and sv.promo_starts_at is not null;
$$;

comment on function public.lowest_price_before_promo is
  'Najniższa cena z 30 dni przed obniżką — wymóg ustawy o informowaniu o cenach.';

/**
 * Ceny usług salonu w jednym zapytaniu, opcjonalnie dla konkretnego fryzjera.
 *
 * Kolejność ustalania ceny (ta sama co przy zapisie rezerwacji):
 *   1. cena ustawiona temu fryzjerowi,
 *   2. cena promocyjna, jeśli promocja trwa,
 *   3. cena z cennika.
 */
create or replace function public.service_pricing(
  p_salon_id uuid,
  p_staff_id uuid default null
)
returns table (
  service_id uuid,
  price_grosz integer,
  regular_price_grosz integer,
  lowest_price_before_promo_grosz integer,
  promo_active boolean,
  promo_ends_at timestamptz,
  duration_minutes integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    sv.id,
    coalesce(
      ss.price_grosz_override,
      case when promo.active then sv.promo_price_grosz else sv.price_grosz end
    ),
    sv.price_grosz,
    case when promo.active then public.lowest_price_before_promo(sv.id) else null end,
    promo.active and ss.price_grosz_override is null,
    case when promo.active then sv.promo_ends_at else null end,
    coalesce(ss.duration_minutes_override, sv.duration_minutes)
  from public.services sv
  left join public.staff_services ss
    on ss.service_id = sv.id and ss.staff_id = p_staff_id
  cross join lateral (
    select
      sv.promo_price_grosz is not null
      and now() between sv.promo_starts_at and sv.promo_ends_at as active
  ) promo
  where sv.salon_id = p_salon_id
    and (p_staff_id is null or ss.staff_id is not null);
$$;

comment on function public.service_pricing is
  'Ceny usług tak, jak policzy je rezerwacja. Aplikacja nie powiela tej logiki.';

grant execute on function public.lowest_price_before_promo(uuid) to authenticated;
grant execute on function public.service_pricing(uuid, uuid) to authenticated;