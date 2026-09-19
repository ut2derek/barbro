-- Dane testowe dla lokalnej bazy. Uruchamiane automatycznie przy `npm run db:reset`.
-- NIGDY nie trafiają na produkcję.
--
-- Konta testowe (hasło dla wszystkich: haslo123):
--   admin@barbro.test      administrator platformy
--   wlasciciel@barbro.test właściciel salonu „Barbershop Kowalski”
--   pracownik@barbro.test  pracownik tego salonu
--   obcy@barbro.test       właściciel innego salonu — służy do sprawdzania izolacji danych

-- ---------------------------------------------------------------------------
-- Konta
-- ---------------------------------------------------------------------------

create or replace function pg_temp.create_test_user(p_id uuid, p_email text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    crypt('haslo123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  );

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', p_id::text, now(), now(), now()
  );
end;
$$;

select pg_temp.create_test_user('10000000-0000-0000-0000-000000000001', 'admin@barbro.test');
select pg_temp.create_test_user('10000000-0000-0000-0000-000000000002', 'wlasciciel@barbro.test');
select pg_temp.create_test_user('10000000-0000-0000-0000-000000000003', 'pracownik@barbro.test');
select pg_temp.create_test_user('10000000-0000-0000-0000-000000000004', 'obcy@barbro.test');

insert into public.app_admins (user_id) values ('10000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Salony
-- ---------------------------------------------------------------------------

insert into public.salons (id, name, slug, brand_color, address_line, postal_code, city, phone, email, auto_accept)
values
  ('20000000-0000-0000-0000-000000000001', 'Barbershop Kowalski', 'barbershop-kowalski',
   '#1F1F23', 'ul. Długa 12', '00-238', 'Warszawa', '+48 500 100 200', 'kontakt@kowalski.test', false),
  ('20000000-0000-0000-0000-000000000002', 'Salon Obcy', 'salon-obcy',
   '#3355FF', 'ul. Inna 3', '30-001', 'Kraków', '+48 500 900 900', 'kontakt@obcy.test', true);

insert into public.salon_members (salon_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'staff'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'owner');

-- ---------------------------------------------------------------------------
-- Zespół: właściciel też strzyże, jeden pracownik z kontem, jeden bez konta
-- ---------------------------------------------------------------------------

insert into public.staff (id, salon_id, user_id, display_name, bio, sort_order) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002', 'Marek Kowalski', 'Właściciel, strzyżenia klasyczne', 1),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', 'Tomek Nowak', 'Fade i brody', 2),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
   null, 'Kasia Wiśniewska', 'Koloryzacja (pracownik bez konta)', 3);

insert into public.staff (id, salon_id, user_id, display_name, sort_order) values
  ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000004', 'Obcy Fryzjer', 1);

-- ---------------------------------------------------------------------------
-- Usługi
-- ---------------------------------------------------------------------------

insert into public.service_categories (id, salon_id, name, sort_order) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Strzyżenie', 1),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Broda', 2),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Koloryzacja', 3);

insert into public.services (id, salon_id, category_id, name, description, duration_minutes, buffer_after_minutes, price_grosz, sort_order) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'Strzyżenie męskie', 'Maszynka i nożyczki, mycie w cenie', 45, 5, 8000, 1),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
   'Broda', 'Modelowanie brzytwą', 30, 5, 5000, 2),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
   'Koloryzacja', 'Wymaga konsultacji', 90, 15, 18000, 3);

-- Usługa z aktywną promocją — do sprawdzenia najniższej ceny z 30 dni.
update public.services
set promo_price_grosz = 6000,
    promo_starts_at = now() - interval '2 days',
    promo_ends_at = now() + interval '5 days'
where id = '50000000-0000-0000-0000-000000000001';

-- Historia cen starsza niż promocja (wyzwalacz dopisał już cenę bieżącą).
insert into public.service_price_history (salon_id, service_id, price_grosz, effective_from) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 7500, now() - interval '45 days'),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 7000, now() - interval '20 days');

insert into public.staff_services (salon_id, staff_id, service_id) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003');

-- Tomek liczy za strzyżenie mniej i robi je szybciej.
update public.staff_services
set price_grosz_override = 7000, duration_minutes_override = 40
where staff_id = '30000000-0000-0000-0000-000000000002'
  and service_id = '50000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Godziny otwarcia i grafiki
-- ---------------------------------------------------------------------------

-- Salon: pon–pt 9:00–18:00, sobota 9:00–14:00.
insert into public.salon_hours (salon_id, weekday, open_time, close_time)
select '20000000-0000-0000-0000-000000000001', d, time '09:00', time '18:00'
from generate_series(1, 5) as d;

insert into public.salon_hours (salon_id, weekday, open_time, close_time)
values ('20000000-0000-0000-0000-000000000001', 6, time '09:00', time '14:00');

-- Marek: pon–pt z przerwą 13:00–14:00.
insert into public.working_hours (salon_id, staff_id, weekday, start_time, end_time)
select '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', d, time '09:00', time '13:00'
from generate_series(1, 5) as d;
insert into public.working_hours (salon_id, staff_id, weekday, start_time, end_time)
select '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', d, time '14:00', time '18:00'
from generate_series(1, 5) as d;

