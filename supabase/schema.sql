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

create table if not exists public.vehicle_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  employee_name text not null,
  employee_id text not null,
  from_vehicle_plate text not null,
  from_vehicle_km double precision not null,
  to_vehicle_plate text not null,
  to_vehicle_km double precision not null,
  recorded_at timestamptz not null,
  local_date text not null,
  local_time text not null,
  latitude double precision,
  longitude double precision,
  location_label text,
  created_at timestamptz not null default now()
);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  address text not null,
  stop_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.time_records add column if not exists vehicle_plate text;
alter table public.time_records add column if not exists vehicle_km double precision;
alter table public.time_records add column if not exists client_request_id text unique;
alter table public.vehicles add column if not exists description text;
alter table public.vehicles add column if not exists initial_km double precision not null default 0;
alter table public.vehicles add column if not exists current_km double precision not null default 0;

create index if not exists idx_time_records_user_id on public.time_records (user_id);
create index if not exists idx_time_records_recorded_at on public.time_records (recorded_at desc);
create index if not exists idx_vehicles_plate on public.vehicles (plate);
create index if not exists idx_vehicle_transfers_user_id on public.vehicle_transfers (user_id);
create index if not exists idx_vehicle_transfers_recorded_at on public.vehicle_transfers (recorded_at desc);
create index if not exists idx_routes_city on public.routes (city);
create index if not exists idx_route_stops_route_id on public.route_stops (route_id);
create index if not exists idx_route_stops_stop_order on public.route_stops (route_id, stop_order);
