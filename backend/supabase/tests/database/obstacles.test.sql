-- pgTAP tests for the obstacle detection (#5); run with `supabase test db`.
-- The router call needs the network, so these tests store paths directly.
-- All writes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

-- A square site area around a centre, `half` degrees each way.
create function pg_temp.square(lon double precision, lat double precision, half double precision default 0.0001)
returns extensions.geography language sql immutable as $$
  select extensions.st_multi(extensions.st_makeenvelope(lon - half, lat - half, lon + half, lat + half, 4326))::extensions.geography
$$;

-- Polygons from the feed
select is(extensions.geometrytype(private.geography_from_geojson(
    '{"type":"Polygon","coordinates":[[[7.46,51.51],[7.461,51.51],[7.461,51.511],[7.46,51.51]]]}')::extensions.geometry),
  'MULTIPOLYGON', 'a polygon is stored as a multipolygon');
select is(private.geography_from_geojson('{"type":"Point","coordinates":[7.46,51.51]}'), null,
  'a shape that is not an area is dropped');
select is(private.geography_from_geojson('{"type":"Polygon","coordinates":"broken"}'), null,
  'a malformed shape is dropped instead of failing the sync');

-- Routes. The path of the walking route runs east along latitude 51.51,
-- where 0.0001 degrees of latitude are about 11 m.
insert into public.routes (id, start_location, finish_location, start_time, weekdays, modality) values
  ('00000000-0000-4000-8000-000000000001', 'SRID=4326;POINT(7.46 51.51)', 'SRID=4326;POINT(7.47 51.51)', '08:00', '{monday}', 'pedestrian'),
  ('00000000-0000-4000-8000-000000000002', 'SRID=4326;POINT(7.46 51.51)', 'SRID=4326;POINT(7.47 51.51)', '08:00', '{monday}', 'car'),
  ('00000000-0000-4000-8000-000000000003', 'SRID=4326;POINT(7.46 51.51)', 'SRID=4326;POINT(7.47 51.51)', '08:00', '{monday}', 'bike');
insert into public.route_waypoints (route_id, seq, location) values
  ('00000000-0000-4000-8000-000000000001', 1, 'SRID=4326;POINT(7.468 51.51)'),
  ('00000000-0000-4000-8000-000000000001', 0, 'SRID=4326;POINT(7.465 51.51)');

select is((select url from private.route_requests where route_id = '00000000-0000-4000-8000-000000000001'),
  'https://routing.openstreetmap.de/routed-foot/route/v1/driving/7.46,51.51;7.465,51.51;7.468,51.51;7.47,51.51?overview=full&geometries=geojson',
  'a walking route asks the foot router for start, stops in order and destination as lon,lat');
select is((select substring(url from 'routed-[a-z]+') from private.route_requests where route_id = '00000000-0000-4000-8000-000000000003'),
  'routed-bike', 'a bike route asks the bike router');

-- Sites. The path runs through central Dortmund, so start without the synced ones.
delete from public.construction_sites;
delete from private.route_lines;
insert into public.construction_sites (id, status, title, latitude, longitude, geom) values
  ('crossed', 'current', 'Crossed', 51.51, 7.465, pg_temp.square(7.465, 51.51)),
  ('near', 'current', 'Near', 51.5103, 7.462, pg_temp.square(7.462, 51.5103)),    -- edge about 22 m from the path
  ('far', 'current', 'Far', 51.5105, 7.463, pg_temp.square(7.463, 51.5105)),      -- edge about 44 m away
  ('point-near', 'planned', 'No area, near', 51.51045, 7.466, null),              -- centre about 50 m away
  ('point-far', 'planned', 'No area, far', 51.51054, 7.467, null);                -- centre about 60 m away

-- The walking route has a current path; the car route's path is from an older
-- request, as when routing failed after an edit; the bike route has none yet.
insert into private.route_lines (route_id, request, line) values
  ('00000000-0000-4000-8000-000000000001',
   (select url from private.route_requests where route_id = '00000000-0000-4000-8000-000000000001'),
   'SRID=4326;LINESTRING(7.46 51.51,7.47 51.51)'),
  ('00000000-0000-4000-8000-000000000002', 'an older request', 'SRID=4326;LINESTRING(7.46 51.51,7.47 51.51)');
insert into public.obstacles (route_id, construction_site_id, distance_meters) values
  ('00000000-0000-4000-8000-000000000001', 'far', 40),
  ('00000000-0000-4000-8000-000000000002', 'far', 40),
  ('00000000-0000-4000-8000-000000000003', 'far', 40);

select is(private.match_obstacles(), 3, 'three sites are on the walking route');
select is(
  (select array_agg(construction_site_id order by construction_site_id) from public.obstacles
   where route_id = '00000000-0000-4000-8000-000000000001'),
  '{crossed,near,point-near}'::text[],
  'areas within 30 m and centres within 55 m count; a site no longer on the way is removed');
select is((select distance_meters from public.obstacles
   where route_id = '00000000-0000-4000-8000-000000000001' and construction_site_id = 'crossed'),
  0::double precision, 'a crossed site is 0 m from the path');
select ok((select distance_meters between 20 and 25 from public.obstacles
   where route_id = '00000000-0000-4000-8000-000000000001' and construction_site_id = 'near'),
  'the distance is measured to the area, not its centre');
select is((select count(*)::integer from public.obstacles where route_id = '00000000-0000-4000-8000-000000000002'), 1,
  'a route with an outdated path keeps its obstacles');
select is((select count(*)::integer from public.obstacles where route_id = '00000000-0000-4000-8000-000000000003'), 1,
  'a route without a path keeps its obstacles');

-- Editing a stop makes the stored path outdated until the router answers again.
update public.route_waypoints set location = 'SRID=4326;POINT(7.469 51.51)'
  where route_id = '00000000-0000-4000-8000-000000000001' and seq = 1;
update public.construction_sites set geom = pg_temp.square(7.465, 51.52) where id = 'crossed';
do $$ begin perform private.match_obstacles(); end $$;
select is((select count(*)::integer from public.obstacles where route_id = '00000000-0000-4000-8000-000000000001'), 3,
  'an edited route keeps its obstacles until it has a new path');

update private.route_lines
  set request = (select url from private.route_requests where route_id = '00000000-0000-4000-8000-000000000001')
  where route_id = '00000000-0000-4000-8000-000000000001';
do $$ begin perform private.match_obstacles(); end $$;
select is(
  (select array_agg(construction_site_id order by construction_site_id) from public.obstacles
   where route_id = '00000000-0000-4000-8000-000000000001'),
  '{near,point-near}'::text[], 'a site that moved away is removed on the next pass');

-- The app uses the publishable (anon) key.
set local role anon;
select ok((select count(*) > 0 from public.obstacles), 'the app can read obstacles');
select throws_ok(
  $$insert into public.obstacles (route_id, construction_site_id) values ('00000000-0000-4000-8000-000000000003', 'near')$$,
  '42501', null, 'the app cannot write obstacles');
reset role;

select * from finish();
rollback;
