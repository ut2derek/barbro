-- OCENY
--
-- Dwie osobne rzeczy, celowo trzymane osobno:
--
-- 1. Opinia klienta o wizycie — publiczna, widoczna na stronie rezerwacji.
--    Wystawia ją wyłącznie klient, który tę wizytę odbył, swoim jednorazowym
--    linkiem. Salon może odpowiedzieć, ale nie może jej ukryć — inaczej średnia
--    przestaje cokolwiek znaczyć.
--
-- 2. Ocena klienta przez salon — wewnętrzna, widoczna wyłącznie dla zespołu.
--    To dane wrażliwe: klient nigdy ich nie widzi i nie trafiają na stronę.

create table public.booking_reviews (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  -- Jedna opinia na wizytę.
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  salon_reply text,
  salon_replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index booking_reviews_salon_idx on public.booking_reviews (salon_id, created_at desc);
create index booking_reviews_staff_idx on public.booking_reviews (staff_id);

create trigger booking_reviews_set_updated_at
  before update on public.booking_reviews
  for each row execute function public.tg_set_updated_at();

comment on table public.booking_reviews is
  'Publiczna opinia klienta o zrealizowanej wizycie. Salon może odpowiedzieć, nie może ukryć.';

/**
 * Opinia musi dotyczyć wizyty, która się odbyła, i zgadzać się z jej danymi.
 * Pilnujemy tego w bazie, więc żadna droga wejścia — aplikacja, funkcja
 * serwerowa, przyszła strona rezerwacji — tego nie obejdzie.
 */
create or replace function public.tg_check_review_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = new.booking_id;

  if v_booking.id is null then
    raise exception 'Nie znaleziono wizyty' using errcode = 'P0006';
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'Opinię można wystawić dopiero po zrealizowanej wizycie'
      using errcode = 'P0011';
  end if;

  -- Dane opinii biorą się z wizyty, a nie z tego, co przysłał klient.
  new.salon_id := v_booking.salon_id;
  new.staff_id := v_booking.staff_id;
  new.client_id := v_booking.client_id;

  return new;
end;
$$;

create trigger booking_reviews_check_booking
  before insert on public.booking_reviews
  for each row execute function public.tg_check_review_booking();

alter table public.booking_reviews enable row level security;

-- Zespół salonu widzi swoje opinie. Publicznie pokazuje je funkcja serwerowa.
create policy booking_reviews_select on public.booking_reviews
  for select to authenticated using (public.is_salon_member(salon_id));

-- Odpowiedź salonu idzie przez funkcję poniżej, żeby nikt nie podmienił
-- przy okazji oceny ani komentarza klienta.
create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon_id uuid;
begin
  select salon_id into v_salon_id from public.booking_reviews where id = p_review_id;

  if v_salon_id is null then
    raise exception 'Nie znaleziono opinii' using errcode = 'P0012';
  end if;

  if not public.is_salon_member(v_salon_id) then
    raise exception 'Brak uprawnień do tej opinii' using errcode = '42501';
  end if;

  update public.booking_reviews
  set salon_reply = nullif(trim(p_reply), ''),
      salon_replied_at = case when nullif(trim(p_reply), '') is null then null else now() end
  where id = p_review_id;
end;
$$;

grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Średnie ocen — jedno miejsce liczenia dla aplikacji i strony rezerwacji.
-- ---------------------------------------------------------------------------

create or replace function public.salon_rating(p_salon_id uuid)
returns table (average numeric, reviews_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select round(avg(r.rating)::numeric, 2), count(*)::int
  from public.booking_reviews r
  where r.salon_id = p_salon_id;
$$;

create or replace function public.staff_ratings(p_salon_id uuid)
returns table (staff_id uuid, average numeric, reviews_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.staff_id, round(avg(r.rating)::numeric, 2), count(*)::int
  from public.booking_reviews r
  where r.salon_id = p_salon_id and r.staff_id is not null
  group by r.staff_id;
$$;

grant execute on function public.salon_rating(uuid) to authenticated;
grant execute on function public.staff_ratings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ocena klienta przez salon — wyłącznie wewnętrzna
-- ---------------------------------------------------------------------------

alter table public.clients
  add column internal_rating smallint check (internal_rating between 1 and 5);

comment on column public.clients.internal_rating is
  'Ocena rzetelności klienta wystawiona przez salon. Widoczna wyłącznie dla zespołu, nigdy dla klienta.';
