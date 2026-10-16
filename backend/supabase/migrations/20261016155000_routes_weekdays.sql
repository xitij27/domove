-- The route form now picks weekdays alongside the leaving time: a time alone
-- means "today at this time", weekdays repeat and always need a time
-- (see the routes_schedule_complete constraint). Paste after
-- 20261016154000_routes_leaving_time.sql.

create or replace view public.saved_routes with (security_invoker = true) as
select r.id, r.created_at, jsonb_build_object(
  'id', r.id,
  'name', r.name,
  'start', jsonb_build_object(
    'label', r.start_label,
    'coordinate', public.route_point_json(r.start_location)),
  'destination', jsonb_build_object(
    'label', r.finish_label,
    'coordinate', public.route_point_json(r.finish_location)),
  'mode', r.modality,
  'startTime', to_char(r.start_time, 'HH24:MI'),
  'weekdays', coalesce(
    (select jsonb_agg(day order by ordinal)
     from unnest(r.weekdays) with ordinality as d(day, ordinal)),
    '[]'::jsonb),
  'createdAt', r.created_at,
  'waypoints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'sequence', w.seq, 'label', w.label,
      'coordinate', public.route_point_json(w.location)
    ) order by w.seq)
    from public.route_waypoints w where w.route_id = r.id
  ), '[]'::jsonb)
) as route
from public.routes r;

-- Same as in 20261016154000, plus p_weekdays. The new parameter has a
-- default, so apps that don't send it keep working.
drop function public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time);

create function public.create_saved_route(
  p_id uuid,
  p_start jsonb,
  p_finish jsonb,
  p_modality public.modality,
  p_waypoints jsonb default '[]',
  p_start_time time default null,
  p_weekdays public.weekday[] default '{}'
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

  insert into public.routes (id, name, start_label, finish_label, start_location, finish_location, modality, start_time, weekdays)
  values (p_id, start_label || ' → ' || finish_label, start_label, finish_label, start_point, finish_point, p_modality, p_start_time, days)
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

revoke all on function public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time, public.weekday[]) from public;
grant execute on function public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time, public.weekday[]) to anon, authenticated;
notify pgrst, 'reload schema';
