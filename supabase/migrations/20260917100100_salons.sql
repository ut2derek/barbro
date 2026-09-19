-- Salon (klient SaaS), przypisania użytkowników i administratorzy platformy.
-- Tu powstają funkcje pomocnicze, na których opierają się wszystkie reguły RLS.

create table public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  logo_url text,
  brand_color text check (brand_color ~* '^#[0-9a-f]{6}$'),
  address_line text,
  postal_code text,
  city text,
  phone text,
  email text,
  timezone text not null default 'Europe/Warsaw',

  -- Ustawienia rezerwacji
  auto_accept boolean not null default false,
  hold_minutes integer not null default 20 check (hold_minutes between 5 and 120),
  min_lead_minutes integer not null default 120 check (min_lead_minutes >= 0),
  booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365),
  slot_step_minutes integer not null default 15 check (slot_step_minutes in (5, 10, 15, 20, 30, 60)),
  client_cancel_lead_hours integer not null default 12 check (client_cancel_lead_hours >= 0),
  cancellation_policy_text text,
  online_booking_enabled boolean not null default true,
  calendar_event_title_template text not null default '{usluga} — {klient}',

  -- Włączenie/wyłączenie salonu przez administratora platformy
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.salons is 'Salon = jeden klient SaaS. Wszystkie dane izolowane przez salon_id.';
comment on column public.salons.hold_minutes is 'Jak długo niepotwierdzona rezerwacja blokuje slot.';
comment on column public.salons.min_lead_minutes is 'Minimalne wyprzedzenie rezerwacji w minutach.';
comment on column public.salons.booking_horizon_days is 'Jak daleko w przyszłość można rezerwować.';

create trigger salons_set_updated_at
  before update on public.salons
  for each row execute function public.tg_set_updated_at();

-- Przypisanie konta użytkownika do salonu wraz z rolą.
create table public.salon_members (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.salon_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, user_id)
);

create index salon_members_user_idx on public.salon_members (user_id);

create trigger salon_members_set_updated_at
  before update on public.salon_members
  for each row execute function public.tg_set_updated_at();

-- Administratorzy platformy (my). Jedyna tabela poza modelem salonu.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.app_admins is
  'Konta administratora platformy. Zakładanie salonów, podgląd listy, włączanie i wyłączanie.';

-- ---------------------------------------------------------------------------
-- Funkcje pomocnicze dla RLS.
-- SECURITY DEFINER, bo pytają o tabele, które same są chronione przez RLS —
-- bez tego reguły odwoływałyby się rekurencyjnie do samych siebie.
-- ---------------------------------------------------------------------------

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

create or replace function public.is_salon_member(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.salon_members m
    where m.salon_id = p_salon_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_salon_owner(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.salon_members m
    where m.salon_id = p_salon_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.is_salon_member(uuid) to authenticated;
grant execute on function public.is_salon_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.salons enable row level security;
alter table public.salon_members enable row level security;
alter table public.app_admins enable row level security;

-- Salon widzi tylko jego zespół (i administrator platformy).
create policy salons_select on public.salons
  for select to authenticated
  using (public.is_salon_member(id) or public.is_app_admin());

-- Zakładanie salonów wyłącznie przez administratora platformy —
-- nie ma samoobsługowej rejestracji firm.
create policy salons_insert on public.salons
  for insert to authenticated
  with check (public.is_app_admin());

create policy salons_update on public.salons
  for update to authenticated
  using (public.is_salon_owner(id) or public.is_app_admin())
  with check (public.is_salon_owner(id) or public.is_app_admin());

create policy salons_delete on public.salons
  for delete to authenticated
  using (public.is_app_admin());

create policy salon_members_select on public.salon_members
  for select to authenticated
  using (public.is_salon_member(salon_id) or public.is_app_admin());

create policy salon_members_write on public.salon_members
  for all to authenticated
  using (public.is_salon_owner(salon_id) or public.is_app_admin())
  with check (public.is_salon_owner(salon_id) or public.is_app_admin());

-- Administrator platformy widzi wyłącznie własny wiersz; nikt inny nie widzi nic.
create policy app_admins_select on public.app_admins
  for select to authenticated
  using (user_id = auth.uid());