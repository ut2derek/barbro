-- ---------------------------------------------------------------------------
-- ZDJĘCIA PRZY WIZYCIE
--
-- Efekt pracy przy konkretnej wizycie: „tak wyszło”, „tak było przed”. Dodaje
-- je zespół salonu ze swojego telefonu, ogląda wyłącznie zespół salonu —
-- klient nie widzi ich nigdzie, tak samo jak notatki salonu.
--
-- Same pliki leżą w prywatnym koszyku `booking-photos`, a w bazie trzymamy
-- tylko ścieżkę. Adres do wyświetlenia aplikacja bierze na chwilę
-- (podpisany link), więc plik nie daje się otworzyć z zewnątrz.
--
-- Ścieżka ma kształt `<salon_id>/<booking_id>/<nazwa>` i to pierwszy człon
-- decyduje o dostępie do pliku. Dzięki temu regułę dostępu do koszyka da się
-- zapisać tak samo jak każdą inną: „czy pytający należy do tego salonu”.
-- ---------------------------------------------------------------------------

create table public.booking_photos (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- Ścieżka w koszyku. Unikalna, bo dwa wpisy na ten sam plik oznaczałyby, że
  -- skasowanie jednego zabiera zdjęcie drugiemu.
  storage_path text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index booking_photos_booking_idx on public.booking_photos (booking_id, created_at);
create index booking_photos_salon_idx on public.booking_photos (salon_id);

create trigger booking_photos_set_updated_at
  before update on public.booking_photos
  for each row execute function public.tg_set_updated_at();

comment on table public.booking_photos is
  'Zdjęcia przypięte do wizyty. Widzi je wyłącznie zespół salonu.';

/**
 * Salon bierze się z wizyty, nie z tego, co przysłała aplikacja — inaczej dało
 * by się podpiąć zdjęcie pod cudzą wizytę, podając swoje `salon_id`.
 *
 * Tu pilnujemy też kształtu ścieżki: musi zaczynać się od salonu i wizyty,
 * bo na tym opiera się dostęp do pliku w koszyku.
 */
create or replace function public.tg_check_booking_photo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_salon_id uuid;
begin
  select b.salon_id into v_salon_id from public.bookings b where b.id = new.booking_id;

  if v_salon_id is null then
    raise exception 'Nie znaleziono wizyty' using errcode = 'P0006';
  end if;

  new.salon_id := v_salon_id;

  if new.storage_path <> v_salon_id::text || '/' || new.booking_id::text || '/'
       || split_part(new.storage_path, '/', 3)
     or split_part(new.storage_path, '/', 3) = ''
  then
    raise exception 'Ścieżka zdjęcia musi zaczynać się od salonu i wizyty'
      using errcode = 'P0012';
  end if;

  return new;
end;
$$;

create trigger booking_photos_check_booking
  before insert on public.booking_photos
  for each row execute function public.tg_check_booking_photo();

-- Plik kasuje aplikacja przez Storage API, zaraz po skasowaniu wpisu. Z bazy
-- zrobić się tego nie da: Supabase blokuje kasowanie wprost w `storage.objects`
-- (wyzwalacz `protect_delete`), bo zniknąłby wpis, a plik zostałby na dysku.
--
-- Skutek uboczny: skasowanie wizyty albo klienta zabiera wpisy o zdjęciach
-- (kaskada), ale same pliki zostają w koszyku jako sieroty. Do usuwania ich
-- potrzeba zadania po stronie serwera, które umie wołać Storage API —
-- dopisujemy je razem z funkcjami brzegowymi (Etap 9).

alter table public.booking_photos enable row level security;

-- Zdjęcia widzi cały zespół salonu — tak jak kalendarz.
create policy booking_photos_select on public.booking_photos
  for select to authenticated
  using (public.is_salon_member(salon_id));

-- Dodaje i kasuje właściciel albo fryzjer, do którego wizyta należy.
-- Ta sama zasada, co przy zmianie samej wizyty.
create policy booking_photos_insert on public.booking_photos
  for insert to authenticated
  with check (
    public.is_salon_member(salon_id)
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (
          public.is_salon_owner(b.salon_id)
          or b.staff_id = public.current_staff_id(b.salon_id)
        )
    )
  );

create policy booking_photos_delete on public.booking_photos
  for delete to authenticated
  using (
    public.is_salon_member(salon_id)
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (
          public.is_salon_owner(b.salon_id)
          or b.staff_id = public.current_staff_id(b.salon_id)
        )
    )
  );

-- Zdjęcia się nie zmienia: nowe wchodzi jako nowe, stare się kasuje.
-- Dlatego nie ma polityki `update`.

-- ---------------------------------------------------------------------------
-- Koszyk na pliki
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-photos',
  'booking-photos',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

/**
 * Salon z pierwszego członu ścieżki. `null`, gdy ścieżka ma inny kształt —
 * wtedy reguła nikogo nie wpuści, zamiast wywrócić się na rzutowaniu tekstu,
 * który nie jest identyfikatorem.
 */
create or replace function public.storage_path_salon_id(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then split_part(p_name, '/', 1)::uuid
  end;
$$;

grant execute on function public.storage_path_salon_id(text) to authenticated;

create policy booking_photos_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booking-photos'
    and public.is_salon_member(public.storage_path_salon_id(name))
  );

create policy booking_photos_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-photos'
    and public.is_salon_member(public.storage_path_salon_id(name))
  );

create policy booking_photos_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'booking-photos'
    and public.is_salon_member(public.storage_path_salon_id(name))
  );
