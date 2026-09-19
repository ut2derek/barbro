-- Usługi, ich przypisanie do fryzjerów i historia cen.
-- Historia cen jest wymogiem prawnym: przy promocji trzeba pokazać najniższą
-- cenę z 30 dni przed obniżką.

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_categories_salon_idx on public.service_categories (salon_id);

create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row execute function public.tg_set_updated_at();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  category_id uuid references public.service_categories (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  description text,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 240),
  -- Wszystkie kwoty w groszach, zawsze liczby całkowite.
  price_grosz integer not null check (price_grosz >= 0),
  price_type public.price_type not null default 'fixed',
  promo_price_grosz integer check (promo_price_grosz >= 0),
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  photo_url text,
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Promocja albo jest kompletna, albo jej nie ma.
  constraint services_promo_complete check (
    (promo_price_grosz is null and promo_starts_at is null and promo_ends_at is null)
    or (promo_price_grosz is not null and promo_starts_at is not null and promo_ends_at is not null)
  ),
  constraint services_promo_range check (promo_ends_at is null or promo_ends_at > promo_starts_at),
  constraint services_promo_lower check (promo_price_grosz is null or promo_price_grosz < price_grosz)
);

create index services_salon_idx on public.services (salon_id) where visible;
create index services_category_idx on public.services (category_id);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.tg_set_updated_at();

-- Przypisanie usługi do fryzjera z opcjonalnym nadpisaniem ceny i czasu.
-- Usługa bez przypisania nie jest u nikogo dostępna.
create table public.staff_services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  price_grosz_override integer check (price_grosz_override >= 0),
  duration_minutes_override integer check (duration_minutes_override between 5 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, service_id)
);

create index staff_services_service_idx on public.staff_services (service_id);
create index staff_services_salon_idx on public.staff_services (salon_id);

create trigger staff_services_set_updated_at
  before update on public.staff_services
  for each row execute function public.tg_set_updated_at();

-- Historia cen. Wypełniana wyzwalaczem, nigdy ręcznie z aplikacji.
create table public.service_price_history (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  price_grosz integer not null check (price_grosz >= 0),
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index service_price_history_lookup_idx
  on public.service_price_history (service_id, effective_from desc);

comment on table public.service_price_history is
  'Każda zmiana ceny podstawowej. Podstawa do wyliczenia najniższej ceny z 30 dni przed obniżką.';

create or replace function public.tg_record_service_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.price_grosz is distinct from old.price_grosz then
    insert into public.service_price_history (salon_id, service_id, price_grosz)
    values (new.salon_id, new.id, new.price_grosz);
  end if;
  return new;
end;
$$;

create trigger services_record_price
  after insert or update of price_grosz on public.services
  for each row execute function public.tg_record_service_price();

-- ---------------------------------------------------------------------------
-- RLS: cennik czyta cały zespół, zmienia tylko właściciel.
-- ---------------------------------------------------------------------------

alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.staff_services enable row level security;
alter table public.service_price_history enable row level security;

create policy service_categories_select on public.service_categories
  for select to authenticated using (public.is_salon_member(salon_id));
create policy service_categories_write on public.service_categories
  for all to authenticated
  using (public.is_salon_owner(salon_id)) with check (public.is_salon_owner(salon_id));

create policy services_select on public.services
  for select to authenticated using (public.is_salon_member(salon_id));
create policy services_write on public.services
  for all to authenticated
  using (public.is_salon_owner(salon_id)) with check (public.is_salon_owner(salon_id));

create policy staff_services_select on public.staff_services
  for select to authenticated using (public.is_salon_member(salon_id));
create policy staff_services_write on public.staff_services
  for all to authenticated
  using (public.is_salon_owner(salon_id)) with check (public.is_salon_owner(salon_id));

-- Historii cen nikt nie edytuje ręcznie — wypełnia ją wyzwalacz.
create policy service_price_history_select on public.service_price_history
  for select to authenticated using (public.is_salon_member(salon_id));