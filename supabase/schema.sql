-- ============================================================================
-- FLIGHT HUNTER — Supabase / PostgreSQL schema
-- ============================================================================
-- Run this once against a fresh Supabase project (SQL editor, or
-- `supabase db push` / psql). It is idempotent-ish (uses IF NOT EXISTS /
-- CREATE OR REPLACE where possible) so it can be re-run safely during setup.
--
-- Design notes:
--   * `users` mirrors `auth.users` (Supabase Auth) with a 1:1 profile row.
--     The app currently runs with a single demo user (see src/lib/constants
--     DEMO_USER_ID) until real auth is wired up — RLS is already scoped per
--     user so multi-user support is a matter of enabling Supabase Auth on
--     the frontend, not changing the schema.
--   * `flight_price_history` is intentionally NOT foreign-keyed to
--     `flight_searches.search_id`: history is aggregated per route
--     (origin/destination), not per search, and backfilled/seeded rows use
--     a synthetic "seed" tag. It's kept as a plain indexed text column.
--   * Every price component that a provider might not return (fees,
--     baggage_cost) is nullable — the application must render "no
--     informado" rather than assuming 0, per the product spec.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- users — thin profile table over Supabase Auth
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- flight_searches — user-configured monitors
-- ----------------------------------------------------------------------------
create table if not exists public.flight_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,

  origins text[] not null,
  destinations text[] not null,
  allow_nearby_airports boolean not null default false,

  trip_type text not null check (trip_type in ('round_trip', 'one_way')),
  date_from date not null,
  date_to date not null,
  min_nights int not null default 1 check (min_nights > 0),
  max_nights int not null default 1 check (max_nights >= min_nights),
  flexibility_days int not null default 0 check (flexibility_days in (0, 1, 2, 3, 5, 7)),

  adults int not null default 1 check (adults >= 1),
  children int not null default 0 check (children >= 0),
  baggage text not null check (baggage in ('none', 'carry_on', 'checked_1', 'checked_multiple')),
  max_stops smallint not null check (max_stops in (0, 1, 2)),

  target_price numeric(10, 2) not null check (target_price >= 0),
  max_price numeric(10, 2) not null check (max_price >= target_price),
  currency text not null check (currency in ('USD', 'ARS')),

  schedule_mode text not null default 'any' check (schedule_mode in ('any', 'preferred')),
  departure_preferred_slots text[],
  return_preferred_slots text[],

  status text not null default 'active' check (status in ('active', 'paused', 'error')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_error text
);

create index if not exists idx_flight_searches_user on public.flight_searches (user_id);
create index if not exists idx_flight_searches_status on public.flight_searches (status);
create index if not exists idx_flight_searches_next_run on public.flight_searches (next_run_at);

-- ----------------------------------------------------------------------------
-- search_runs — one row per execution of the search engine (cron log)
-- ----------------------------------------------------------------------------
create table if not exists public.search_runs (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches (id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  combinations_analyzed int not null default 0,
  flights_found int not null default 0,
  opportunities_found int not null default 0,
  alerts_sent int not null default 0,
  status text not null check (status in ('success', 'error')),
  error_message text
);

create index if not exists idx_search_runs_search on public.search_runs (search_id, started_at desc);

-- ----------------------------------------------------------------------------
-- flight_results — itineraries found on a given search run
-- ----------------------------------------------------------------------------
create table if not exists public.flight_results (
  id text primary key,
  search_id uuid not null references public.flight_searches (id) on delete cascade,
  search_run_id uuid not null references public.search_runs (id) on delete cascade,

  origin text not null,
  destination text not null,

  outbound jsonb not null, -- FlightLeg
  inbound jsonb,           -- FlightLeg | null (one-way)

  baggage_included boolean not null default false,
  baggage_option text not null,

  base_price numeric(10, 2) not null,
  fees numeric(10, 2),
  baggage_cost numeric(10, 2),
  other_charges numeric(10, 2),
  effective_price numeric(10, 2) not null,
  currency text not null,

  source text not null,
  booking_url text not null,
  found_at timestamptz not null default now()
);

create index if not exists idx_flight_results_search on public.flight_results (search_id, found_at desc);
create index if not exists idx_flight_results_run on public.flight_results (search_run_id);
create index if not exists idx_flight_results_route on public.flight_results (origin, destination);

-- ----------------------------------------------------------------------------
-- flight_price_history — permanent, append-only price observations
-- ----------------------------------------------------------------------------
create table if not exists public.flight_price_history (
  id text primary key,
  "timestamp" timestamptz not null default now(),
  search_id text, -- provenance tag only; see design note above (not a FK)

  origin text not null,
  destination text not null,
  departure_date date not null,
  return_date date,

  airline text not null,
  flight_number text not null,
  departure_time timestamptz not null,
  arrival_time timestamptz not null,
  return_time timestamptz,

  stops smallint not null default 0,
  duration_minutes int not null,
  baggage text not null,

  base_price numeric(10, 2) not null,
  fees numeric(10, 2),
  baggage_cost numeric(10, 2),
  effective_price numeric(10, 2) not null,
  currency text not null,

  source text not null,
  booking_url text
);

create index if not exists idx_price_history_route_time on public.flight_price_history (origin, destination, "timestamp");
create index if not exists idx_price_history_search on public.flight_price_history (search_id);

-- ----------------------------------------------------------------------------
-- notification_settings — per-search, per-channel alert thresholds
-- ----------------------------------------------------------------------------
create table if not exists public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches (id) on delete cascade,
  channel text not null check (channel in ('telegram', 'whatsapp', 'email')),
  enabled boolean not null default false,
  minimum_price numeric(10, 2),
  minimum_drop_percent numeric(5, 2),
  exceptional_only boolean not null default false,
  unique (search_id, channel)
);

