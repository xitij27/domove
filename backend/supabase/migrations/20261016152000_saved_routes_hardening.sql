-- Review fixes for 20261016151000_create_delete_routes.sql, which the team
-- database already runs: paste this file after it. Per-user ownership and
-- required coordinates are still open, see docs/routes-database-todo.md.

create function public.weekdays_are_distinct(days public.weekday[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select count(distinct d) = cardinality(days) from unnest(days) as d
$$;

create function public.route_point_json(location extensions.geography)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when location is null then null else jsonb_build_object(
    'latitude', extensions.st_y(location::extensions.geometry),
    'longitude', extensions.st_x(location::extensions.geometry)) end
$$;

-- The RPC's limits now hold for every writer, since anon can still write the
-- tables directly.
alter table public.routes
  add constraint routes_label_length
    check (char_length(start_label) <= 200 and char_length(finish_label) <= 200),
  drop constraint routes_weekdays_limit,
  -- Distinct values of a 7-value enum also caps the array at 7 days.
  add constraint routes_weekdays_distinct check (public.weekdays_are_distinct(weekdays)),
  -- An unscheduled route has neither a start time nor days; a scheduled one has both.
  add constraint routes_schedule_complete
    check ((start_time is null) = (cardinality(weekdays) = 0));

alter table public.route_waypoints
  add constraint route_waypoints_label_length check (char_length(label) <= 200),
  -- seq is unique per route and starts at 0, so this caps a route at 50 stops.
  add constraint route_waypoints_seq_limit check (seq < 50);

-- The app pages through the list in this order.
create index routes_created_at_id_idx on public.routes (created_at desc, id desc);

-- Labels stay null when only a coordinate is known; the app picks the fallback text.
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

-- The app now sends the route's ID so that retrying a save whose response was
-- lost returns the saved route instead of creating a duplicate.
drop function public.create_saved_route(text, text, public.modality, text[]);

create function public.create_saved_route(
  p_id uuid,
  p_start_label text,
  p_finish_label text,
  p_modality public.modality,
  p_waypoints text[] default '{}'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  whitespace constant text := E' \t\n\r';
  start_label text := btrim(p_start_label, whitespace);
  finish_label text := btrim(p_finish_label, whitespace);
  stops text[];
  result jsonb;
begin
  if p_id is null then
    raise exception 'A route ID is required.' using errcode = '22023';
  end if;
  if start_label is null or char_length(start_label) not between 1 and 200 then
    raise exception 'Starting location must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if finish_label is null or char_length(finish_label) not between 1 and 200 then
    raise exception 'Final destination must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if p_modality is null then
    raise exception 'Select a transportation mode.' using errcode = '22023';
  end if;

  -- Blank stops are dropped; the rest keep their order.
  select coalesce(array_agg(label order by ordinal), '{}') into stops
  from (
    select btrim(value, whitespace) as label, ordinal
    from unnest(p_waypoints) with ordinality as stop(value, ordinal)
  ) trimmed
  where label <> '';
  if cardinality(stops) > 50 or exists (select 1 from unnest(stops) as label where char_length(label) > 200) then
    raise exception 'Use at most 50 stops, each no longer than 200 characters.' using errcode = '22023';
  end if;

  insert into public.routes (id, name, start_label, finish_label, modality)
  values (p_id, start_label || ' → ' || finish_label, start_label, finish_label, p_modality)
  on conflict (id) do nothing;

  -- Not found means a retry of a save that went through, stops included.
  if found then
    insert into public.route_waypoints (route_id, seq, label)
    select p_id, (ordinal - 1)::integer, label
    from unnest(stops) with ordinality as stop(label, ordinal);
  end if;

  select route into result from public.saved_routes where id = p_id;
  return result;
end;
$$;

revoke all on function public.create_saved_route(uuid, text, text, public.modality, text[]) from public;
grant execute on function public.create_saved_route(uuid, text, text, public.modality, text[]) to anon, authenticated;
notify pgrst, 'reload schema';
