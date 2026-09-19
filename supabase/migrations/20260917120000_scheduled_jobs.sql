-- ZADANIA CYKLICZNE
--
-- Sprzątanie, które musi dziać się samo, niezależnie od tego, czy ktokolwiek
-- ma otwartą aplikację. Dlatego działa w bazie, a nie w telefonie barbera.
--
-- Każda funkcja zwraca liczbę zmienionych wierszy i jest bezpieczna przy
-- wielokrotnym uruchomieniu — powtórzenie nie psuje niczego.

-- ---------------------------------------------------------------------------
-- 1. Wygaszanie rezerwacji, których klient nie potwierdził w mailu
-- ---------------------------------------------------------------------------

create or replace function public.expire_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.bookings b
    set status = 'expired'
    from public.salons s
    where s.id = b.salon_id
      and b.status = 'pending_confirmation'
      -- Czas na potwierdzenie ustawia każdy salon osobno (domyślnie 20 minut).
      and b.created_at < now() - make_interval(mins => s.hold_minutes)
    returning b.id
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$$;

comment on function public.expire_pending_bookings is
  'Zwalnia terminy zablokowane przez niepotwierdzone rezerwacje. Uruchamiana co minutę.';

-- ---------------------------------------------------------------------------
-- 2. Zamykanie minionych wizyt
-- ---------------------------------------------------------------------------

create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with completed as (
    update public.bookings b
    set status = 'completed'
    where b.status = 'confirmed'
      and b.ends_at < now()
    returning b.id
  )
  select count(*) into v_count from completed;

  return v_count;
end;
$$;

comment on function public.complete_past_bookings is
  'Oznacza minione potwierdzone wizyty jako zrealizowane. Wizyty czekające na akceptację zostawia barberowi do rozstrzygnięcia.';

-- ---------------------------------------------------------------------------
-- 3. Wyłączanie promocji po dacie końcowej
-- ---------------------------------------------------------------------------

create or replace function public.deactivate_finished_promotions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with finished as (
    update public.services sv
    set promo_price_grosz = null,
        promo_starts_at = null,
        promo_ends_at = null
    where sv.promo_ends_at is not null
      and sv.promo_ends_at < now()
    returning sv.id
  )
  select count(*) into v_count from finished;

  return v_count;
end;
$$;

comment on function public.deactivate_finished_promotions is
  'Czyści promocje po dacie końcowej. Ceny w już złożonych rezerwacjach się nie zmieniają — są zapisane w pozycjach.';

-- Zadania uruchamia harmonogram bazy, nie użytkownik aplikacji.
revoke execute on function public.expire_pending_bookings() from public;
revoke execute on function public.complete_past_bookings() from public;
revoke execute on function public.deactivate_finished_promotions() from public;

-- ---------------------------------------------------------------------------
-- Harmonogram
--
-- Jeśli pg_cron nie jest dostępny (np. lokalnie), migracja przechodzi bez
-- harmonogramu — same funkcje działają tak samo i można je wywołać ręcznie.
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;

  perform cron.schedule(
    'barbro-wygaszanie-niepotwierdzonych',
    '* * * * *',
    $job$select public.expire_pending_bookings()$job$
  );

  perform cron.schedule(
    'barbro-zamykanie-minionych-wizyt',
    '*/15 * * * *',
    $job$select public.complete_past_bookings()$job$
  );

  perform cron.schedule(
    'barbro-koniec-promocji',
    '5 0 * * *',
    $job$select public.deactivate_finished_promotions()$job$
  );
exception
  when others then
    raise notice 'Harmonogram pg_cron niedostępny (%), funkcje trzeba uruchamiać ręcznie.', sqlerrm;
end;
$$;