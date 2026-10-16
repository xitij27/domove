-- Issue #1 accepts location text without geocoding or a recurring schedule.
-- Preserve the existing spatial columns for the map/calculation features.

alter table public.routes
  alter column start_location drop not null,
  alter column finish_location drop not null,
  alter column start_time drop not null,
  drop constraint routes_weekdays_not_empty,
  add constraint routes_weekdays_limit check (cardinality(weekdays) between 0 and 7),
  add constraint routes_start_present check (start_location is not null or nullif(btrim(start_label), '') is not null),
  add constraint routes_finish_present check (finish_location is not null or nullif(btrim(finish_label), '') is not null);

alter table public.route_waypoints
  alter column location drop not null,
  add constraint route_waypoints_location_present check (location is not null or nullif(btrim(label), '') is not null);

-- A read-only projection keeps client consumers independent of PostGIS's wire
-- representation. security_invoker preserves the underlying tables' RLS.
create view public.saved_routes with (security_invoker = true) as
select r.id, r.created_at, jsonb_build_object(
  'id', r.id,
  'name', r.name,
  'start', jsonb_build_object(
    'label', coalesce(r.start_label, 'Starting location'),
    'coordinate', case when r.start_location is null then null else jsonb_build_object(
      'latitude', extensions.st_y(r.start_location::extensions.geometry),
      'longitude', extensions.st_x(r.start_location::extensions.geometry)) end),
  'destination', jsonb_build_object(
    'label', coalesce(r.finish_label, 'Final destination'),
    'coordinate', case when r.finish_location is null then null else jsonb_build_object(
      'latitude', extensions.st_y(r.finish_location::extensions.geometry),
      'longitude', extensions.st_x(r.finish_location::extensions.geometry)) end),
  'mode', r.modality,
  'createdAt', r.created_at,
  'waypoints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'sequence', w.seq, 'label', coalesce(w.label, 'Intermediate stop'),
      'coordinate', case when w.location is null then null else jsonb_build_object(
        'latitude', extensions.st_y(w.location::extensions.geometry),
        'longitude', extensions.st_x(w.location::extensions.geometry)) end
    ) order by w.seq)
    from public.route_waypoints w where w.route_id = r.id
  ), '[]'::jsonb)
) as route
from public.routes r;

grant select on public.saved_routes to anon, authenticated;

-- PostgREST executes one RPC in one transaction: no partially saved routes.
create function public.create_saved_route(
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
  new_id uuid;
  result jsonb;
  start_label text := regexp_replace(p_start_label, '^\s+|\s+$', '', 'g');
  finish_label text := regexp_replace(p_finish_label, '^\s+|\s+$', '', 'g');
begin
  if start_label is null or char_length(start_label) not between 1 and 200 then
    raise exception 'Starting location must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if finish_label is null or char_length(finish_label) not between 1 and 200 then
    raise exception 'Final destination must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if p_modality is null then
    raise exception 'Select a transportation mode.' using errcode = '22023';
  end if;
  if cardinality(p_waypoints) > 50 or exists (
    select 1 from unnest(p_waypoints) label
    where char_length(regexp_replace(label, '^\s+|\s+$', '', 'g')) > 200
  ) then
    raise exception 'Use at most 50 stops, each no longer than 200 characters.' using errcode = '22023';
  end if;

  insert into public.routes (name, start_label, finish_label, modality)
  values (start_label || ' → ' || finish_label, start_label, finish_label, p_modality)
  returning id into new_id;

  insert into public.route_waypoints (route_id, seq, label)
  select new_id, (row_number() over (order by ordinal) - 1)::integer, label
  from (
    select regexp_replace(value, '^\s+|\s+$', '', 'g') as label, ordinal
    from unnest(p_waypoints) with ordinality as stop(value, ordinal)
  ) stops
  where nullif(label, '') is not null;

  select route into result from public.saved_routes where id = new_id;
  return result;
end;
$$;

revoke all on function public.create_saved_route(text, text, public.modality, text[]) from public;
grant execute on function public.create_saved_route(text, text, public.modality, text[]) to anon, authenticated;
notify pgrst, 'reload schema';
