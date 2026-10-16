-- Obstacles: construction sites on the way of a given route.
--
-- Join table between public.routes and public.construction_sites,
-- materialized by an event loop that runs regularly. The loop upserts one
-- row per (route, site) pair that is currently affected and deletes rows
-- that are no longer on the way, so a plain unique(route_id,
-- construction_site_id) is enough — no resolved_at lifecycle column.
-- distance_meters caches how far the site is from the route line at
-- detection time (for sorting/badge display).

create extension if not exists postgis with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

create table public.obstacles (
  id uuid primary key default extensions.gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  construction_site_id uuid not null
    references public.construction_sites(id) on delete cascade,
  distance_meters double precision,
  detected_at timestamptz not null default now(),
  unique (route_id, construction_site_id),
  constraint obstacles_distance_non_negative
    check (distance_meters is null or distance_meters >= 0)
);

create index obstacles_route_idx on public.obstacles (route_id);
create index obstacles_site_idx on public.obstacles (construction_site_id);

alter table public.obstacles enable row level security;

-- Open read/write for the hackathon demo (same as routes: the app uses the
-- publishable key with no login yet). Tighten once auth lands.
create policy "Anyone can read obstacles" on public.obstacles
  for select to anon, authenticated using (true);
create policy "Anyone can write obstacles" on public.obstacles
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.obstacles to anon, authenticated;
