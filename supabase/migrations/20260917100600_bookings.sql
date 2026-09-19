-- Rezerwacje. Jedna wizyta może obejmować kilka usług (pozycje w booking_items).
-- Podwójna rezerwacja jest niemożliwa na poziomie bazy, nie tylko w aplikacji.

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,

  starts_at timestamptz not null,
  -- Koniec samej wizyty — to widzi klient i to pokazuje kalendarz.
  ends_at timestamptz not null,
  -- Przerwa po ostatniej usłudze, skopiowana przy tworzeniu rezerwacji.
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  -- Czas faktycznie zajęty: wizyta razem z przerwą po niej. Na tym zakresie
  -- działa blokada nakładania, więc przerwy pilnuje baza, a nie aplikacja.
  -- Zakres domknięty z lewej i otwarty z prawej, więc wizyty 10:00–11:00
  -- i 11:00–12:00 nie kolidują ze sobą.
  -- Wypełnia go wyzwalacz poniżej; wartość podana z aplikacji jest nadpisywana.
  time_range tstzrange not null,

  status public.booking_status not null default 'pending_confirmation',
  -- Cena zapisana w momencie rezerwacji; nigdy się nie zmienia.
  total_price_grosz integer not null default 0 check (total_price_grosz >= 0),
  source public.booking_source not null default 'manual',

  client_note text,
  cancellation_comment text,

  -- Jednorazowy token do zarządzania wizytą przez klienta bez konta.
  manage_token_hash text unique,
  manage_token_expires_at timestamptz,

  -- Przy przełożeniu: wskazanie na poprzedni termin.
  previous_booking_id uuid references public.bookings (id) on delete set null,

  google_event_id text,
  google_synced_at timestamptz,

  -- Poza zakresem MVP, miejsce w modelu jest.
  deposit_grosz integer check (deposit_grosz >= 0),

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_order check (ends_at > starts_at),
  -- Anulowanie przez salon zawsze wymaga komentarza.
  constraint bookings_salon_cancel_comment check (
    status <> 'cancelled_by_salon'
    or (cancellation_comment is not null and length(trim(cancellation_comment)) > 0)
  )
);

-- Zajęty czas liczy baza, nie aplikacja. Dodawanie minut do znacznika czasu
-- nie jest w Postgresie wyrażeniem stałym, więc nie może to być kolumna
-- wyliczana — stąd wyzwalacz.
create or replace function public.tg_booking_time_range()
returns trigger
language plpgsql
as $$
begin
  new.time_range := tstzrange(
    new.starts_at,
    new.ends_at + make_interval(mins => coalesce(new.buffer_after_minutes, 0)),
    '[)'
  );
  return new;
end;
$$;

create trigger bookings_set_time_range
  before insert or update of starts_at, ends_at, buffer_after_minutes on public.bookings
  for each row execute function public.tg_booking_time_range();

-- SERCE OCHRONY PRZED PODWÓJNĄ REZERWACJĄ.
-- Ten sam fryzjer nie może mieć dwóch nakładających się wizyt w statusach
-- blokujących slot. Baza odrzuci taką operację niezależnie od tego, co zrobi
-- aplikacja mobilna czy strona rezerwacji.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    staff_id with =,
    time_range with &&
  )
  where (status in ('pending_confirmation', 'pending_approval', 'confirmed', 'completed'));

create index bookings_salon_start_idx on public.bookings (salon_id, starts_at);
create index bookings_staff_start_idx on public.bookings (staff_id, starts_at);
create index bookings_client_idx on public.bookings (client_id);
create index bookings_status_idx on public.bookings (status, starts_at);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.tg_set_updated_at();

comment on constraint bookings_no_overlap on public.bookings is
  'Blokada podwójnej rezerwacji: jeden fryzjer = jedna wizyta w danym momencie.';
comment on column public.bookings.manage_token_hash is
  'Skrót tokenu z maila. Sam token istnieje wyłącznie w wysłanej wiadomości.';

-- Pozycje rezerwacji: nazwa, cena i czas skopiowane w momencie rezerwacji.
create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  item_order smallint not null default 1 check (item_order >= 1),
  name_snapshot text not null,
  price_grosz integer not null check (price_grosz >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  created_at timestamptz not null default now(),
  unique (booking_id, item_order)
);

create index booking_items_booking_idx on public.booking_items (booking_id);

comment on table public.booking_items is
  'Usługi w ramach jednej wizyty. Czas wizyty = suma czasów pozycji, przerwa po ostatniej.';

-- Pełna historia zmian statusu: kto, kiedy, z czego na co, z jakim komentarzem.
create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  comment text,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index booking_status_history_booking_idx
  on public.booking_status_history (booking_id, created_at);

create or replace function public.tg_record_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_status_history (salon_id, booking_id, from_status, to_status, comment, changed_by)
    values (new.salon_id, new.id, null, new.status, null, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.booking_status_history (salon_id, booking_id, from_status, to_status, comment, changed_by)
    values (new.salon_id, new.id, old.status, new.status, new.cancellation_comment, auth.uid());
  end if;
  return new;
end;
$$;

create trigger bookings_record_status
  after insert or update of status on public.bookings
  for each row execute function public.tg_record_booking_status();

-- ---------------------------------------------------------------------------
-- RLS: kalendarz całego salonu widzi cały zespół; edytuje właściciel
-- albo fryzjer, którego wizyta dotyczy. Klient z kontem widzi swoje wizyty.
-- Nikt nie usuwa rezerwacji — służą do tego statusy.
-- ---------------------------------------------------------------------------

alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_status_history enable row level security;

create policy bookings_select on public.bookings
  for select to authenticated
  using (
    public.is_salon_member(salon_id)
    or exists (
      select 1 from public.clients c
      where c.id = bookings.client_id and c.user_id = auth.uid()
    )
  );

create policy bookings_insert on public.bookings
  for insert to authenticated
  with check (public.is_salon_member(salon_id));

create policy bookings_update on public.bookings
  for update to authenticated
  using (
    public.is_salon_owner(salon_id)
    or staff_id = public.current_staff_id(salon_id)
  )
  with check (
    public.is_salon_owner(salon_id)
    or staff_id = public.current_staff_id(salon_id)
  );

create policy booking_items_select on public.booking_items
  for select to authenticated
  using (
    public.is_salon_member(salon_id)
    or exists (
      select 1 from public.bookings b
      join public.clients c on c.id = b.client_id
      where b.id = booking_items.booking_id and c.user_id = auth.uid()
    )
  );

create policy booking_items_write on public.booking_items
  for all to authenticated
  using (public.is_salon_member(salon_id))
  with check (public.is_salon_member(salon_id));

create policy booking_status_history_select on public.booking_status_history
  for select to authenticated
  using (public.is_salon_member(salon_id));
