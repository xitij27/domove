-- Impact ratings: a score from 0 to 10 for each construction site, for each
-- mode and travel time, with every factor behind it
-- (docs/site-rating-and-detours.md).
--
--   score = disruption   0–6: what the site closes for the mode (#12's closure
--                        kinds and impacts), scaled by the road it closes it
--                        on, ×1.3 for cars at rush hour
--         + surroundings 0–4: schools, crossings on a school route, other
--                        crossings, kindergartens and care homes, emergency
--                        access, stops, other works nearby
--
-- Every number is a row of rating_weights, which the app reads to explain the
-- scores, so they can be tuned without a release. The ratings come with their
-- reasons, including the factors that didn't count and why (e.g. a school
-- during the holidays), so the app never shows a number it can't explain.
--
-- Jobs keep the inputs current inside Postgres, like the site sync:
--   private.sync_places()           monthly: schools, kindergartens, care homes,
--                                   hospitals, fire stations, Stadtbahn stops and
--                                   main roads from the city; crossings and bus
--                                   stops from OpenStreetMap; school and public
--                                   holidays from OpenHolidays
--   private.refresh_site_context()  hourly after the site sync: each site's
--                                   closures, road and surroundings
--   trigger on public.obstacles     how far a route's path runs inside each site
-- The app calls public.site_ratings() and public.route_site_ratings().
--
-- No network calls until a job runs. After pasting this into the SQL editor, run
--   select private.sync_places();
--   select private.refresh_site_context();
-- once, or wait for the jobs. Safe to run again.

