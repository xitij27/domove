-- Construction-site areas (Flächen) + obstacles table.
--
-- Context: the live database's public.construction_sites stores Dortmund
-- open-data centroids only (location geography(Point), text id, status
-- current/planned, ...). The ODS feeds also ship full MultiPolygon areas
-- (geo_shape), which the detection loop needs for proper overlap checks.
-- This migration adds a nullable geom column for those areas (backfilled by
-- the backend sync; centroid matching still applies while geom is null) and
-- creates the missing public.obstacles join table.
--
-- All statements are idempotent (IF NOT EXISTS guards) so the file applies
-- cleanly both to fresh projects (after the earlier repo migrations) and to
-- the live database, whose schema drifted from supabase/migrations.

create extension if not exists postgis with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- 1. Polygon areas on construction_sites ("migrated to Geometries").
alter table public.construction_sites
  add column if not exists geom extensions.geography(multipolygon, 4326);

create index if not exists construction_sites_geom_idx
  on public.construction_sites using gist (geom);

-- 2. Obstacles: one row per (route, site) pair currently affected.
-- NOTE: construction_sites.id is text (md5-style external hash), not uuid,
-- so the FK here is text too (unlike the unapplied *_obstacles.sql draft).
create table if not exists public.obstacles (
  id uuid primary key default extensions.gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  construction_site_id text not null
    references public.construction_sites(id) on delete cascade,
  distance_meters double precision,
  detected_at timestamptz not null default now(),
  unique (route_id, construction_site_id),
  constraint obstacles_distance_non_negative
    check (distance_meters is null or distance_meters >= 0)
);

create index if not exists obstacles_route_idx on public.obstacles (route_id);
create index if not exists obstacles_site_idx on public.obstacles (construction_site_id);

alter table public.obstacles enable row level security;

-- Open read/write for the hackathon demo (same as routes: the app uses the
-- publishable key with no login yet). Tighten once auth lands.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'obstacles'
      and policyname = 'Anyone can read obstacles'
  ) then
    create policy "Anyone can read obstacles" on public.obstacles
      for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'obstacles'
      and policyname = 'Anyone can write obstacles'
  ) then
    create policy "Anyone can write obstacles" on public.obstacles
      for all to anon, authenticated using (true) with check (true);
  end if;
end
$$;

grant select, insert, update, delete on public.obstacles to anon, authenticated;
