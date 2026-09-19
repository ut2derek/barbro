-- Integracje: kalendarz Google, powiadomienia push, dziennik maili.

-- Połączenie z kalendarzem Google, jedno na fryzjera.
-- Tokeny trzymamy zaszyfrowane; szyfrowaniem zajmuje się funkcja serwerowa,
-- baza przechowuje wyłącznie zaszyfrowany ciąg.
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  google_account_email text not null,
  google_calendar_id text not null default 'primary',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status public.calendar_connection_status not null default 'connected',
  last_synced_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id)
);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.tg_set_updated_at();

comment on table public.calendar_connections is
  'Synchronizacja jest jednokierunkowa: z systemu do kalendarza Google.';

-- Tokeny urządzeń do powiadomień push.
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.tg_set_updated_at();

-- Dziennik wysyłek maili. idempotency_key gwarantuje, że ponowienie
-- nie wyśle tej samej wiadomości dwa razy.
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references public.salons (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  template text not null,
  recipient text not null,
  idempotency_key text not null unique,
  status public.email_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_log_status_idx on public.email_log (status, created_at);
create index email_log_booking_idx on public.email_log (booking_id);

create trigger email_log_set_updated_at
  before update on public.email_log
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.calendar_connections enable row level security;
alter table public.push_tokens enable row level security;
alter table public.email_log enable row level security;

-- Do własnego połączenia z kalendarzem ma dostęp tylko sam fryzjer.
-- Właściciel może je odłączyć, ale nie czyta cudzych tokenów.
create policy calendar_connections_own on public.calendar_connections
  for all to authenticated
  using (staff_id = public.current_staff_id(salon_id))
  with check (staff_id = public.current_staff_id(salon_id));

create policy calendar_connections_owner_disconnect on public.calendar_connections
  for delete to authenticated
  using (public.is_salon_owner(salon_id));

-- Token urządzenia należy do konkretnego konta.
create policy push_tokens_own on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Dziennik maili to narzędzie diagnostyczne właściciela.
create policy email_log_select on public.email_log
  for select to authenticated
  using (salon_id is not null and public.is_salon_owner(salon_id));
