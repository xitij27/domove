-- Obstacles: construction sites on the way of a saved route (#5).
--
-- A pg_cron job keeps the table current inside Postgres, like the site sync:
-- it asks the router for the path of each route whose stops or mode changed,
-- then matches every path against every site. The app only reads the table.
-- Issue #12 later swaps the router call for route_paths from /api/plan and the
-- matching for sites_on_paths.
--
-- The live database already has an obstacles table from #5's draft, so every
-- statement is also safe to run there. No network calls until the job runs.

create table if not exists public.obstacles (
  id uuid primary key default extensions.gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  -- A site's id changes when the city edits its title, dates or centre (see
  -- private.sync_construction_sites), so an extended site shows up as a new obstacle.
  construction_site_id text not null
    references public.construction_sites(id) on delete cascade,
  -- metres from the path to the site's area; 0 when the path crosses it
  distance_meters double precision,
  detected_at timestamptz not null default now(),
  unique (route_id, construction_site_id),
  constraint obstacles_distance_non_negative
    check (distance_meters is null or distance_meters >= 0)
);

create index if not exists obstacles_site_idx on public.obstacles (construction_site_id);

-- Only the job writes obstacles; the app may read them.
alter table public.obstacles enable row level security;
drop policy if exists "Anyone can write obstacles" on public.obstacles;
drop policy if exists "Anyone can read obstacles" on public.obstacles;
create policy "Anyone can read obstacles" on public.obstacles
  for select to anon, authenticated using (true);
revoke all on public.obstacles from anon, authenticated;
grant select on public.obstacles to anon, authenticated;

-- What to ask the router for each route: start, stops in order, destination.
-- The public FOSSGIS servers have one instance per mode and ignore the profile
-- in the path (router.project-osrm.org only has cars).
create or replace view private.route_requests as
select
  r.id as route_id,
  'https://routing.openstreetmap.de/routed-'
    || case r.modality when 'pedestrian' then 'foot' else r.modality::text end
    || '/route/v1/driving/'
    || string_agg(
         extensions.st_x(p.location::extensions.geometry) || ',' || extensions.st_y(p.location::extensions.geometry),
         ';' order by p.ord)
    || '?overview=full&geometries=geojson' as url
from public.routes r
cross join lateral (
  select r.start_location as location, -1 as ord
  union all
  select w.location, w.seq from public.route_waypoints w where w.route_id = r.id
  union all
  select r.finish_location, 2147483647
) p
group by r.id, r.modality;

-- The router's path per route, kept until the route's request changes.
create table if not exists private.route_lines (
  route_id uuid primary key references public.routes(id) on delete cascade,
  request text not null,
  line extensions.geography(linestring, 4326) not null,
  routed_at timestamptz not null default now()
);

-- A site is on the way when its area comes within 30 m of the path, or its
-- centre within 55 m when it has no area. Only routes whose stored path matches
-- their current request are touched, so a route whose routing failed keeps its
-- obstacles until it succeeds.
create or replace function private.match_obstacles()
returns integer
language sql
set search_path = ''
as $$
  with paths as (
    select l.route_id, l.line
    from private.route_lines l
    join private.route_requests q on q.route_id = l.route_id and q.url = l.request
  ), hits as (
    select p.route_id, s.id as site_id,
      extensions.st_distance(p.line, coalesce(s.geom, s.location)) as distance_meters
    from paths p
    join public.construction_sites s
      on extensions.st_dwithin(p.line, coalesce(s.geom, s.location), case when s.geom is null then 55 else 30 end)
  ), saved as (
    insert into public.obstacles (route_id, construction_site_id, distance_meters)
    select route_id, site_id, distance_meters from hits
    on conflict (route_id, construction_site_id) do update
      set distance_meters = excluded.distance_meters, detected_at = now()
    returning 1
  ), gone as (
    delete from public.obstacles o
    using paths p
    where o.route_id = p.route_id
      and not exists (select 1 from hits h where h.route_id = o.route_id and h.site_id = o.construction_site_id)
  )
  select count(*)::integer from saved;
$$;

create or replace function private.detect_obstacles()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  req record;
  res record;
  body jsonb;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');

  for req in
    select q.route_id, q.url
    from private.route_requests q
    left join private.route_lines l on l.route_id = q.route_id
    where l.request is distinct from q.url
  loop
    begin
      select h.status, h.content into res from extensions.http_get(req.url) h;
      body := case when res.status = 200 then res.content::jsonb end;
      if body->>'code' is distinct from 'Ok' then
        raise exception 'HTTP %, code %', res.status, body->>'code';
      end if;
      insert into private.route_lines (route_id, request, line)
      values (req.route_id, req.url,
        extensions.st_geomfromgeojson(body->'routes'->0->'geometry')::extensions.geography)
      on conflict (route_id) do update
        set request = excluded.request, line = excluded.line, routed_at = now();
    exception when others then
      -- never fall back to a straight line: that would rewrite the route's obstacles
      raise warning 'routing route % failed: %', req.route_id, sqlerrm;
    end;
    perform pg_catalog.pg_sleep(1); -- the public router allows about one request a second
  end loop;

  return private.match_obstacles();
end;
$$;

revoke all on function private.match_obstacles() from public, anon, authenticated;
revoke all on function private.detect_obstacles() from public, anon, authenticated;

-- Every 15 minutes, clear of the hourly site sync at :00. pg_cron never runs
-- two passes of one job at once. Scheduling an existing name replaces it.
select cron.schedule('detect-obstacles', '5,20,35,50 * * * *', 'select private.detect_obstacles()');
