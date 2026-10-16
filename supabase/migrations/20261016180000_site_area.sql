-- Stored polygon area for construction sites.
--
-- area_sqm holds the site footprint in square meters, derived from the
-- MultiPolygon in `geom` via ST_Area(geography). It is a regular column
-- (not generated) so the backend sync writes it on every upsert; the
-- backfill below covers rows synced before this migration. The detection
-- loop uses it to size the centroid fallback buffer per site
-- (radius = sqrt(area/pi)) instead of a single global constant.

alter table public.construction_sites
  add column if not exists area_sqm double precision;

-- Backfill from existing polygons.
update public.construction_sites
set area_sqm = ST_Area(geom)
where geom is not null and area_sqm is null;

create index if not exists construction_sites_area_idx
  on public.construction_sites (area_sqm);
