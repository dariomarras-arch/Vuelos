-- ============================================================================
-- FLIGHT HUNTER — Supabase / PostgreSQL schema (v2 — efficient search engine)
-- ============================================================================
-- Run this once against a fresh Supabase project (SQL editor, or
-- `supabase db push` / psql). It is idempotent-ish (uses IF NOT EXISTS /
-- CREATE OR REPLACE where possible) so it can be re-run safely during setup.
--
-- v2 changes vs. the original schema:
--   * flight_searches: `children` (int) -> `children_ages` (int[]), because
--     real fares are priced per passenger AGE, not per headcount.
--     `baggage` -> `baggage_requirement` (it's a post-search filter now,
--     never a provider query param — see the provider audit). Added
--     request-budget and cache-TTL columns. `schedule_mode` now also
--     allows 'strict'.
--   * search_runs: added request-efficiency telemetry columns.
--   * flight_results: the flat baggage/price columns became JSONB
--     (`passengers`, `baggage`, `price`, `booking`) because they're now
--     structured breakdowns, not single values — `effective_price` and
--     `currency` stay as real columns so they can still be indexed/queried
--     directly. Added `expires_at` (offers are ephemeral).
--   * flight_price_history: same baggage/passenger JSONB treatment, dropped
--     the granular fee columns (kept only on flight_results — history only
--     needs the bottom-line `effective_price` + `pricing_breakdown_available`).
--   * alerts: `price_per_pax` + `passengers` (int) -> `passengers` (jsonb) +
--     `total_price` + `adult_price` + `child_prices`.
--   * new tables: `provider_cache` (dedup layer) and `request_log` (backs
--     the request budget + the API Usage dashboard).
--
-- Design notes carried over from v1:
--   * `users` mirrors `auth.users` (Supabase Auth) with a 1:1 profile row.
--   * `flight_price_history` is intentionally NOT foreign-keyed to
--     `flight_searches.id`: history is aggregated per route, and
--     backfilled/seeded rows use a synthetic "seed" tag.
--   * Every price component a provider might not return stays nullable —
--     the application renders "no informado" rather than assuming a value.
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
  children_ages int[] not null default '{}',
  baggage_requirement text not null check (baggage_requirement in ('none', 'carry_on', 'checked_1', 'checked_multiple')),
  max_stops smallint not null check (max_stops in (0, 1, 2)),

  target_price numeric(10, 2) not null check (target_price >= 0),
  max_price numeric(10, 2) not null check (max_price >= target_price),
  currency text not null check (currency in ('USD', 'ARS')),

  schedule_mode text not null default 'any' check (schedule_mode in ('any', 'preferred', 'strict')),
  departure_preferred_slots text[],
  return_preferred_slots text[],

  max_requests_per_run int not null default 100 check (max_requests_per_run > 0),
  max_requests_per_day int not null default 300 check (max_requests_per_day > 0),
  cache_ttl_hours int not null default 12 check (cache_ttl_hours in (6, 12, 24)),

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
  error_message text,

  requests_used int not null default 0,
  cache_hits int not null default 0,
  errors_by_code jsonb not null default '{}',
  budget_exhausted boolean not null default false
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

  passengers jsonb not null, -- PassengerConfig { adults, childrenAges }
  baggage jsonb not null,    -- BaggageAllowance { included, checkedBags, carryOnIncluded, addCost } — attribute of the offer
  price jsonb not null,      -- PriceBreakdown { passengers: PassengerPriceBreakdown, fees, baggageCost, otherCharges, effectivePrice, currency }

  effective_price numeric(10, 2) not null, -- denormalized from price.effectivePrice for indexing/queries
  currency text not null,

  source text not null,
  booking jsonb not null,   -- BookingInfo { type, url? | offerId? }
  expires_at timestamptz,   -- offers are ephemeral; null = provider gave no expiry

  found_at timestamptz not null default now()
);

create index if not exists idx_flight_results_search on public.flight_results (search_id, found_at desc);
create index if not exists idx_flight_results_run on public.flight_results (search_run_id);
create index if not exists idx_flight_results_route on public.flight_results (origin, destination);

-- ----------------------------------------------------------------------------
-- flight_price_history — permanent, append-only market observations
-- (MarketObservation is persisted here rather than in a separate table —
-- see src/lib/types.ts for the rationale)
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
  baggage jsonb not null,      -- BaggageAllowance
  passengers jsonb not null,   -- PassengerConfig this observation's price applies to

  pricing_breakdown_available boolean not null default false,
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

  passengers jsonb not null, -- PassengerConfig
  total_price numeric(10, 2) not null,
  pricing_breakdown_available boolean not null default false,
  adult_price numeric(10, 2),
  child_prices numeric(10, 2)[],
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
-- provider_cache — dedup layer keyed by a canonical query signature
-- (spec §5-6: "si se buscó EZE→MIA 16/11 hace menos de X horas, no volver a
-- consultar salvo que haya expirado el TTL o el usuario fuerce refresh")
-- ----------------------------------------------------------------------------
create table if not exists public.provider_cache (
  key text primary key,
  endpoint text not null check (endpoint in ('searchFlights', 'getPriceCalendar', 'getFlightDetails', 'getPriceHistory')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_provider_cache_expires on public.provider_cache (expires_at);

-- ----------------------------------------------------------------------------
-- request_log — one row per attempted provider call (cache hit, success or
-- error). Backs the request budget, cache-hit stats and the API Usage
-- dashboard from a single source of truth.
-- ----------------------------------------------------------------------------
create table if not exists public.request_log (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches (id) on delete cascade,
  search_run_id uuid references public.search_runs (id) on delete set null,
  "timestamp" timestamptz not null default now(),
  endpoint text not null check (endpoint in ('searchFlights', 'getPriceCalendar', 'getFlightDetails', 'getPriceHistory')),
  outcome text not null check (outcome in ('success', 'error', 'cache_hit')),
  error_code text check (error_code in ('RATE_LIMITED', 'TIMEOUT', 'INVALID_ROUTE', 'AUTHENTICATION', 'QUOTA_EXCEEDED', 'PROVIDER_ERROR', 'UNKNOWN')),
  cache_key text
);

create index if not exists idx_request_log_search_time on public.request_log (search_id, "timestamp" desc);

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
alter table public.provider_cache enable row level security;
alter table public.request_log enable row level security;
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

-- search_runs / flight_results / notification_settings / alerts / request_log:
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

drop policy if exists "request_log_owner" on public.request_log;
create policy "request_log_owner" on public.request_log
  for all using (
    exists (select 1 from public.flight_searches fs where fs.id = search_id and fs.user_id = auth.uid())
  );

-- flight_price_history / provider_cache: shared market data — any
-- authenticated user can read it, writes only ever come from the backend
-- using the service role key (which bypasses RLS).
drop policy if exists "price_history_read" on public.flight_price_history;
create policy "price_history_read" on public.flight_price_history
  for select using (auth.role() = 'authenticated');

drop policy if exists "provider_cache_read" on public.provider_cache;
create policy "provider_cache_read" on public.provider_cache
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
