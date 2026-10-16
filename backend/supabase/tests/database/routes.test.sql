-- pgTAP tests for the route migrations; CI runs them with `supabase test db`.
-- All writes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(52);

-- Inject a child-insert failure to verify that the RPC is atomic.
create function pg_temp.reject_test_stop() returns trigger language plpgsql as $$
begin
  if new.label = '__FAIL_TEST_STOP__' then
    raise exception 'Injected waypoint failure';
  end if;
  return new;
end;
$$;
-- A place as the app sends it; somewhere in Dortmund unless given.
create function pg_temp.place(label text, lat double precision default 51.51, lon double precision default 7.46)
returns jsonb language sql immutable as $$
  select jsonb_build_object('label', label, 'coordinate', jsonb_build_object('latitude', lat, 'longitude', lon))
$$;

create trigger issue1_test_reject_stop before insert on public.route_waypoints
for each row execute function pg_temp.reject_test_stop();

-- The app calls everything below with the publishable (anon) key.
set local role anon;

-- Creating
select is(
  public.create_saved_route('11111111-1111-4111-8111-111111111111', pg_temp.place('  Station  ', 51.51, 7.46), pg_temp.place(' Park ', 51.49, 7.48), 'bike',
    jsonb_build_array(pg_temp.place(' Cafe ', 51.5, 7.47), pg_temp.place(' '), pg_temp.place(E'\t'), pg_temp.place('Library', 51.52, 7.45))) ->> 'id',
  '11111111-1111-4111-8111-111111111111',
  'creating returns the saved route');