-- What a site closes (#12) -----------------------------------------------------

do $$ begin
  create type public.closure_kind as enum (
    'full', 'carriageway', 'half', 'narrowing', 'signal', 'one_way',
    'sidewalk', 'moving', 'parking', 'unknown');
exception when duplicate_object then null;
end $$;

-- declared in this order so max() returns the worst impact
do $$ begin
  create type public.impact as enum ('none', 'slowed', 'blocked');
exception when duplicate_object then null;
end $$;

-- #12's defaults, with the decisions in docs/route-planning-open-questions.md:
-- a one-way rule blocks cars and bikes both ways, an unnamed restriction has no effect.
create table if not exists public.closure_impacts (
  closure public.closure_kind not null,
  modality public.modality not null,
  impact public.impact not null,
  -- extra time for passing a slowed site
  penalty_s integer not null default 0 check (penalty_s >= 0),
  primary key (closure, modality)
);

insert into public.closure_impacts (closure, modality, impact, penalty_s) values
  ('full', 'car', 'blocked', 0), ('full', 'bike', 'blocked', 0), ('full', 'pedestrian', 'slowed', 60),
  ('carriageway', 'car', 'slowed', 120), ('carriageway', 'bike', 'slowed', 60), ('carriageway', 'pedestrian', 'none', 0),
  ('half', 'car', 'slowed', 120), ('half', 'bike', 'slowed', 60), ('half', 'pedestrian', 'none', 0),
  ('narrowing', 'car', 'slowed', 60), ('narrowing', 'bike', 'slowed', 30), ('narrowing', 'pedestrian', 'none', 0),
  ('signal', 'car', 'slowed', 60), ('signal', 'bike', 'slowed', 60), ('signal', 'pedestrian', 'slowed', 30),
  ('one_way', 'car', 'blocked', 0), ('one_way', 'bike', 'blocked', 0), ('one_way', 'pedestrian', 'none', 0),
  ('sidewalk', 'car', 'none', 0), ('sidewalk', 'bike', 'none', 0), ('sidewalk', 'pedestrian', 'blocked', 0),
  ('moving', 'car', 'slowed', 60), ('moving', 'bike', 'slowed', 30), ('moving', 'pedestrian', 'none', 0),
  ('parking', 'car', 'none', 0), ('parking', 'bike', 'none', 0), ('parking', 'pedestrian', 'none', 0),
  ('unknown', 'car', 'none', 0), ('unknown', 'bike', 'none', 0), ('unknown', 'pedestrian', 'none', 0)
on conflict do nothing;

-- The feed's restriction field is empty, so the title says what a site closes,
-- e.g. "Im Karrenberg - Fahrbahnsanierung // Vollsperrung". The same patterns as
-- dashboard/src/model/closures.ts; \y is a word boundary in Postgres.
create or replace function public.classify_closures(p_title text)
returns public.closure_kind[]
language plpgsql
immutable parallel safe
set search_path = ''
as $$
declare
  t text := replace(lower(coalesce(p_title, '')), 'ß', 'ss');
  kinds text[] := '{}';
begin
  if t ~ 'geh\w*sp|sp\.?\s*-?\s*gehweg|sperrung\s+(des\s+|der\s+)?(fuss|geh)weg' then kinds := kinds || 'sidewalk'::text; end if;
  if t ~ 'richtungsfahrbahn' then kinds := kinds || 'carriageway'::text; end if;
  -- "Vollsperrung Fußweg" closes the sidewalk and "Vollsperrung der Richtungsfahrbahn" one carriageway, not the street
  if regexp_replace(t, 'vollsperrung\s+(des\s+|der\s+)?((fuss|geh)weg\w*|richtungsfahrbahn)', ' ', 'g') ~ 'vollsperrung|\yvsp\y|voll\s*gesperrt' then
    -- a path as the place ("Emscherradweg zw. …") means the closure closes that path, not a street
    kinds := kinds || case when split_part(t, ' - ', 1) ~ 'radweg|radeweg|fussgängerbrücke|fussweg|gehweg' then 'sidewalk' else 'full' end;
  end if;
  if t ~ 'halbseit|halbs\.?\s*sp|halb\.\s*sp|wechselseitig' then kinds := kinds || 'half'::text; end if;
  if t ~ 'einengung|spureinzug|verengung|fahrstreifenreduz' then kinds := kinds || 'narrowing'::text; end if;
  if t ~ '\ylsa\y|ampel' then kinds := kinds || 'signal'::text; end if;
  if t ~ 'einbahn' then kinds := kinds || 'one_way'::text; end if;
  if t ~ 'wanderbaustelle' then kinds := kinds || 'moving'::text; end if;
  if t ~ 'parkstreifen' then kinds := kinds || 'parking'::text; end if;
  if cardinality(kinds) = 0 then return '{unknown}'; end if;
  -- each kind once, in the enum's order
  return array(select k from unnest(enum_range(null::public.closure_kind)) k where k::text = any (kinds));
end;
$$;

-- "Vollsperrung (tagsüber)", "Fahrspureinzug (09-15 Uhr)": counts only between 6:00 and 22:00 (#12).
create or replace function public.is_daytime_only(p_title text)
returns boolean
language sql
immutable parallel safe
set search_path = ''
as $$
  select replace(lower(coalesce(p_title, '')), 'ß', 'ss')
    ~ 'tagsüber|tagsueber|\(\s*\d{1,2}(:\d{2})?\s*[-–]\s*\d{1,2}(:\d{2})?\s*uhr'
$$;

-- The numbers ------------------------------------------------------------------

create table if not exists public.rating_weights (
  key text primary key,
  value double precision not null,
  -- shown in the app's "How scores work"
  description text not null
);

-- on conflict do nothing: running this again keeps values tuned since
insert into public.rating_weights (key, value, description) values
  ('disruption_max', 6, 'Most points for what a site closes'),
  ('closure_blocked', 1, 'Share of the disruption points when the site blocks the mode'),
  ('closure_slowed_120', 0.6, 'Share when it slows the mode by 120 s or more, e.g. a half closure for cars'),
  ('closure_slowed_60', 0.4, 'Share when it slows the mode by 60 s or more, e.g. a narrowing or temporary lights for cars'),
  ('closure_slowed_30', 0.25, 'Share when it slows the mode by less, e.g. a narrowing for bikes'),
  ('road_main', 1, 'Road factor for cars and bikes on a main road'),
  ('road_through', 0.6, 'Road factor for cars and bikes on a through road'),
  ('road_other', 0.3, 'Road factor for cars and bikes on any other street'),
  ('road_main_walk', 1, 'Road factor on foot on a main road'),
  ('road_through_walk', 0.8, 'Road factor on foot on a through road'),
  ('road_other_walk', 0.6, 'Road factor on foot on any other street: a closed sidewalk still sends people into the road'),
  ('rush_hour_factor', 1.3, 'Cars on main and through roads at rush hour, when the site slows rather than blocks'),
  ('rush_morning_from_h', 7, 'Morning rush hour starts, Mon–Fri'),
  ('rush_morning_to_h', 9, 'Morning rush hour ends'),
  ('rush_evening_from_h', 16, 'Evening rush hour starts, Mon–Fri'),
  ('rush_evening_to_h', 18, 'Evening rush hour ends'),
  ('surroundings_max', 4, 'Most points for what is around a site'),
  ('school_radius_m', 150, 'A school this close to the site counts'),
  ('school_from_h', 7, 'School points count from this hour on school days'),
  ('school_to_h', 17, 'School points count until this hour'),
  ('school_primary_points', 1.5, 'A primary or special school nearby'),
  ('school_other_points', 1, 'Any other school nearby'),
  ('crossing_radius_m', 20, 'A crossing with lights, markings or a zebra this close to the site counts'),
  ('school_route_radius_m', 300, 'A crossing this close to a primary or special school is on a school route'),
  ('school_route_crossing_points', 1.5, 'Crossings on a school route, on school days'),
  ('crossing_points', 0.5, 'Other crossings, by car or bike'),
  ('crossing_points_walk', 1, 'Other crossings, on foot'),
  ('care_radius_m', 100, 'A kindergarten or care home this close counts'),
  ('care_points', 0.5, 'Kindergarten or care home nearby, by car or bike'),
  ('care_points_walk', 1, 'Kindergarten or care home nearby, on foot'),
  ('fire_station_radius_m', 500, 'A fire and rescue station this close counts'),
  ('hospital_radius_m', 300, 'A hospital this close counts'),
  ('emergency_points', 1, 'Emergency access, for cars'),
  ('bus_stop_radius_m', 30, 'A bus stop this close counts'),
  ('rail_stop_radius_m', 50, 'A Stadtbahn stop this close counts'),
  ('transit_points', 0.5, 'Bus or Stadtbahn stop, by car or bike'),
  ('transit_points_walk', 1, 'Bus or Stadtbahn stop, on foot'),
  ('nearby_works_radius_m', 300, 'Other works this close count'),
  ('nearby_works_min_disruption', 3, 'Other works count when they get at least this many disruption points for cars'),
  ('nearby_works_points', 1, 'Other works nearby on the same day, by car or bike'),
  ('daytime_from_h', 6, 'Daytime-only works start'),
  ('daytime_to_h', 22, 'Daytime-only works end'),
  ('reach_m', 5, 'A path this close to a site''s area runs inside it'),
  ('uses_street_m', 20, 'A path that runs further than this inside a site uses its street'),
  ('crossing_weight', 0.3, 'Share of a slowed site''s score that counts when a route only crosses it'),
  ('road_reach_m', 8, 'A road''s centre line this close to a site runs through it'),
  ('road_along_m', 30, 'A road counts as the site''s road when it runs this far through it'),
  ('road_along_named_m', 10, 'Or this far, when the site''s title names the road')
on conflict (key) do nothing;

-- What is around the sites --------------------------------------------------------

create table if not exists public.places (
  id bigint generated always as identity primary key,
  kind text not null check (kind in (
    'school', 'kindergarten', 'care_home', 'hospital', 'fire_station', 'rail_stop', 'bus_stop', 'crossing')),
  -- school type as the city writes it (Grundschule, Foerderschule, …); crossing type (traffic_signals, marked, zebra)
  subtype text,
  name text,
  location extensions.geography(point, 4326) not null,
  source text not null check (source in ('dortmund', 'osm')),
  synced_at timestamptz not null default now()
);

create index if not exists places_location_idx on public.places using gist (location);
create index if not exists places_kind_idx on public.places (kind, subtype);

-- Main and through roads from the city's street register; any other street is 'other'.
create table if not exists public.roads (
  id bigint generated always as identity primary key,
  name text not null,
  road_class text not null check (road_class in ('main', 'through')),
  -- as the register writes it
  register_class text not null,
  line extensions.geography(multilinestring, 4326) not null,
  synced_at timestamptz not null default now()
);

create index if not exists roads_line_idx on public.roads using gist (line);

create table if not exists public.school_free_days (
  kind text not null check (kind in ('school_holiday', 'public_holiday')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  name text not null,
  primary key (kind, starts_on, name)
);

-- One row per site: everything about it that doesn't depend on the travel time.
create table if not exists public.site_context (
  site_id text primary key references public.construction_sites(id) on delete cascade,
  closures public.closure_kind[] not null,
  daytime_only boolean not null,
  road_class text not null check (road_class in ('main', 'through', 'other')),
  road_name text,
  -- the nearest of each within 1 km of the site's area, null when there is none
  primary_school_name text,
  primary_school_m real,
  school_name text,
  school_type text,
  school_m real,
  kindergarten_name text,
  kindergarten_m real,
  care_home_name text,
  care_home_m real,
  hospital_name text,
  hospital_m real,
  fire_station_name text,
  fire_station_m real,
  bus_stop_name text,
  bus_stop_m real,
  rail_stop_name text,
  rail_stop_m real,
  -- crossings with lights, markings or a zebra within crossing_radius_m of the site…
  crossings integer not null default 0,
  -- …and how many of them lie within school_route_radius_m of a primary or special school
  school_route_crossings integer not null default 0,
  -- other sites within nearby_works_radius_m with at least nearby_works_min_disruption for cars: [{"id", "m"}]
  nearby_sites jsonb not null default '[]',
  refreshed_at timestamptz not null default now()
);

-- Anyone can read all of it, so the app can show where every point comes from; only the jobs write.
do $$
declare t text;
begin
  foreach t in array array['closure_impacts', 'rating_weights', 'places', 'roads', 'school_free_days', 'site_context'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Anyone can read %s" on public.%I', t, t);
    execute format('create policy "Anyone can read %s" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Loading the open data ---------------------------------------------------------
-- Each loader replaces its rows only when it found some, so an outage or a
-- changed feed keeps the last good data.

-- A city dataset exported as a JSON array (objektname, objektart, geo_point_2d).
create or replace function private.store_city_places(p_kind text, p_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  last_id bigint;
  n integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'expected a JSON array of % rows', p_kind;
  end if;
  select coalesce(max(id), 0) into last_id from public.places where source = 'dortmund' and kind = p_kind;
  insert into public.places (kind, subtype, name, location, source)
  select p_kind, r.subtype, r.name,
    extensions.st_setsrid(extensions.st_makepoint(r.lon, r.lat), 4326)::extensions.geography, 'dortmund'
  from (
    select nullif(trim(e->>'objektname'), '') as name, nullif(trim(e->>'objektart'), '') as subtype,
      (e->'geo_point_2d'->>'lon')::double precision as lon, (e->'geo_point_2d'->>'lat')::double precision as lat
    from jsonb_array_elements(p_rows) e
    where jsonb_typeof(e->'geo_point_2d'->'lon') = 'number' and jsonb_typeof(e->'geo_point_2d'->'lat') = 'number'
  ) r
  where r.name is not null
    and case p_kind
      -- the traffic school teaches cycling, it has no pupils there all day
      when 'school' then r.subtype is distinct from 'Verkehrsschule'
      -- staffed around the clock, unlike the volunteer Löschzüge
      when 'fire_station' then r.name like 'Feuer- und Rettungswache%'
      -- not day clinics or rehab clinics
      when 'hospital' then r.subtype = 'KrankenhausKlinik'
      else true
    end;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no usable % rows', p_kind; end if;
  delete from public.places where source = 'dortmund' and kind = p_kind and id <= last_id;
  return n;
end;
$$;

-- Overpass nodes: crossings with lights, markings or a zebra, and bus stops.
create or replace function private.store_osm_places(p_elements jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  last_id bigint;
  n integer;
begin
  if jsonb_typeof(p_elements) is distinct from 'array' then raise exception 'expected the Overpass elements array'; end if;
  select coalesce(max(id), 0) into last_id from public.places where source = 'osm';
  insert into public.places (kind, subtype, name, location, source)
  select case when tags->>'highway' = 'bus_stop' then 'bus_stop' else 'crossing' end,
    case
      when tags->>'highway' = 'bus_stop' then null
      when tags->>'crossing' = 'traffic_signals' then 'traffic_signals'
      when tags->>'crossing_ref' = 'zebra' then 'zebra'
      else tags->>'crossing'
    end,
    nullif(trim(tags->>'name'), ''),
    extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography, 'osm'
  from (
    select e->'tags' as tags, (e->>'lon')::double precision as lon, (e->>'lat')::double precision as lat
    from jsonb_array_elements(p_elements) e
    where e->>'type' = 'node' and jsonb_typeof(e->'lon') = 'number' and jsonb_typeof(e->'lat') = 'number'
  ) node
  where tags->>'highway' = 'bus_stop'
     or (tags->>'highway' = 'crossing'
         and (tags->>'crossing' in ('traffic_signals', 'marked', 'zebra') or tags->>'crossing_ref' = 'zebra'));
  get diagnostics n = row_count;
  if not exists (select 1 from public.places where source = 'osm' and kind = 'crossing' and id > last_id)
     or not exists (select 1 from public.places where source = 'osm' and kind = 'bus_stop' and id > last_id) then
    raise exception 'no usable crossings or bus stops from OpenStreetMap';
  end if;
  delete from public.places where source = 'osm' and id <= last_id;
  return n;
end;
$$;

-- null for anything that isn't a usable line, instead of failing the whole load
create or replace function private.lines_from_geojson(shape jsonb)
returns extensions.geography
language plpgsql
immutable strict
set search_path = ''
as $$
begin
  return extensions.st_multi(extensions.st_geomfromgeojson(shape))::extensions.geography(multilinestring, 4326);
exception when others then
  return null;
end;
$$;

-- The street register (fb62-strassenabschnitte) exported as a JSON array.
create or replace function private.store_roads(p_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  last_id bigint;
  n integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'expected a JSON array of street segments'; end if;
  select coalesce(max(id), 0) into last_id from public.roads;
  insert into public.roads (name, road_class, register_class, line)
  select name, case when cls = 'Verkehrsstraße' then 'through' else 'main' end, cls, line
  from (
    select trim(e->>'strassenname') as name, e->>'strassenklasse' as cls,
      private.lines_from_geojson(e->'geo_shape'->'geometry') as line
    from jsonb_array_elements(p_rows) e
    -- "Hauptverkehrstraße" is spelt so in the register
    where e->>'strassenklasse' in ('Hauptverkehrstraße', 'Verbindungsstrasse zu BAB,B,L,K', 'Verkehrsstraße')
  ) r
  where line is not null and coalesce(name, '') <> '';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no usable street segments'; end if;
  delete from public.roads where id <= last_id;
  return n;
end;
$$;

-- OpenHolidays rows (startDate, endDate, name: [{language, text}]).
create or replace function private.store_school_free_days(p_kind text, p_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare n integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array'
     or not exists (select 1 from jsonb_array_elements(p_rows) e where e ? 'startDate' and e ? 'endDate') then
    raise exception 'no usable % rows', p_kind;
  end if;
  delete from public.school_free_days where kind = p_kind;
  insert into public.school_free_days (kind, starts_on, ends_on, name)
  select p_kind, (e->>'startDate')::date, (e->>'endDate')::date,
    coalesce(
      (select x->>'text' from jsonb_array_elements(e->'name') x where x->>'language' = 'DE' limit 1),
      e->'name'->0->>'text',
      p_kind)
  from jsonb_array_elements(p_rows) e
  where e ? 'startDate' and e ? 'endDate'
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function private.fetch_json(p_url text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare res record;
begin
  select h.status, h.content into res
  from extensions.http((
    'GET', p_url,
    array[extensions.http_header('User-Agent', 'domove (https://github.com/xitij27/domove)')],
    null, null
  )::extensions.http_request) h;
  if res.status <> 200 then
    raise exception 'HTTP % from %', res.status, split_part(p_url, '?', 1);
  end if;
  return res.content::jsonb;
end;
$$;

-- Returns what each source loaded, or why it failed.
create or replace function private.sync_places()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  ods constant text := 'https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets/';
  poi constant text := '/exports/json?select=objektname,objektart,geo_point_2d';
  holidays constant text := 'https://openholidaysapi.org/%s?countryIsoCode=DE&subdivisionCode=DE-NW&languageIsoCode=DE&validFrom=%s&validTo=%s';
  overpass constant text := '[out:json][timeout:120];area["name"="Dortmund"]["admin_level"="6"]->.d;'
    || '(node(area.d)["highway"="crossing"];node(area.d)["highway"="bus_stop"];);out qt;';
  summary jsonb := '{}';
  step record;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '180000');
  for step in
    select * from (values
      ('school', array['schulen']),
      ('kindergarten', array['kindergarten']),
      ('care_home', array['tagespflegeeinrichtung', 'behindertenwohnheim']),
      ('hospital', array['krankenhaus']),
      ('fire_station', array['feuerwehr']),
      ('rail_stop', array['haltestellen'])
    ) as v(kind, datasets)
  loop
    begin
      summary := summary || jsonb_build_object(step.kind, private.store_city_places(step.kind, (
        select jsonb_agg(row_data)
        from unnest(step.datasets) ds,
          jsonb_array_elements(private.fetch_json(ods || ds || poi)) row_data)));
    exception when others then
      summary := summary || jsonb_build_object(step.kind, sqlerrm);
      raise warning 'syncing % failed: %', step.kind, sqlerrm;
    end;
  end loop;

  begin
    summary := summary || jsonb_build_object('roads', private.store_roads(private.fetch_json(
      ods || 'fb62-strassenabschnitte/exports/json?select=strassenname,strassenklasse,geo_shape&where='
      || extensions.urlencode('strassenklasse in ("Hauptverkehrstraße","Verbindungsstrasse zu BAB,B,L,K","Verkehrsstraße")'))));
  exception when others then
    summary := summary || jsonb_build_object('roads', sqlerrm);
    raise warning 'syncing roads failed: %', sqlerrm;
  end;

  begin
    summary := summary || jsonb_build_object('osm', private.store_osm_places(private.fetch_json(
      'https://overpass-api.de/api/interpreter?data=' || extensions.urlencode(overpass))->'elements'));
  exception when others then
    summary := summary || jsonb_build_object('osm', sqlerrm);
    raise warning 'syncing OpenStreetMap failed: %', sqlerrm;
  end;

  for step in select * from (values ('school_holiday', 'SchoolHolidays'), ('public_holiday', 'PublicHolidays')) as v(kind, endpoint) loop
    begin
      summary := summary || jsonb_build_object(step.kind, private.store_school_free_days(step.kind, private.fetch_json(
        format(holidays, step.endpoint, current_date - 31, current_date + 400))));
    exception when others then
      summary := summary || jsonb_build_object(step.kind, sqlerrm);
      raise warning 'syncing % failed: %', step.kind, sqlerrm;
    end;
  end loop;

  return summary;
end;
$$;

-- Each site's surroundings ---------------------------------------------------------

-- Street names compared without case, punctuation or the "Str." abbreviation, as the dashboard does.
create or replace function public.street_key(p_name text)
returns text
language sql
immutable parallel safe
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(replace(lower(coalesce(p_name, '')), 'ß', 'ss'), '\ystr\y\.?', 'strasse', 'g'),
    '[^a-z0-9äöüÄÖÜ]+', '', 'g')
$$;

-- What a site's closures do to a mode on its road: the disruption points before rush hour.
create or replace function public.site_disruption(p_closures public.closure_kind[], p_road_class text, p_modality public.modality)
returns table (impact public.impact, penalty_s integer, closure_factor double precision, road_factor double precision, points numeric)
language sql
stable
set search_path = ''
as $$
  with w as (
    select jsonb_object_agg(key, value) as w from public.rating_weights
  ), i as (
    -- the worst impact for the mode, and the highest penalty among its slowed kinds (#12)
    select coalesce(max(ci.impact), 'none') as impact,
      coalesce(max(ci.penalty_s) filter (where ci.impact = 'slowed'), 0) as penalty_s
    from public.closure_impacts ci
    where ci.modality = p_modality and ci.closure = any (p_closures)
  ), f as (
    select i.impact, i.penalty_s,
      case i.impact
        when 'blocked' then (w->>'closure_blocked')::double precision
        when 'slowed' then case
          when i.penalty_s >= 120 then (w->>'closure_slowed_120')::double precision
          when i.penalty_s >= 60 then (w->>'closure_slowed_60')::double precision
          else (w->>'closure_slowed_30')::double precision
        end
        else 0
      end as closure_factor,
      (w->>(case coalesce(p_road_class, 'other') when 'main' then 'road_main' when 'through' then 'road_through' else 'road_other' end
        || case when p_modality = 'pedestrian' then '_walk' else '' end))::double precision as road_factor,
      (w->>'disruption_max')::double precision as max_points
    from i, w
  )
  select impact, penalty_s, closure_factor, road_factor,
    round(least(max_points, max_points * closure_factor * road_factor)::numeric, 1)
  from f
$$;

create or replace function private.nearest_place(p_area extensions.geography, p_kind text, p_subtypes text[] default null)
returns table (name text, subtype text, m real)
language sql
stable
set search_path = ''
as $$
  select p.name, p.subtype, extensions.st_distance(p.location, p_area)::real
  from public.places p
  where p.kind = p_kind
    and (p_subtypes is null or p.subtype = any (p_subtypes))
    and extensions.st_dwithin(p.location, p_area, 1000)
  order by extensions.st_distance(p.location, p_area)
  limit 1
$$;

create or replace function private.refresh_site_context()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  w jsonb := (select jsonb_object_agg(key, value) from public.rating_weights);
  primary_schools constant text[] := array['Grundschule', 'Foerderschule'];
  n integer;
begin
  insert into public.site_context as c (
    site_id, closures, daytime_only, road_class, road_name,
    primary_school_name, primary_school_m, school_name, school_type, school_m,
    kindergarten_name, kindergarten_m, care_home_name, care_home_m,
    hospital_name, hospital_m, fire_station_name, fire_station_m,
    bus_stop_name, bus_stop_m, rail_stop_name, rail_stop_m,
    crossings, school_route_crossings, nearby_sites, refreshed_at)
  select s.id, public.classify_closures(s.title), public.is_daytime_only(s.title),
    coalesce(road.road_class, 'other'), road.name,
    ps.name, ps.m, sc.name, sc.subtype, sc.m,
    kg.name, kg.m, ch.name, ch.m,
    hs.name, hs.m, fs.name, fs.m,
    bs.name, bs.m, rs.name, rs.m,
    cr.crossings, cr.school_route, '[]', now()
  from (
    -- a site without an area counts as a circle of 25 m, as on the dashboard
    select cs.id, cs.title, coalesce(cs.geom, extensions.st_buffer(cs.location, 25)) as area
    from public.construction_sites cs
  ) s
  -- the road that runs furthest through the site, main roads first
  left join lateral (
    select r.road_class, r.name
    from (
      select r.road_class, r.name, r.name_key,
        extensions.st_length(extensions.st_intersection(r.line,
          extensions.st_buffer(s.area, (w->>'road_reach_m')::double precision))) as along
      from (select rd.*, public.street_key(rd.name) as name_key from public.roads rd) r
      where extensions.st_dwithin(r.line, s.area, (w->>'road_reach_m')::double precision)
    ) r
    where r.along >= case
      when length(r.name_key) > 3 and strpos(public.street_key(s.title), r.name_key) > 0 then (w->>'road_along_named_m')::double precision
      else (w->>'road_along_m')::double precision
    end
    order by r.road_class = 'main' desc, r.along desc
    limit 1
  ) road on true
  left join lateral private.nearest_place(s.area, 'school', primary_schools) ps on true
  left join lateral private.nearest_place(s.area, 'school') sc on true
  left join lateral private.nearest_place(s.area, 'kindergarten') kg on true
  left join lateral private.nearest_place(s.area, 'care_home') ch on true
  left join lateral private.nearest_place(s.area, 'hospital') hs on true
  left join lateral private.nearest_place(s.area, 'fire_station') fs on true
  left join lateral private.nearest_place(s.area, 'bus_stop') bs on true
  left join lateral private.nearest_place(s.area, 'rail_stop') rs on true
  left join lateral (
    select count(*)::integer as crossings,
      (count(*) filter (where exists (
        select 1 from public.places y
        where y.kind = 'school' and y.subtype = any (primary_schools)
          and extensions.st_dwithin(y.location, x.location, (w->>'school_route_radius_m')::double precision))))::integer as school_route
    from public.places x
    where x.kind = 'crossing' and extensions.st_dwithin(x.location, s.area, (w->>'crossing_radius_m')::double precision)
  ) cr on true
  on conflict (site_id) do update set
    closures = excluded.closures, daytime_only = excluded.daytime_only,
    road_class = excluded.road_class, road_name = excluded.road_name,
    primary_school_name = excluded.primary_school_name, primary_school_m = excluded.primary_school_m,
    school_name = excluded.school_name, school_type = excluded.school_type, school_m = excluded.school_m,
    kindergarten_name = excluded.kindergarten_name, kindergarten_m = excluded.kindergarten_m,
    care_home_name = excluded.care_home_name, care_home_m = excluded.care_home_m,
    hospital_name = excluded.hospital_name, hospital_m = excluded.hospital_m,
    fire_station_name = excluded.fire_station_name, fire_station_m = excluded.fire_station_m,
    bus_stop_name = excluded.bus_stop_name, bus_stop_m = excluded.bus_stop_m,
    rail_stop_name = excluded.rail_stop_name, rail_stop_m = excluded.rail_stop_m,
    crossings = excluded.crossings, school_route_crossings = excluded.school_route_crossings,
    refreshed_at = excluded.refreshed_at;
  get diagnostics n = row_count;

  -- Other serious works close by. Whether they run on the same day is checked when rating.
  update public.site_context c set nearby_sites = coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'm', round(o.m::numeric)) order by o.m)
    from (
      select oc.site_id as id,
        extensions.st_distance(coalesce(a.geom, extensions.st_buffer(a.location, 25)), coalesce(b.geom, extensions.st_buffer(b.location, 25))) as m
      from public.construction_sites a, public.site_context oc
      join public.construction_sites b on b.id = oc.site_id
      where a.id = c.site_id and oc.site_id <> c.site_id
        and extensions.st_dwithin(coalesce(a.geom, extensions.st_buffer(a.location, 25)), coalesce(b.geom, extensions.st_buffer(b.location, 25)),
          (w->>'nearby_works_radius_m')::double precision)
        and (select d.points from public.site_disruption(oc.closures, oc.road_class, 'car') d)
          >= (w->>'nearby_works_min_disruption')::numeric
    ) o
  ), '[]');

  return n;
end;
$$;

-- The rating ---------------------------------------------------------------------

-- Every factor goes into `reasons` as {"factor", "points", …details}. A factor that
-- applies to the site but doesn't count at this time has points 0 and
-- "not_counted" saying why (weekend, school_holiday, public_holiday,
-- outside_school_hours, not_rush_hour, not_same_day). The points of the reasons
-- add up to the score; each is rounded to 0.1 first.
create or replace function public.site_ratings(
  p_modality public.modality,
  p_at timestamptz default now(),
  p_site_ids text[] default null
)
returns table (
  site_id text,
  rating integer,        -- 0–10, the score rounded half up
  score numeric,         -- disruption + surroundings, at most 10
  band text,             -- none, low (1–3), medium (4–6), high (7–8), severe (9–10)
  impact public.impact,  -- what the site does to the mode
  active boolean,        -- whether it runs at p_at (dates, and the hours of daytime-only works)
  starts_on date,
  ends_on date,
  disruption numeric,
  surroundings numeric,
  rated_at timestamptz,
  reasons jsonb
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  w jsonb := (select jsonb_object_agg(rw.key, rw.value) from public.rating_weights rw);
  on_day date := (p_at at time zone 'Europe/Berlin')::date;
  at_hour numeric := extract(hour from p_at at time zone 'Europe/Berlin') + extract(minute from p_at at time zone 'Europe/Berlin') / 60;
  is_weekday boolean := extract(isodow from p_at at time zone 'Europe/Berlin') <= 5;
  holiday text := (select f.name from public.school_free_days f
    where f.kind = 'public_holiday' and (p_at at time zone 'Europe/Berlin')::date between f.starts_on and f.ends_on limit 1);
  school_break text := (select f.name from public.school_free_days f
    where f.kind = 'school_holiday' and (p_at at time zone 'Europe/Berlin')::date between f.starts_on and f.ends_on limit 1);
  work_day boolean;
  school_hours boolean;
  school_time boolean;
  school_off text;
  rush boolean;
  daytime boolean;
  s record;
  d record;
  closures public.closure_kind[];
  road text;
  why jsonb;
  reason jsonb;
  points numeric;
  extra numeric;
  around numeric;
  walk boolean := p_modality = 'pedestrian';
  same_day integer;
  nearest numeric;
begin
  work_day := is_weekday and holiday is null;
  school_hours := at_hour >= (w->>'school_from_h')::numeric and at_hour < (w->>'school_to_h')::numeric;
  school_time := work_day and school_break is null and school_hours;
  school_off := case
    when school_time then null
    when not is_weekday then 'weekend'
    when holiday is not null then 'public_holiday'
    when school_break is not null then 'school_holiday'
    else 'outside_school_hours'
  end;
  rush := work_day and (
    (at_hour >= (w->>'rush_morning_from_h')::numeric and at_hour < (w->>'rush_morning_to_h')::numeric)
    or (at_hour >= (w->>'rush_evening_from_h')::numeric and at_hour < (w->>'rush_evening_to_h')::numeric));
  daytime := at_hour >= (w->>'daytime_from_h')::numeric and at_hour < (w->>'daytime_to_h')::numeric;

  for s in
    select cs.id, cs.title, cs.status, cs.starts_on as site_starts, cs.ends_on as site_ends, c.*
    from public.construction_sites cs
    left join public.site_context c on c.site_id = cs.id
    where p_site_ids is null or cs.id = any (p_site_ids)
  loop
    -- a site synced since the last refresh still gets its closures; only its surroundings wait
    closures := coalesce(s.closures, public.classify_closures(s.title));
    road := coalesce(s.road_class, 'other');
    select * into d from public.site_disruption(closures, road, p_modality);

    site_id := s.id;
    impact := d.impact;
    starts_on := s.site_starts;
    ends_on := s.site_ends;
    rated_at := p_at;
    active := (s.site_starts is not null or s.status = 'current')  -- a planned site without dates never runs (#12)
      and (s.site_starts is null or s.site_starts <= on_day)
      and (s.site_ends is null or s.site_ends >= on_day)
      and (not coalesce(s.daytime_only, public.is_daytime_only(s.title)) or daytime);

    why := jsonb_build_array(jsonb_build_object(
      'factor', 'closure', 'points', d.points, 'impact', d.impact, 'penalty_s', d.penalty_s,
      'closures', to_jsonb(closures), 'road_class', road, 'road_name', s.road_name,
      'max', (w->>'disruption_max')::numeric, 'closure_factor', d.closure_factor, 'road_factor', d.road_factor));
    disruption := d.points;

    if p_modality = 'car' and d.impact = 'slowed' and road <> 'other' then
      if rush then
        extra := least(round(d.points * ((w->>'rush_hour_factor')::numeric - 1), 1), (w->>'disruption_max')::numeric - d.points);
        why := why || jsonb_build_object('factor', 'rush_hour', 'points', extra, 'multiplier', (w->>'rush_hour_factor')::numeric);
        disruption := disruption + extra;
      else
        why := why || jsonb_build_object('factor', 'rush_hour', 'points', 0, 'not_counted', 'not_rush_hour');
      end if;
    end if;

    if coalesce(s.daytime_only, public.is_daytime_only(s.title)) then
      why := why || jsonb_build_object('factor', 'daytime_only', 'points', 0, 'running', daytime,
        'from_h', (w->>'daytime_from_h')::numeric, 'to_h', (w->>'daytime_to_h')::numeric);
    end if;

    around := 0;
    if s.refreshed_at is null then
      why := why || jsonb_build_object('factor', 'surroundings_unknown', 'points', 0);
    elsif disruption = 0 and not (walk and s.crossings > 0) then
      -- nothing changes for this mode, so what is around the site doesn't matter
      why := why || jsonb_build_object('factor', 'no_effect', 'points', 0);
    else
      -- schools
      if s.primary_school_m <= (w->>'school_radius_m')::numeric or s.school_m <= (w->>'school_radius_m')::numeric then
        if s.primary_school_m <= (w->>'school_radius_m')::numeric then
          points := (w->>'school_primary_points')::numeric;
          reason := jsonb_build_object('factor', 'school', 'name', s.primary_school_name, 'primary', true,
            'm', round(s.primary_school_m::numeric));
        else
          points := (w->>'school_other_points')::numeric;
          reason := jsonb_build_object('factor', 'school', 'name', s.school_name, 'type', s.school_type, 'primary', false,
            'm', round(s.school_m::numeric));
        end if;
        if not school_time then points := 0; end if;
        why := why || (reason || jsonb_strip_nulls(jsonb_build_object(
          'points', points, 'not_counted', school_off,
          'free_day', case school_off when 'public_holiday' then holiday when 'school_holiday' then school_break end)));
        around := around + points;
      end if;

      -- crossings
      if s.school_route_crossings > 0 then
        points := case when school_time then (w->>'school_route_crossing_points')::numeric else 0 end;
        why := why || jsonb_strip_nulls(jsonb_build_object('factor', 'school_route_crossings', 'count', s.school_route_crossings,
          'points', points, 'not_counted', school_off,
          'free_day', case school_off when 'public_holiday' then holiday when 'school_holiday' then school_break end));
        around := around + points;
      end if;
      if s.crossings > 0 and not (s.school_route_crossings > 0 and school_time) then
        points := case when walk then (w->>'crossing_points_walk')::numeric else (w->>'crossing_points')::numeric end;
        why := why || jsonb_build_object('factor', 'crossings', 'count', s.crossings, 'points', points);
        around := around + points;
      end if;

      -- kindergartens open on working days; care homes always matter
      points := case when walk then (w->>'care_points_walk')::numeric else (w->>'care_points')::numeric end;
      if s.care_home_m <= (w->>'care_radius_m')::numeric then
        why := why || jsonb_build_object('factor', 'care', 'kind', 'care_home', 'name', s.care_home_name,
          'm', round(s.care_home_m::numeric), 'points', points);
        around := around + points;
      elsif s.kindergarten_m <= (w->>'care_radius_m')::numeric then
        if not (work_day and school_hours) then points := 0; end if;
        why := why || jsonb_strip_nulls(jsonb_build_object('factor', 'care', 'kind', 'kindergarten', 'name', s.kindergarten_name,
          'm', round(s.kindergarten_m::numeric), 'points', points,
          'not_counted', case when points = 0 then case when not is_weekday then 'weekend' when holiday is not null then 'public_holiday' else 'outside_school_hours' end end));
        around := around + points;
      end if;

      -- emergency access, for cars
      if p_modality = 'car' and disruption > 0 then
        if s.fire_station_m <= (w->>'fire_station_radius_m')::numeric then
          why := why || jsonb_build_object('factor', 'emergency', 'kind', 'fire_station', 'name', s.fire_station_name,
            'm', round(s.fire_station_m::numeric), 'points', (w->>'emergency_points')::numeric);
          around := around + (w->>'emergency_points')::numeric;
        elsif s.hospital_m <= (w->>'hospital_radius_m')::numeric then
          why := why || jsonb_build_object('factor', 'emergency', 'kind', 'hospital', 'name', s.hospital_name,
            'm', round(s.hospital_m::numeric), 'points', (w->>'emergency_points')::numeric);
          around := around + (w->>'emergency_points')::numeric;
        end if;
      end if;

      -- stops
      points := case when walk then (w->>'transit_points_walk')::numeric else (w->>'transit_points')::numeric end;
      if s.rail_stop_m <= (w->>'rail_stop_radius_m')::numeric then
        why := why || jsonb_build_object('factor', 'transit', 'kind', 'rail_stop', 'name', s.rail_stop_name,
          'm', round(s.rail_stop_m::numeric), 'points', points);
        around := around + points;
      elsif s.bus_stop_m <= (w->>'bus_stop_radius_m')::numeric then
        why := why || jsonb_strip_nulls(jsonb_build_object('factor', 'transit', 'kind', 'bus_stop', 'name', s.bus_stop_name,
          'm', round(s.bus_stop_m::numeric), 'points', points));
        around := around + points;
      end if;

      -- other works close by that run on the same day, for cars and bikes
      if not walk and jsonb_array_length(s.nearby_sites) > 0 then
        select count(*), min((n->>'m')::numeric) into same_day, nearest
        from jsonb_array_elements(s.nearby_sites) n
        join public.construction_sites o on o.id = n->>'id'
        where (o.starts_on is not null or o.status = 'current')
          and (o.starts_on is null or o.starts_on <= on_day)
          and (o.ends_on is null or o.ends_on >= on_day);
        if same_day > 0 then
          why := why || jsonb_build_object('factor', 'nearby_works', 'count', same_day, 'nearest_m', nearest,
            'points', (w->>'nearby_works_points')::numeric);
          around := around + (w->>'nearby_works_points')::numeric;
        else
          why := why || jsonb_build_object('factor', 'nearby_works', 'count', jsonb_array_length(s.nearby_sites),
            'points', 0, 'not_counted', 'not_same_day');
        end if;
      end if;

      if around > (w->>'surroundings_max')::numeric then
        why := why || jsonb_build_object('factor', 'surroundings_cap', 'points', (w->>'surroundings_max')::numeric - around,
          'max', (w->>'surroundings_max')::numeric);
        around := (w->>'surroundings_max')::numeric;
      end if;
    end if;

    surroundings := around;
    score := least(10, disruption + around);
    rating := floor(score + 0.5)::integer;
    band := case when rating = 0 then 'none' when rating <= 3 then 'low' when rating <= 6 then 'medium' when rating <= 8 then 'high' else 'severe' end;
    reasons := why;
    return next;
  end loop;
end;
$$;

-- Routes ---------------------------------------------------------------------------

-- How far a route's path runs inside each site on its way, kept with the obstacle.
alter table public.obstacles
  add column if not exists along_m double precision;
do $$ begin
  alter table public.obstacles add constraint obstacles_along_non_negative check (along_m is null or along_m >= 0);
exception when duplicate_object then null;
end $$;

create or replace function private.measure_obstacle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select extensions.st_length(extensions.st_intersection(l.line, extensions.st_buffer(
      coalesce(s.geom, extensions.st_buffer(s.location, 25)),
      coalesce((select rw.value from public.rating_weights rw where rw.key = 'reach_m'), 5))))
  into new.along_m
  from private.route_lines l, public.construction_sites s
  where l.route_id = new.route_id and s.id = new.construction_site_id;
  return new;
end;
$$;

-- The obstacles job updates distance_meters on every pass, so the length follows the path.
create or replace trigger obstacles_measure
  before insert or update of distance_meters on public.obstacles
  for each row execute function private.measure_obstacle();

update public.obstacles set distance_meters = distance_meters;

-- When a route is next taken: the leaving date, the next repeat day, or today;
-- now for a route without a leaving time.
create or replace function public.route_departure(
  p_start_time time,
  p_weekdays public.weekday[],
  p_start_date date,
  p_now timestamptz default now()
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_start_time is null then p_now
    when p_start_date is not null then (p_start_date + p_start_time) at time zone 'Europe/Berlin'
    when coalesce(cardinality(p_weekdays), 0) > 0 then (
      select (d::date + p_start_time) at time zone 'Europe/Berlin'
      from pg_catalog.generate_series(
        (p_now at time zone 'Europe/Berlin')::date, (p_now at time zone 'Europe/Berlin')::date + 7, interval '1 day') d
      where extract(isodow from d)::integer = any (
          select array_position(enum_range(null::public.weekday), w) from unnest(p_weekdays) w)
        and (d::date + p_start_time) at time zone 'Europe/Berlin' >= p_now
      order by d
      limit 1)
    else ((p_now at time zone 'Europe/Berlin')::date + p_start_time) at time zone 'Europe/Berlin'
  end
$$;

-- The ratings of the sites on a route's way, for its mode at its next departure
-- (or p_at), and how much each counts for the route:
--   uses     the path runs more than uses_street_m inside the site: all of it
--   crosses  less than that, e.g. over a junction: crossing_weight of a slowed
--            site, nothing of a blocked one, since the junction stays open
--   passes   the path only comes near it: nothing
--   unknown  not measured yet: all of it
create or replace function public.route_site_ratings(p_route_id uuid, p_at timestamptz default null)
returns table (
  site_id text,
  rating integer,
  score numeric,
  band text,
  impact public.impact,
  active boolean,
  starts_on date,
  ends_on date,
  disruption numeric,
  surroundings numeric,
  rated_at timestamptz,
  reasons jsonb,
  along_m numeric,
  route_use text,
  weight numeric,
  effective_score numeric,
  effective_rating integer
)
language sql
stable
set search_path = ''
as $$
  with r as (
    select rt.modality, coalesce(p_at, public.route_departure(rt.start_time, rt.weekdays, rt.start_date)) as at
    from public.routes rt
    where rt.id = p_route_id
  ), w as (
    select jsonb_object_agg(key, value) as w from public.rating_weights
  ), rated as (
    select sr.*, round(o.along_m::numeric) as along_m,
      case
        when o.along_m is null then 'unknown'
        when o.along_m > (w.w->>'uses_street_m')::double precision then 'uses'
        when o.along_m > 0 then 'crosses'
        else 'passes'
      end as route_use,
      (w.w->>'crossing_weight')::numeric as crossing_weight
    from r
    cross join w
    cross join lateral public.site_ratings(r.modality, r.at,
      array(select ob.construction_site_id from public.obstacles ob where ob.route_id = p_route_id)) sr
    join public.obstacles o on o.route_id = p_route_id and o.construction_site_id = sr.site_id
  ), weighted as (
    select rated.*,
      case route_use
        when 'uses' then 1
        when 'unknown' then 1
        when 'crosses' then case when impact = 'blocked' then 0 else crossing_weight end
        else 0
      end::numeric as weight
    from rated
  )
  select site_id, rating, score, band, impact, active, starts_on, ends_on, disruption, surroundings, rated_at, reasons,
    along_m, route_use, weight,
    round(score * weight, 1) as effective_score,
    floor(round(score * weight, 1) + 0.5)::integer as effective_rating
  from weighted
  order by round(score * weight, 1) desc, site_id
$$;

grant execute on function public.classify_closures(text) to anon, authenticated;
grant execute on function public.is_daytime_only(text) to anon, authenticated;
grant execute on function public.street_key(text) to anon, authenticated;
grant execute on function public.site_disruption(public.closure_kind[], text, public.modality) to anon, authenticated;
grant execute on function public.site_ratings(public.modality, timestamptz, text[]) to anon, authenticated;
grant execute on function public.route_departure(time, public.weekday[], date, timestamptz) to anon, authenticated;
grant execute on function public.route_site_ratings(uuid, timestamptz) to anon, authenticated;

revoke all on function private.store_city_places(text, jsonb) from public, anon, authenticated;
revoke all on function private.store_osm_places(jsonb) from public, anon, authenticated;
revoke all on function private.lines_from_geojson(jsonb) from public, anon, authenticated;
revoke all on function private.store_roads(jsonb) from public, anon, authenticated;
revoke all on function private.store_school_free_days(text, jsonb) from public, anon, authenticated;
revoke all on function private.fetch_json(text) from public, anon, authenticated;
revoke all on function private.sync_places() from public, anon, authenticated;
revoke all on function private.nearest_place(extensions.geography, text, text[]) from public, anon, authenticated;
revoke all on function private.refresh_site_context() from public, anon, authenticated;
revoke all on function private.measure_obstacle() from public, anon, authenticated;

-- The surroundings two minutes after the hourly site sync; the open data on the
-- first of each month at 03:30 UTC. Scheduling an existing name replaces it.
select cron.schedule('refresh-site-context', '2 * * * *', 'select private.refresh_site_context()');
select cron.schedule('sync-places', '30 3 1 * *', 'select private.sync_places()');
