-- Czas pracy: godziny otwarcia salonu, grafik fryzjera, wyjątki i blokady.
-- Dzień tygodnia zapisujemy jako ISO: 1 = poniedziałek … 7 = niedziela,
-- zgodnie z extract(isodow from ...) w Postgresie.

create table public.salon_hours (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  open_time time not null,
  close_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salon_hours_order check (close_time > open_time),
  unique (salon_id, weekday, open_time)
);

create index salon_hours_salon_idx on public.salon_hours (salon_id, weekday);

create trigger salon_hours_set_updated_at
  before update on public.salon_hours
  for each row execute function public.tg_set_updated_at();

comment on table public.salon_hours is
  'Godziny otwarcia salonu. Kilka wierszy na dzień = kilka okien (np. przerwa na lunch).';

-- Grafik tygodniowy fryzjera. Fryzjer nigdy nie pracuje poza godzinami salonu —
-- pilnuje tego funkcja liczenia slotów (część wspólna obu grafików).
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint working_hours_order check (end_time > start_time),
  unique (staff_id, weekday, start_time)
);

create index working_hours_staff_idx on public.working_hours (staff_id, weekday);

create trigger working_hours_set_updated_at
  before update on public.working_hours
  for each row execute function public.tg_set_updated_at();

-- Wyjątki: urlop, dzień wolny, inne godziny. Bez staff_id = dotyczy całego salonu.
create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade,
  exception_type public.schedule_exception_type not null,
  starts_on date not null,
  ends_on date not null,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_exceptions_range check (ends_on >= starts_on),
  -- Inne godziny muszą podać jakie; dzień wolny nie podaje żadnych.
  constraint schedule_exceptions_hours check (
    (exception_type = 'day_off' and start_time is null and end_time is null)
    or (exception_type = 'custom_hours' and start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index schedule_exceptions_lookup_idx
  on public.schedule_exceptions (salon_id, starts_on, ends_on);

create trigger schedule_exceptions_set_updated_at
  before update on public.schedule_exceptions
  for each row execute function public.tg_set_updated_at();

-- Ręczna blokada czasu (np. dostawa, wizyta u lekarza).
create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_blocks_order check (ends_at > starts_at)
);

create index time_blocks_staff_idx on public.time_blocks (staff_id, starts_at);

create trigger time_blocks_set_updated_at
  before update on public.time_blocks
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: grafik widzi cały zespół; zmienia właściciel albo sam zainteresowany.
-- ---------------------------------------------------------------------------

alter table public.salon_hours enable row level security;
alter table public.working_hours enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.time_blocks enable row level security;

create policy salon_hours_select on public.salon_hours
  for select to authenticated using (public.is_salon_member(salon_id));
create policy salon_hours_write on public.salon_hours
  for all to authenticated
  using (public.is_salon_owner(salon_id)) with check (public.is_salon_owner(salon_id));

create policy working_hours_select on public.working_hours
  for select to authenticated using (public.is_salon_member(salon_id));
create policy working_hours_write on public.working_hours
  for all to authenticated
  using (
    public.is_salon_owner(salon_id)
    or staff_id = public.current_staff_id(salon_id)
  )
  with check (
    public.is_salon_owner(salon_id)
    or staff_id = public.current_staff_id(salon_id)
  );

create policy schedule_exceptions_select on public.schedule_exceptions
  for select to authenticated using (public.is_salon_member(salon_id));
create policy schedule_exceptions_write on public.schedule_exceptions
  for all to authenticated
  using (
    public.is_salon_owner(salon_id)
    or (staff_id is not null and staff_id = public.current_staff_id(salon_id))
  )
  with check (
    public.is_salon_owner(salon_id)
    or (staff_id is not null and staff_id = public.current_staff_id(salon_id))
  );

create policy time_blocks_select on public.time_blocks
  for select to authenticated using (public.is_salon_member(salon_id));
create policy time_blocks_write on public.time_blocks
  for all to authenticated
  using (
    public.is_salon_owner(salon_id)
    or staff_id = public.current_staff_id(salon_id)
  )
  with check (
    public.is_salon_owner(salon_id)
    or staff_id = public.current_staff_id(salon_id)
  );
