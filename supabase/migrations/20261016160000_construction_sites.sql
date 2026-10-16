-- City-wide construction sites: source data for obstacle detection.
--
-- The event loop matches these against routes and materializes hits into
-- public.obstacles (see *_obstacles.sql). Location is a single
-- geography(Point, 4326) for consistency with routes/route_waypoints; use
-- radius_meters as the impact radius when matching ("on the way" = within
-- X meters of the route line). Day-granularity dates cover "planned duration".

create extension if not exists postgis with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

create table public.construction_sites (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null,
  description text,
  location extensions.geography(point, 4326) not null,
  -- impact radius in meters around location, used by the matching loop
  radius_meters double precision,
  start_date date,
  end_date date,
  -- stable id from the city open-data feed, for upserts in the event loop
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_sites_radius_positive
    check (radius_meters is null or radius_meters > 0),
  constraint construction_sites_dates_valid
    check (start_date is null or end_date is null or end_date >= start_date)
);

create index construction_sites_location_idx
  on public.construction_sites using gist (location);
create index construction_sites_dates_idx
  on public.construction_sites (start_date, end_date);

alter table public.construction_sites enable row level security;

-- Open read/write for the hackathon demo (same as routes: the app uses the
-- publishable key with no login yet). Tighten once auth lands.
create policy "Anyone can read construction sites"
  on public.construction_sites
  for select to anon, authenticated using (true);
create policy "Anyone can write construction sites"
  on public.construction_sites
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete
  on public.construction_sites to anon, authenticated;
