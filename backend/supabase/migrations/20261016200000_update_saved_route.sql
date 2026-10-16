-- Editing a saved route from the app. Paste after 20261016190000_routes_leaving_date.sql.
--
-- Takes the same parameters and checks as create_saved_route and replaces the
-- route's places, mode, leaving time and stops in one transaction. The ID and
-- created_at stay, so the route keeps its place in the list. The obstacles job
-- sees the changed request and routes it again.

create or replace function public.update_saved_route(
  p_id uuid,
  p_start jsonb,
  p_finish jsonb,
  p_modality public.modality,
  p_waypoints jsonb default '[]',
  p_start_time time default null,
  p_weekdays public.weekday[] default '{}',
  p_start_date date default null
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
  days public.weekday[] := coalesce(p_weekdays, '{}');
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
  if not public.weekdays_are_distinct(days) then
    raise exception 'Select each weekday only once.' using errcode = '22023';
  end if;
  if cardinality(days) > 0 and p_start_time is null then
    raise exception 'Select a leaving time for the selected days.' using errcode = '22023';
  end if;
  if p_start_date is not null and p_start_time is null then
    raise exception 'Pick a time for the leaving date.' using errcode = '22023';
  end if;
  if p_start_date is not null and cardinality(days) > 0 then
    raise exception 'Pick a leaving date or weekdays, not both.' using errcode = '22023';
  end if;

  -- Blank stops are dropped; the rest keep their order and get trimmed labels.
  select coalesce(jsonb_agg(place || jsonb_build_object('label', label) order by ordinal), '[]') into stops
  from (
    select place, btrim(place->>'label', whitespace) as label, ordinal
    from jsonb_array_elements(coalesce(p_waypoints, '[]')) with ordinality as stop(place, ordinal)
  ) trimmed
  where label <> '';
  if jsonb_array_length(stops) > 48 or exists (select 1 from jsonb_array_elements(stops) s where char_length(s->>'label') > 200) then
    raise exception 'Use at most 48 stops, each no longer than 200 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(stops) s where public.route_point_from_json(s->'coordinate') is null) then
    raise exception 'Pick each stop from the suggestions.' using errcode = '22023';
  end if;

  -- The labels share their names with columns, so they are qualified by the function's name.
  update public.routes set
    name = update_saved_route.start_label || ' → ' || update_saved_route.finish_label,
    start_label = update_saved_route.start_label,
    finish_label = update_saved_route.finish_label,
    start_location = start_point,
    finish_location = finish_point,
    modality = p_modality,
    start_time = p_start_time,
    weekdays = days,
    start_date = p_start_date
  where id = p_id;
  if not found then
    raise exception 'This route no longer exists. Refresh the list.' using errcode = '22023';
  end if;

  delete from public.route_waypoints where route_id = p_id;
  insert into public.route_waypoints (route_id, seq, label, location)
  select p_id, (ordinal - 1)::integer, s->>'label', public.route_point_from_json(s->'coordinate')
  from jsonb_array_elements(stops) with ordinality as stop(s, ordinal);

  select route into result from public.saved_routes where id = p_id;
  return result;
end;
$$;

revoke all on function public.update_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time, public.weekday[], date) from public;
grant execute on function public.update_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time, public.weekday[], date) to anon, authenticated;
notify pgrst, 'reload schema';
