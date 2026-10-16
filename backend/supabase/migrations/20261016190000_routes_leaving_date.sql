-- The form's "Leaving at" now takes a date as well as a time, so a route can
-- be saved for a later day. Paste after 20261016181000_obstacles.sql.
--
-- The team database had already been given a p_weekdays parameter and a
-- "weekdays" key outside these migrations; both are kept and recorded here.

-- A date is a single trip: it needs a time and cannot also repeat on weekdays.
-- Without a date, a time still means "today at this time".
alter table public.routes
  add column start_date date,
  add constraint routes_start_date_complete
    check (start_date is null or (start_time is not null and cardinality(weekdays) = 0));

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
  'startDate', to_char(r.start_date, 'YYYY-MM-DD'),
  'weekdays', coalesce((
    select jsonb_agg(d.day order by d.ordinal)
    from unnest(r.weekdays) with ordinality as d(day, ordinal)
  ), '[]'::jsonb),
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

-- Same as in 20261016154000, plus p_weekdays and p_start_date. Both have
-- defaults, so apps that don't send them keep working. The team database has
-- the weekdays version, a fresh one the version from 20261016154000.
drop function if exists public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time);
drop function if exists public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time, public.weekday[]);

create function public.create_saved_route(
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

  insert into public.routes (id, name, start_label, finish_label, start_location, finish_location, modality, start_time, weekdays, start_date)
  values (p_id, start_label || ' → ' || finish_label, start_label, finish_label, start_point, finish_point, p_modality, p_start_time, days, p_start_date)
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

revoke all on function public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time, public.weekday[], date) from public;
grant execute on function public.create_saved_route(uuid, jsonb, jsonb, public.modality, jsonb, time, public.weekday[], date) to anon, authenticated;
notify pgrst, 'reload schema';
