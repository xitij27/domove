-- Run with psql -v ON_ERROR_STOP=1 against a disposable database after the
-- routes and create_delete_routes migrations. All test writes roll back.
begin;

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

set local role anon;
do $$
declare
  first_route jsonb;
  second_route jsonb;
  test_route_id uuid;
  before_count integer;
  mode public.modality;
begin
  select count(*) into before_count from public.routes;
  first_route := public.create_saved_route('  Station  ', ' Park ', 'bike', array[' Cafe ', ' ', E'\t', 'Library']);
  test_route_id := (first_route->>'id')::uuid;
  assert test_route_id is not null, 'Generated UUID missing';
  assert first_route->>'createdAt' is not null, 'Creation timestamp missing';
  assert first_route#>>'{start,label}' = 'Station', 'Start not trimmed';
  assert first_route#>>'{destination,label}' = 'Park', 'Destination not trimmed';
  assert first_route#>'{start,coordinate}' = 'null'::jsonb, 'Unresolved location must be null';
  assert first_route->>'mode' = 'bike', 'Bicycle enum must remain bike';
  assert jsonb_array_length(first_route->'waypoints') = 2, 'Empty stops were saved';
  assert first_route#>>'{waypoints,0,label}' = 'Cafe', 'First stop incorrect';
  assert first_route#>>'{waypoints,1,label}' = 'Library', 'Stop order incorrect';
  assert first_route#>>'{waypoints,1,sequence}' = '1', 'Stop sequence not contiguous';
  assert (select route = first_route from public.saved_routes where id = test_route_id), 'Read projection differs from creation response';

  second_route := public.create_saved_route('Home', 'Work', 'car');
  assert second_route->>'id' <> first_route->>'id', 'IDs must be unique';
  assert (select count(*) = before_count + 2 from public.routes), 'Multiple routes not persisted';

  -- Existing spatial fields remain writable and appear as reusable coordinates.
  update public.routes set start_location = extensions.st_setsrid(extensions.st_makepoint(7.46, 51.51), 4326)::extensions.geography where id = test_route_id;
  assert (select (route#>>'{start,coordinate,latitude}')::numeric = 51.51 from public.saved_routes where id = test_route_id), 'Latitude mapping incorrect';
  assert (select (route#>>'{start,coordinate,longitude}')::numeric = 7.46 from public.saved_routes where id = test_route_id), 'Longitude mapping incorrect';

  foreach mode in array enum_range(null::public.modality) loop
    perform public.create_saved_route('A', 'B', mode, '{}');
  end loop;

  begin
    perform public.create_saved_route(E' \t\n ', 'B', 'car');
    raise exception 'Expected empty-start validation';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_saved_route('A', '', 'car');
    raise exception 'Expected empty-destination validation';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_saved_route('A', 'B', null);
    raise exception 'Expected missing-mode validation';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_saved_route('A', 'B', 'car', array[repeat('x', 201)]);
    raise exception 'Expected stop-length validation';
  exception when invalid_parameter_value then null;
  end;

  select count(*) into before_count from public.routes;
  begin
    perform public.create_saved_route('Atomic', 'Test', 'car', array['Valid', '__FAIL_TEST_STOP__']);
    raise exception 'Expected injected failure';
  exception when raise_exception then
    if sqlerrm <> 'Injected waypoint failure' then raise; end if;
  end;
  assert (select count(*) = before_count from public.routes), 'Failed save left a partial route';
  assert not exists (select 1 from public.route_waypoints where label = 'Valid'), 'Failed save left a partial stop';

  delete from public.routes where id = test_route_id;
  assert not exists (select 1 from public.saved_routes where id = test_route_id), 'Deleted route still listed';
  assert not exists (select 1 from public.route_waypoints where route_id = test_route_id), 'Waypoint cascade failed';
  assert exists (select 1 from public.routes where id = (second_route->>'id')::uuid), 'Another route was deleted';
end;
$$;
rollback;