-- ----------------------------------------------------------------------------
-- alerts — detected opportunities, deduplicated
-- ----------------------------------------------------------------------------
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches (id) on delete cascade,
  flight_result_id text references public.flight_results (id) on delete set null,
  created_at timestamptz not null default now(),

  origin text not null,
  destination text not null,
  departure_date date not null,
  return_date date,

  price_per_pax numeric(10, 2) not null,
  total_price numeric(10, 2) not null,
  passengers int not null default 1,
  currency text not null,

  average_price numeric(10, 2),
  variation_percent numeric(6, 2),

  level text not null check (level in ('EXCEPCIONAL', 'MUY_INTERESANTE', 'INTERESANTE', 'NORMAL', 'ALTO')),
  passed_rule_ids text[] not null default '{}',
  reason_summary text not null,
  message text not null,

  status text not null check (status in ('sent', 'suppressed_duplicate', 'pending')),
  dedupe_key text not null unique
);

create index if not exists idx_alerts_search on public.alerts (search_id, created_at desc);

-- ----------------------------------------------------------------------------
-- airports / airlines — reference data
-- ----------------------------------------------------------------------------
create table if not exists public.airports (
  iata text primary key,
  name text not null,
  city text not null,
  country text not null,
  group_id text
);

create table if not exists public.airlines (
  code text primary key,
  name text not null
);

-- ============================================================================
-- updated_at trigger for flight_searches
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_flight_searches_updated_at on public.flight_searches;
create trigger trg_flight_searches_updated_at
  before update on public.flight_searches
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.users enable row level security;
alter table public.flight_searches enable row level security;
alter table public.search_runs enable row level security;
alter table public.flight_results enable row level security;
alter table public.flight_price_history enable row level security;
alter table public.notification_settings enable row level security;
alter table public.alerts enable row level security;
alter table public.airports enable row level security;
alter table public.airlines enable row level security;

-- users: can only see/update their own profile row
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- flight_searches: full CRUD on the user's own searches
drop policy if exists "flight_searches_owner" on public.flight_searches;
create policy "flight_searches_owner" on public.flight_searches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- search_runs / flight_results / notification_settings / alerts:
-- readable/writable only through the owning search
drop policy if exists "search_runs_owner" on public.search_runs;
create policy "search_runs_owner" on public.search_runs
  for all using (
    exists (select 1 from public.flight_searches fs where fs.id = search_id and fs.user_id = auth.uid())
  );

drop policy if exists "flight_results_owner" on public.flight_results;
create policy "flight_results_owner" on public.flight_results
  for all using (
    exists (select 1 from public.flight_searches fs where fs.id = search_id and fs.user_id = auth.uid())
  );

drop policy if exists "notification_settings_owner" on public.notification_settings;
create policy "notification_settings_owner" on public.notification_settings
  for all using (
    exists (select 1 from public.flight_searches fs where fs.id = search_id and fs.user_id = auth.uid())
  );

drop policy if exists "alerts_owner" on public.alerts;
create policy "alerts_owner" on public.alerts
  for all using (
    exists (select 1 from public.flight_searches fs where fs.id = search_id and fs.user_id = auth.uid())
  );

-- flight_price_history: shared market data — any authenticated user can
-- read it (it's aggregated by route, not personal), writes are only ever
-- performed by the backend using the service role key (which bypasses RLS).
drop policy if exists "price_history_read" on public.flight_price_history;
create policy "price_history_read" on public.flight_price_history
  for select using (auth.role() = 'authenticated');

-- airports / airlines: public reference data, readable by anyone
-- authenticated; writes are a backend/admin concern only.
drop policy if exists "airports_read" on public.airports;
create policy "airports_read" on public.airports
  for select using (auth.role() = 'authenticated');

drop policy if exists "airlines_read" on public.airlines;
create policy "airlines_read" on public.airlines
  for select using (auth.role() = 'authenticated');

-- ============================================================================
-- Seed reference data (airports / airlines) — safe to re-run
-- ============================================================================
insert into public.airports (iata, name, city, country, group_id) values
  ('EZE', 'Ministro Pistarini', 'Buenos Aires', 'AR', 'BUE'),
  ('AEP', 'Jorge Newbery', 'Buenos Aires', 'AR', 'BUE'),
  ('MIA', 'Miami Intl.', 'Miami', 'US', 'MIA'),
  ('FLL', 'Fort Lauderdale-Hollywood', 'Fort Lauderdale', 'US', 'MIA'),
  ('MCO', 'Orlando Intl.', 'Orlando', 'US', 'ORL'),
  ('SFB', 'Orlando Sanford', 'Orlando', 'US', 'ORL'),
  ('JFK', 'John F. Kennedy Intl.', 'New York', 'US', 'NYC'),
  ('EWR', 'Newark Liberty', 'New York', 'US', 'NYC'),
  ('MAD', 'Adolfo Suárez Madrid-Barajas', 'Madrid', 'ES', null),
  ('GRU', 'Guarulhos', 'São Paulo', 'BR', null),
  ('SCL', 'Arturo Merino Benítez', 'Santiago', 'CL', null),
  ('BOG', 'El Dorado', 'Bogotá', 'CO', null)
on conflict (iata) do nothing;

insert into public.airlines (code, name) values
  ('AA', 'American Airlines'),
  ('LA', 'LATAM Airlines'),
  ('UA', 'United Airlines'),
  ('AR', 'Aerolíneas Argentinas'),
  ('AV', 'Avianca'),
  ('CM', 'Copa Airlines'),
  ('DL', 'Delta Air Lines'),
  ('B6', 'JetBlue Airways')
on conflict (code) do nothing;
