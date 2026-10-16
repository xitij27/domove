-- Commute routes: start/finish inline on routes, ordered stops in a child table.
--
-- Weekdays decision: native `weekday` enum + `weekday[]` array column with a
-- GIN index. Alternatives considered:
--   * smallint bitmask (0-127) -- compact, but opaque in the Supabase dashboard
--     and PostgREST; every client reimplements encode/decode.
--   * text[] with a CHECK -- readable but no DB-level type safety.
--   * one boolean column per day / junction table -- verbose for a fixed set of 7.
-- The enum array matches the requested model directly, stays readable in the
-- API ('{"monday","wednesday"}'), is type-safe, and supports overlap queries
-- (`where weekdays && '{monday}'`) via the GIN index below.

create extension if not exists postgis with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

create type public.modality as enum ('pedestrian', 'bike', 'car');
create type public.weekday as enum (
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
);

create table public.routes (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null default 'Untitled route',
  start_location extensions.geography(point, 4326) not null,
  finish_location extensions.geography(point, 4326) not null,
  start_label text,
  finish_label text,
  -- time of day only, no date
  start_time time without time zone not null,
  weekdays public.weekday[] not null default '{}',
  modality public.modality not null,
  created_at timestamptz not null default now(),
  constraint routes_weekdays_not_empty check (cardinality(weekdays) between 1 and 7)
);

create index routes_start_location_idx on public.routes using gist (start_location);
create index routes_finish_location_idx on public.routes using gist (finish_location);
create index routes_weekdays_idx on public.routes using gin (weekdays);

-- Ordered intermediate stops. Start/finish stay on routes so list views and
-- two-point proximity queries don't need a join; only the variable-length
-- middle part lives here (arrays of geography can't be spatially indexed
-- per element, hence a child table instead of waypoints[]).
create table public.route_waypoints (
  id uuid primary key default extensions.gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  seq integer not null check (seq >= 0),
  location extensions.geography(point, 4326) not null,
  label text,
  created_at timestamptz not null default now(),
  unique (route_id, seq)
);

create index route_waypoints_route_seq_idx on public.route_waypoints (route_id, seq);
create index route_waypoints_location_idx on public.route_waypoints using gist (location);

alter table public.routes enable row level security;
alter table public.route_waypoints enable row level security;

-- Open read/write for the hackathon demo (the app uses the publishable key
-- with no login yet). Tighten to `to authenticated ... using (auth.uid() = owner_id)`
-- once auth lands.
create policy "Anyone can read routes" on public.routes
  for select to anon, authenticated using (true);
create policy "Anyone can write routes" on public.routes
  for all to anon, authenticated using (true) with check (true);
create policy "Anyone can read route waypoints" on public.route_waypoints
  for select to anon, authenticated using (true);
create policy "Anyone can write route waypoints" on public.route_waypoints
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.routes to anon, authenticated;
grant select, insert, update, delete on public.route_waypoints to anon, authenticated;