-- Tomek: pon–sob bez przerwy.
insert into public.working_hours (salon_id, staff_id, weekday, start_time, end_time)
select '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', d, time '10:00', time '18:00'
from generate_series(1, 5) as d;
insert into public.working_hours (salon_id, staff_id, weekday, start_time, end_time)
values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 6, time '09:00', time '14:00');

-- Kasia: wtorki i czwartki.
insert into public.working_hours (salon_id, staff_id, weekday, start_time, end_time)
values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 2, time '09:00', time '17:00'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 4, time '09:00', time '17:00');

-- Kasia na urlopie przez najbliższy tydzień.
insert into public.schedule_exceptions (salon_id, staff_id, exception_type, starts_on, ends_on, reason)
values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003',
        'day_off', current_date + 1, current_date + 7, 'Urlop');

-- Marek ma jutro godzinną przerwę na dostawę.
insert into public.time_blocks (salon_id, staff_id, starts_at, ends_at, reason)
values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
        ((current_date + 1) + time '11:00') at time zone 'Europe/Warsaw',
        ((current_date + 1) + time '12:00') at time zone 'Europe/Warsaw',
        'Dostawa towaru');

-- ---------------------------------------------------------------------------
-- Klienci
-- ---------------------------------------------------------------------------

insert into public.clients (id, salon_id, first_name, last_name, email, phone, internal_note, no_show_count) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'Jan', 'Nowak', 'jan.nowak@example.test', '+48 600 100 100', 'Lubi krótko po bokach', 0),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   'Piotr', 'Zieliński', 'piotr.z@example.test', '+48 600 200 200', null, 1),
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
   'Anna', 'Lewandowska', 'anna.l@example.test', '+48 600 300 300', null, 0);

-- ---------------------------------------------------------------------------
-- Rezerwacje
-- ---------------------------------------------------------------------------

-- Dzisiaj 10:00 u Marka — potwierdzona, strzyżenie.
insert into public.bookings (id, salon_id, staff_id, client_id, starts_at, ends_at, buffer_after_minutes, status, total_price_grosz, source)
values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
        (current_date + time '10:00') at time zone 'Europe/Warsaw',
        (current_date + time '10:45') at time zone 'Europe/Warsaw',
        5, 'confirmed', 8000, 'web');

insert into public.booking_items (salon_id, booking_id, service_id, item_order, name_snapshot, price_grosz, duration_minutes, buffer_after_minutes)
values ('20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000001', 1, 'Strzyżenie męskie', 8000, 45, 5);

-- Dzisiaj 12:00 u Tomka — czeka na akceptację, strzyżenie + broda (dwie pozycje).
insert into public.bookings (id, salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
values ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002',
        (current_date + time '12:00') at time zone 'Europe/Warsaw',
        (current_date + time '13:10') at time zone 'Europe/Warsaw',
        'pending_approval', 12000, 'web');

insert into public.booking_items (salon_id, booking_id, service_id, item_order, name_snapshot, price_grosz, duration_minutes, buffer_after_minutes)
values
  ('20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002',
   '50000000-0000-0000-0000-000000000001', 1, 'Strzyżenie męskie', 7000, 40, 0),
  ('20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002',
   '50000000-0000-0000-0000-000000000002', 2, 'Broda', 5000, 30, 5);

-- Jutro 15:00 u Marka — niepotwierdzona, blokuje slot czasowo.
insert into public.bookings (id, salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source, manage_token_hash, manage_token_expires_at)
values ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
        ((current_date + 1) + time '15:00') at time zone 'Europe/Warsaw',
        ((current_date + 1) + time '15:45') at time zone 'Europe/Warsaw',
        'pending_confirmation', 8000, 'web',
        encode(digest('token-testowy', 'sha256'), 'hex'), now() + interval '20 minutes');

insert into public.booking_items (salon_id, booking_id, service_id, item_order, name_snapshot, price_grosz, duration_minutes, buffer_after_minutes)
values ('20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003',
        '50000000-0000-0000-0000-000000000001', 1, 'Strzyżenie męskie', 8000, 45, 5);

-- Wczoraj u Tomka — zrealizowana.
insert into public.bookings (id, salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
values ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001',
        ((current_date - 1) + time '11:00') at time zone 'Europe/Warsaw',
        ((current_date - 1) + time '11:40') at time zone 'Europe/Warsaw',
        'completed', 7000, 'manual');

insert into public.booking_items (salon_id, booking_id, service_id, item_order, name_snapshot, price_grosz, duration_minutes, buffer_after_minutes)
values ('20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004',
        '50000000-0000-0000-0000-000000000001', 1, 'Strzyżenie męskie', 7000, 40, 0);

-- Rezerwacja w obcym salonie — służy do sprawdzenia, że nie widzi jej nikt z Barbershopu.
insert into public.clients (id, salon_id, first_name, email, phone)
values ('60000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002',
        'Klient Obcy', 'obcy.klient@example.test', '+48 601 000 000');

insert into public.bookings (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
values ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000009',
        '60000000-0000-0000-0000-000000000009',
        (current_date + time '09:00') at time zone 'Europe/Warsaw',
        (current_date + time '09:30') at time zone 'Europe/Warsaw',
        'confirmed', 5000, 'web');
