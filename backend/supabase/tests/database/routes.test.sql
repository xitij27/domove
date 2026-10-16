-- pgTAP tests for the route migrations; CI runs them with `supabase test db`.
-- All writes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(35);

-- Inject a child-insert failure to verify that the RPC is atomic.
create function pg_temp.reject_test_stop() returns trigger language plpgsql as $$
begin
  if new.label = '__FAIL_TEST_STOP__' then
    raise exception 'Injected waypoint failure';
  end if;
  return new;
end;
$$;
create trigger issue1_test_reject_stop before insert on public.route_waypoints
for each row execute function pg_temp.reject_test_stop();

-- The app calls everything below with the publishable (anon) key.
set local role anon;

-- Creating
select is(
  public.create_saved_route('11111111-1111-4111-8111-111111111111', '  Station  ', ' Park ', 'bike', array[' Cafe ', ' ', E'\t', 'Library']) ->> 'id',
  '11111111-1111-4111-8111-111111111111',
  'creating returns the saved route');
select is((select route #>> '{start,label}' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'Station', 'the starting location is trimmed');
select is((select route #>> '{destination,label}' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'Park', 'the destination is trimmed');
select is((select route #> '{start,coordinate}' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'null'::jsonb, 'an unresolved location has a null coordinate');
select is((select route ->> 'mode' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'bike', 'the bike mode is stored as bike');
select ok((select route ->> 'createdAt' is not null from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'the creation time is returned');
select is((select jsonb_path_query_array(route, '$.waypoints[*].label') from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  '["Cafe", "Library"]'::jsonb, 'blank stops are dropped and the order is kept');
select is((select jsonb_path_query_array(route, '$.waypoints[*].sequence') from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  '[0, 1]'::jsonb, 'stops are numbered from 0 without gaps');

-- Retrying
select is(
  public.create_saved_route('11111111-1111-4111-8111-111111111111', 'Station', 'Park', 'bike', array['Cafe', 'Library']),
  (select route from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'retrying a save returns the saved route');
select is((select count(*)::integer from route_waypoints where route_id = '11111111-1111-4111-8111-111111111111'),
  2, 'retrying a save adds no stops');

select lives_ok(
  $$select public.create_saved_route('22222222-2222-4222-8222-222222222222', 'Home', 'Work', 'car')$$,
  'a route without stops can be saved');
select lives_ok(
  $$select public.create_saved_route(gen_random_uuid(), 'A', 'B', mode) from unnest(enum_range(null::public.modality)) as mode$$,
  'every transportation mode can be saved');

-- Reading back stored coordinates and missing labels
update routes set start_location = st_setsrid(st_makepoint(7.46, 51.51), 4326)::geography
where id = '11111111-1111-4111-8111-111111111111';
select is((select route #> '{start,coordinate}' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  '{"latitude": 51.51, "longitude": 7.46}'::jsonb, 'a stored point is returned as latitude and longitude');
update routes set finish_label = null, finish_location = st_setsrid(st_makepoint(7.48, 51.49), 4326)::geography
where id = '22222222-2222-4222-8222-222222222222';
select is((select route #> '{destination,label}' from saved_routes where id = '22222222-2222-4222-8222-222222222222'),
  'null'::jsonb, 'a location with only a coordinate has a null label');

-- RPC validation
select throws_ok($$select public.create_saved_route(null, 'A', 'B', 'car')$$,
  '22023', 'A route ID is required.', 'a missing ID is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), E' \t\n ', 'B', 'car')$$,
  '22023', 'Starting location must contain 1 to 200 characters.', 'a blank start is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), 'A', '', 'car')$$,
  '22023', 'Final destination must contain 1 to 200 characters.', 'a blank destination is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), repeat('x', 201), 'B', 'car')$$,
  '22023', 'Starting location must contain 1 to 200 characters.', 'a start over 200 characters is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), 'A', 'B', null)$$,
  '22023', 'Select a transportation mode.', 'a missing mode is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), 'A', 'B', 'car', array[repeat('x', 201)])$$,
  '22023', 'Use at most 50 stops, each no longer than 200 characters.', 'a stop over 200 characters is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), 'A', 'B', 'car', array_fill('Stop'::text, array[51]))$$,
  '22023', 'Use at most 50 stops, each no longer than 200 characters.', 'more than 50 stops are rejected');
select lives_ok($$select public.create_saved_route(gen_random_uuid(), 'A', 'B', 'car', array_fill('Stop'::text, array[50]))$$,
  '50 stops are accepted');

-- Table constraints, which also apply to writes that bypass the RPC
select throws_ok($$insert into routes (start_label, finish_label, modality) values (repeat('x', 201), 'B', 'car')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_label_length"',
  'the table rejects labels over 200 characters');
select throws_ok($$insert into route_waypoints (route_id, seq, label) values ('22222222-2222-4222-8222-222222222222', 50, 'Too far')$$,
  '23514', 'new row for relation "route_waypoints" violates check constraint "route_waypoints_seq_limit"',
  'the table rejects a 51st stop');
select throws_ok($$insert into route_waypoints (route_id, seq, label) values ('22222222-2222-4222-8222-222222222222', 0, repeat('x', 201))$$,
  '23514', 'new row for relation "route_waypoints" violates check constraint "route_waypoints_label_length"',
  'the table rejects stop labels over 200 characters');
select throws_ok($$insert into routes (start_label, finish_label, modality, start_time) values ('A', 'B', 'car', '08:00')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_schedule_complete"',
  'a start time needs weekdays');
select throws_ok($$insert into routes (start_label, finish_label, modality, weekdays) values ('A', 'B', 'car', '{monday}')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_schedule_complete"',
  'weekdays need a start time');
select throws_ok($$insert into routes (start_label, finish_label, modality, start_time, weekdays) values ('A', 'B', 'car', '08:00', '{monday,monday}')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_weekdays_distinct"',
  'a weekday cannot repeat');
select lives_ok($$insert into routes (start_label, finish_label, modality, start_time, weekdays) values ('A', 'B', 'car', '08:00', '{monday,wednesday}')$$,
  'a complete schedule is accepted');

-- Atomicity
select throws_ok(
  $$select public.create_saved_route('33333333-3333-4333-8333-333333333333', 'Atomic', 'Test', 'car', array['Valid', '__FAIL_TEST_STOP__'])$$,
  'P0001', 'Injected waypoint failure', 'a failing stop insert fails the save');
select is_empty($$select 1 from routes where id = '33333333-3333-4333-8333-333333333333'$$,
  'a failed save leaves no route');
select is_empty($$select 1 from route_waypoints where route_id = '33333333-3333-4333-8333-333333333333'$$,
  'a failed save leaves no stops');

-- Deleting
delete from routes where id = '11111111-1111-4111-8111-111111111111';
select is_empty($$select 1 from saved_routes where id = '11111111-1111-4111-8111-111111111111'$$,
  'a deleted route is no longer listed');
select is_empty($$select 1 from route_waypoints where route_id = '11111111-1111-4111-8111-111111111111'$$,
  'deleting a route deletes its stops');
select isnt_empty($$select 1 from routes where id = '22222222-2222-4222-8222-222222222222'$$,
  'deleting a route keeps the other routes');

select * from finish();
rollback;
