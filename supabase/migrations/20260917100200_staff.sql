-- Fryzjerzy. Pracownik może istnieć bez konta — właściciel dodaje go i prowadzi
-- jego kalendarz, a konto podpina się później przez zaproszenie.

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  photo_url text,
  bio text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Jedno konto = najwyżej jeden wpis fryzjera w danym salonie.
  unique (salon_id, user_id)
);

create index staff_salon_idx on public.staff (salon_id) where active;
create index staff_user_idx on public.staff (user_id);

create trigger staff_set_updated_at
  before update on public.staff
  for each row execute function public.tg_set_updated_at();

comment on column public.staff.user_id is
  'Konto użytkownika. Puste = pracownik bez konta, kalendarz prowadzi właściciel.';

-- Zaproszenie pracownika do salonu. Token jednorazowy, z datą ważności.
create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade,
  email text not null,
  role public.salon_role not null default 'staff',
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_invitations_salon_idx on public.staff_invitations (salon_id);

create trigger staff_invitations_set_updated_at
  before update on public.staff_invitations
  for each row execute function public.tg_set_updated_at();

comment on column public.staff_invitations.token_hash is
  'Skrót tokenu, nie sam token. Wysłany mailem token nie da się odtworzyć z bazy.';

-- Który wpis fryzjera odpowiada zalogowanemu użytkownikowi w danym salonie.
create or replace function public.current_staff_id(p_salon_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id from public.staff s
  where s.salon_id = p_salon_id and s.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_staff_id(uuid) to authenticated;

alter table public.staff enable row level security;
alter table public.staff_invitations enable row level security;

-- Cały zespół widzi cały zespół (potrzebne do umawiania klientów u innych).
create policy staff_select on public.staff
  for select to authenticated
  using (public.is_salon_member(salon_id) or public.is_app_admin());

create policy staff_write_owner on public.staff
  for all to authenticated
  using (public.is_salon_owner(salon_id))
  with check (public.is_salon_owner(salon_id));

-- Pracownik może poprawić własny opis i zdjęcie.
create policy staff_update_self on public.staff
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy staff_invitations_owner on public.staff_invitations
  for all to authenticated
  using (public.is_salon_owner(salon_id) or public.is_app_admin())
  with check (public.is_salon_owner(salon_id) or public.is_app_admin());
