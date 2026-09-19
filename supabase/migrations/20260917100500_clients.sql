-- Klienci salonu. Konto nie jest wymagane — wystarczy imię, mail i telefon.
-- Klient może założyć konto (mail, Google, Apple) i wtedy widzi swoje wizyty.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text,
  email text not null check (position('@' in email) > 1),
  phone text not null check (length(trim(phone)) >= 6),
  internal_note text,
  no_show_count integer not null default 0 check (no_show_count >= 0),
  blocked boolean not null default false,
  -- Poza zakresem MVP, miejsce w modelu jest.
  sms_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deduplikacja po mailu w obrębie salonu, bez względu na wielkość liter.
create unique index clients_salon_email_idx on public.clients (salon_id, lower(email));
create index clients_user_idx on public.clients (user_id);
create index clients_phone_idx on public.clients (salon_id, phone);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.tg_set_updated_at();

comment on column public.clients.internal_note is
  'Notatka widoczna wyłącznie dla zespołu salonu, nigdy dla klienta.';

alter table public.clients enable row level security;

-- Cały zespół obsługuje klientów salonu.
create policy clients_select on public.clients
  for select to authenticated
  using (public.is_salon_member(salon_id) or user_id = auth.uid());

create policy clients_write on public.clients
  for all to authenticated
  using (public.is_salon_member(salon_id))
  with check (public.is_salon_member(salon_id));
