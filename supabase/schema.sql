create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  employee_id text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'employee')),
  created_at timestamptz not null default now()
);

create table if not exists public.time_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  employee_name text not null,
  employee_id text not null,
  action text not null,
  recorded_at timestamptz not null,
  local_date text not null,
  local_time text not null,
  latitude double precision,
  longitude double precision,
  location_label text,
  vehicle_plate text,
  vehicle_km double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,
  description text,
  initial_km double precision not null default 0,
  current_km double precision not null default 0,
  created_at timestamptz not null default now()
);

alter table public.time_records add column if not exists vehicle_plate text;
alter table public.time_records add column if not exists vehicle_km double precision;
alter table public.vehicles add column if not exists description text;
alter table public.vehicles add column if not exists initial_km double precision not null default 0;
alter table public.vehicles add column if not exists current_km double precision not null default 0;

create index if not exists idx_time_records_user_id on public.time_records (user_id);
create index if not exists idx_time_records_recorded_at on public.time_records (recorded_at desc);
create index if not exists idx_vehicles_plate on public.vehicles (plate);
