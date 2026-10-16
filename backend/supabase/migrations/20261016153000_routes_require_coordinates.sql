-- Every saved place now has a coordinate, picked from the app's suggestions, so
-- the obstacle loop (#5) can match each route against construction sites.
-- Paste after 20261016152000_saved_routes_hardening.sql.

-- Routes saved as text only are demo data that can't be checked; their stops
-- and obstacles cascade.
delete from public.routes r
where r.start_location is null or r.finish_location is null
  or exists (select 1 from public.route_waypoints w where w.route_id = r.id and w.location is null);

-- The "label or coordinate" checks are implied once the coordinate is required.
alter table public.routes
  drop constraint routes_start_present,
  drop constraint routes_finish_present,
  alter column start_location set not null,
  alter column finish_location set not null;

alter table public.route_waypoints
  drop constraint route_waypoints_location_present,
  alter column location set not null;

-- The write side of route_point_json: {latitude, longitude} to a point, or
-- null when either is missing, not a number or out of range.
create function public.route_point_from_json(coordinate jsonb)
returns extensions.geography
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(coordinate->'latitude') = 'number' and jsonb_typeof(coordinate->'longitude') = 'number'
      and (coordinate->>'latitude')::double precision between -90 and 90
      and (coordinate->>'longitude')::double precision between -180 and 180
    then extensions.st_setsrid(extensions.st_makepoint(
      (coordinate->>'longitude')::double precision,
      (coordinate->>'latitude')::double precision), 4326)::extensions.geography
  end
$$;

-- Places are sent in the shape saved_routes returns: {label, coordinate: {latitude, longitude}}.
drop function public.create_saved_route(uuid, text, text, public.modality, text[]);

create function public.create_saved_route(
  p_id uuid,
  p_start jsonb,
  p_finish jsonb,
  p_modality public.modality,
  p_waypoints jsonb default '[]'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  whitespace constant text := E' \t\n\r';
  start_label text := btrim(p_start->>'label', whitespace);
  finish_label text := btrim(p_finish->>'label', whitespace);
  start_point extensions.geography := public.route_point_from_json(p_start->'coordinate');
  finish_point extensions.geography := public.route_point_from_json(p_finish->'coordinate');
  stops jsonb;
  result jsonb;
begin
  if p_id is null then
    raise exception 'A route ID is required.' using errcode = '22023';
  end if;
  if start_label is null or char_length(start_label) not between 1 and 200 then
    raise exception 'Starting location must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if start_point is null then
    raise exception 'Pick the starting location from the suggestions.' using errcode = '22023';
  end if;
  if finish_label is null or char_length(finish_label) not between 1 and 200 then
    raise exception 'Final destination must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if finish_point is null then
    raise exception 'Pick the final destination from the suggestions.' using errcode = '22023';
  end if;
  if p_modality is null then
    raise exception 'Select a transportation mode.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_waypoints, '[]')) <> 'array' then
    raise exception 'Stops must be a list.' using errcode = '22023';
  end if;

  -- Blank stops are dropped; the rest keep their order and get trimmed labels.
  select coalesce(jsonb_agg(place || jsonb_build_object('label', label) order by ordinal), '[]') into stops
  from (
    select place, btrim(place->>'label', whitespace) as label, ordinal
    from jsonb_array_elements(coalesce(p_waypoints, '[]')) with ordinality as stop(place, ordinal)
  ) trimmed
  where label <> '';
  if jsonb_array_length(stops) > 50 or exists (select 1 from jsonb_array_elements(stops) s where char_length(s->>'label') > 200) then
    raise exception 'Use at most 50 stops, each no longer than 200 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(stops) s where public.route_point_from_json(s->'coordinate') is null) then
    raise exception 'Pick each stop from the suggestions.' using errcode = '22023';
  end if;

  insert into public.routes (id, name, start_label, finish_label, start_location, finish_location, modality)
  values (p_id, start_label || ' → ' || finish_label, start_label, finish_label, start_point, finish_point, p_modality)
  on conflict (id) do nothing;

  -- Not found means a retry of a save that went through, stops included.
  if found then
    insert into public.route_waypoints (route_id, seq, label, location)
    select p_id, (ordinal - 1)::integer, s->>'label', public.route_point_from_json(s->'coordinate')
    from jsonb_array_elements(stops) with ordinality as stop(s, ordinal);
  end if;

  select route into result from public.saved_routes where id = p_id;
  return result;
end;
$$;

revoke all on function public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb) from public;
grant execute on function public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