select is((select route #>> '{start,label}' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'Station', 'the starting location is trimmed');
select is((select route #>> '{destination,label}' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'Park', 'the destination is trimmed');
select is((select route #> '{start,coordinate}' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  '{"latitude": 51.51, "longitude": 7.46}'::jsonb, 'the starting coordinate is stored');
select is((select route #> '{destination,coordinate}' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  '{"latitude": 51.49, "longitude": 7.48}'::jsonb, 'the destination coordinate is stored');
select is((select route ->> 'mode' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'bike', 'the bike mode is stored as bike');
select is((select route -> 'startTime' from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'null'::jsonb, 'a route without a leaving time has a null start time');
select ok((select route ->> 'createdAt' is not null from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'the creation time is returned');
select is((select jsonb_path_query_array(route, '$.waypoints[*].label') from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  '["Cafe", "Library"]'::jsonb, 'blank stops are dropped and the order is kept');
select is((select jsonb_path_query_array(route, '$.waypoints[*].sequence') from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  '[0, 1]'::jsonb, 'stops are numbered from 0 without gaps');
select is((select jsonb_path_query_array(route, '$.waypoints[*].coordinate') from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  '[{"latitude": 51.5, "longitude": 7.47}, {"latitude": 51.52, "longitude": 7.45}]'::jsonb, 'each stop keeps its coordinate');

-- Retrying
select is(
  public.create_saved_route('11111111-1111-4111-8111-111111111111', pg_temp.place('Station', 51.51, 7.46), pg_temp.place('Park', 51.49, 7.48), 'bike',
    jsonb_build_array(pg_temp.place('Cafe', 51.5, 7.47), pg_temp.place('Library', 51.52, 7.45))),
  (select route from saved_routes where id = '11111111-1111-4111-8111-111111111111'),
  'retrying a save returns the saved route');
select is((select count(*)::integer from route_waypoints where route_id = '11111111-1111-4111-8111-111111111111'),
  2, 'retrying a save adds no stops');

select lives_ok(
  $$select public.create_saved_route('22222222-2222-4222-8222-222222222222', pg_temp.place('Home'), pg_temp.place('Work'), 'car')$$,
  'a route without stops can be saved');
select is(
  public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', '[]', '07:45') ->> 'startTime',
  '07:45', 'the leaving time is stored and returned as HH:MM');
select is(
  public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', p_start_time => '07:45', p_start_date => '2026-10-20') ->> 'startDate',
  '2026-10-20', 'the leaving date is stored and returned as YYYY-MM-DD');
select throws_ok(
  $$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', p_start_date => '2026-10-20')$$,
  '22023', 'Pick a time for the leaving date.', 'a leaving date needs a time');
select is(
  public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', p_start_time => '08:00', p_weekdays => '{monday,friday}') -> 'weekdays',
  '["monday", "friday"]'::jsonb, 'weekdays are stored and returned in order');
select throws_ok(
  $$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', p_start_time => '08:00', p_weekdays => '{monday}', p_start_date => '2026-10-20')$$,
  '22023', 'Pick a leaving date or weekdays, not both.', 'a leaving date cannot repeat on weekdays');
select lives_ok(
  $$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), mode) from unnest(enum_range(null::public.modality)) as mode$$,
  'every transportation mode can be saved');

-- Reading back a missing label
update routes set finish_label = null
where id = '22222222-2222-4222-8222-222222222222';
select is((select route #> '{destination,label}' from saved_routes where id = '22222222-2222-4222-8222-222222222222'),
  'null'::jsonb, 'a location with only a coordinate has a null label');

-- RPC validation
select throws_ok($$select public.create_saved_route(null, pg_temp.place('A'), pg_temp.place('B'), 'car')$$,
  '22023', 'A route ID is required.', 'a missing ID is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place(E' \t\n '), pg_temp.place('B'), 'car')$$,
  '22023', 'Starting location must contain 1 to 200 characters.', 'a blank start is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place(''), 'car')$$,
  '22023', 'Final destination must contain 1 to 200 characters.', 'a blank destination is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place(repeat('x', 201)), pg_temp.place('B'), 'car')$$,
  '22023', 'Starting location must contain 1 to 200 characters.', 'a start over 200 characters is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), null)$$,
  '22023', 'Select a transportation mode.', 'a missing mode is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A') - 'coordinate', pg_temp.place('B'), 'car')$$,
  '22023', 'Pick the starting location from the suggestions.', 'a start without a coordinate is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B', 91, 7.46), 'car')$$,
  '22023', 'Pick the final destination from the suggestions.', 'a latitude out of range is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), '{"label": "A", "coordinate": {"latitude": "51.5", "longitude": 7.46}}', pg_temp.place('B'), 'car')$$,
  '22023', 'Pick the starting location from the suggestions.', 'a coordinate given as text is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', jsonb_build_array(pg_temp.place('Cafe') - 'coordinate'))$$,
  '22023', 'Pick each stop from the suggestions.', 'a stop without a coordinate is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', pg_temp.place('Cafe'))$$,
  '22023', 'Stops must be a list.', 'stops that are not a list are rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', jsonb_build_array(pg_temp.place(repeat('x', 201))))$$,
  '22023', 'Use at most 48 stops, each no longer than 200 characters.', 'a stop over 200 characters is rejected');
select throws_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', (select jsonb_agg(pg_temp.place('Stop')) from generate_series(1, 49)))$$,
  '22023', 'Use at most 48 stops, each no longer than 200 characters.', 'more than 48 stops are rejected');
select lives_ok($$select public.create_saved_route(gen_random_uuid(), pg_temp.place('A'), pg_temp.place('B'), 'car', (select jsonb_agg(pg_temp.place('Stop')) from generate_series(1, 48)))$$,
  '48 stops are accepted');

-- Table constraints, which also apply to writes that bypass the RPC
select col_not_null('public', 'routes', 'start_location', 'a route needs a starting coordinate');
select col_not_null('public', 'routes', 'finish_location', 'a route needs a destination coordinate');
select col_not_null('public', 'route_waypoints', 'location', 'a stop needs a coordinate');
select throws_ok($$insert into routes (start_label, finish_label, start_location, finish_location, modality) values (repeat('x', 201), 'B', 'POINT(7.46 51.51)', 'POINT(7.46 51.51)', 'car')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_label_length"',
  'the table rejects labels over 200 characters');
select throws_ok($$insert into route_waypoints (route_id, seq, label, location) values ('22222222-2222-4222-8222-222222222222', 48, 'Too far', 'POINT(7.46 51.51)')$$,
  '23514', 'new row for relation "route_waypoints" violates check constraint "route_waypoints_seq_limit"',
  'the table rejects a 49th stop');
select throws_ok($$insert into route_waypoints (route_id, seq, label, location) values ('22222222-2222-4222-8222-222222222222', 0, repeat('x', 201), 'POINT(7.46 51.51)')$$,
  '23514', 'new row for relation "route_waypoints" violates check constraint "route_waypoints_label_length"',
  'the table rejects stop labels over 200 characters');
select lives_ok($$insert into routes (start_label, finish_label, start_location, finish_location, modality, start_time) values ('A', 'B', 'POINT(7.46 51.51)', 'POINT(7.46 51.51)', 'car', '08:00')$$,
  'a start time without weekdays means today at that time');
select throws_ok($$insert into routes (start_label, finish_label, start_location, finish_location, modality, weekdays) values ('A', 'B', 'POINT(7.46 51.51)', 'POINT(7.46 51.51)', 'car', '{monday}')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_schedule_complete"',
  'weekdays need a start time');
select throws_ok($$insert into routes (start_label, finish_label, start_location, finish_location, modality, start_time, weekdays) values ('A', 'B', 'POINT(7.46 51.51)', 'POINT(7.46 51.51)', 'car', '08:00', '{monday,monday}')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_weekdays_distinct"',
  'a weekday cannot repeat');
select lives_ok($$insert into routes (start_label, finish_label, start_location, finish_location, modality, start_time, weekdays) values ('A', 'B', 'POINT(7.46 51.51)', 'POINT(7.46 51.51)', 'car', '08:00', '{monday,wednesday}')$$,
  'a complete schedule is accepted');
select throws_ok($$insert into routes (start_label, finish_label, start_location, finish_location, modality, start_date) values ('A', 'B', 'POINT(7.46 51.51)', 'POINT(7.46 51.51)', 'car', '2026-10-20')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_start_date_complete"',
  'the table rejects a date without a time');
select throws_ok($$insert into routes (start_label, finish_label, start_location, finish_location, modality, start_time, start_date, weekdays) values ('A', 'B', 'POINT(7.46 51.51)', 'POINT(7.46 51.51)', 'car', '08:00', '2026-10-20', '{monday}')$$,
  '23514', 'new row for relation "routes" violates check constraint "routes_start_date_complete"',
  'a dated trip cannot also repeat on weekdays');

-- Atomicity
select throws_ok(
  $$select public.create_saved_route('33333333-3333-4333-8333-333333333333', pg_temp.place('Atomic'), pg_temp.place('Test'), 'car', jsonb_build_array(pg_temp.place('Valid'), pg_temp.place('__FAIL_TEST_STOP__')))$$,
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
