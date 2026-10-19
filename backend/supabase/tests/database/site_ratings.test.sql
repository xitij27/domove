-- pgTAP tests for the impact ratings (docs/site-rating-and-detours.md); run with
-- `supabase test db`. The loaders get small fixtures shaped like the city's,
-- OpenStreetMap's and OpenHolidays' answers instead of the network. All writes
-- roll back.
--
-- Around latitude 51.51, 0.0001 degrees are about 11 m north–south and 7 m east–west.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(61);

-- A rectangular site area.
create function pg_temp.box(w double precision, s double precision, e double precision, n double precision)
returns extensions.geography language sql immutable as $$
  select extensions.st_multi(extensions.st_makeenvelope(w, s, e, n, 4326))::extensions.geography
$$;

-- One site's rating.
create function pg_temp.rate(p_site text, p_mode public.modality, p_at timestamptz)
returns table (rating integer, score numeric, band text, active boolean, reasons jsonb)
language sql as $$
  select rating, score, band, active, reasons from public.site_ratings(p_mode, p_at, array[p_site])
$$;

-- One reason of one site's rating.
create function pg_temp.reason(p_site text, p_mode public.modality, p_at timestamptz, p_factor text)
returns jsonb language sql as $$
  select r from pg_temp.rate(p_site, p_mode, p_at) x, jsonb_array_elements(x.reasons) r where r->>'factor' = p_factor
$$;

-- What a site closes, from its title (real titles from the feeds)
select is(public.classify_closures('Sommerbergweg - Neuanschluss Strom+Wasser // Vollsperrung'),
  '{full}'::public.closure_kind[], 'a Vollsperrung is a full closure');
select is(public.classify_closures('Kaiserstraße - Masterneuerung // Halbseitige Sperrung, Spureinzug'),
  '{half,narrowing}'::public.closure_kind[], 'a title can name several closures');
select is(public.classify_closures('Märkische Straße 87-91 - Neubau Hochbau // Gehwegsperrung teilw.'),
  '{sidewalk}'::public.closure_kind[], 'a Gehwegsperrung closes the sidewalk');
select is(public.classify_closures('An der Goymark - Herstellung Baustellenzufahrt // Vollsperrung Fußweg + Baustellenausfahrt'),
  '{sidewalk}'::public.closure_kind[], 'a Vollsperrung Fußweg closes the sidewalk, not the street');
select is(public.classify_closures('Hülshof/Oberfeldstr. - Austausch LSA // Einengung'),
  '{narrowing,signal}'::public.closure_kind[], 'LSA means temporary traffic lights');
select is(public.classify_closures('Dornstraße - Stromarbeiten'),
  '{unknown}'::public.closure_kind[], 'a title naming no restriction is unknown');
select is(public.classify_closures('Emscherradweg zw. Huckarder Str. und Mailoh - Ausbau Radweg /// Vollsperrung'),
  '{sidewalk}'::public.closure_kind[], 'a full closure of a cycle path closes a path, not a street');
select is(public.classify_closures('Zillestraße - Asphaltsanierung // Einbahnstraße'),
  '{one_way}'::public.closure_kind[], 'an Einbahnstraße is a one-way rule');
select is(public.classify_closures('A40 - Notmaßnahme Fahrbahnbelag // VSP'),
  '{full}'::public.closure_kind[], 'VSP as a word is a full closure');
select is(public.classify_closures('Busenbergstraße 8a - 20 - Arbeiten an den Stromleitungen /// Halbseitige Sperrung (Einbahnstraße)'),
  '{half,one_way}'::public.closure_kind[], 'a half closure with a one-way rule');
select ok(public.is_daytime_only('Am Markt - Kanal // Vollsperrung (tagsüber)'), 'tagsüber means daytime only');
select ok(public.is_daytime_only('Ruhrallee - Markierung // Fahrspureinzug (09-15 Uhr)'), 'hours in the title mean daytime only');
select ok(not public.is_daytime_only('Am Markt - Kanal // Vollsperrung'), 'other works run day and night');

-- Loading the open data. Start without the synced rows.
delete from public.construction_sites;
delete from public.places;
delete from public.roads;
delete from public.school_free_days;

select is(private.store_city_places('school', $$[
  {"objektname": "Grundschule am Wall", "objektart": "Grundschule", "geo_point_2d": {"lon": 7.4650, "lat": 51.5108}},
  {"objektname": "Gymnasium Ost", "objektart": "Gymnasium", "geo_point_2d": {"lon": 7.5005, "lat": 51.5212}},
  {"objektname": "Jugendverkehrsschule", "objektart": "Verkehrsschule", "geo_point_2d": {"lon": 7.47, "lat": 51.52}},
  {"objektname": "", "objektart": "Grundschule", "geo_point_2d": {"lon": 7.47, "lat": 51.52}},
  {"objektname": "Ohne Ort", "objektart": "Grundschule"}
]$$), 2, 'schools load, without the traffic school and rows without a name or place');
select throws_ok($$select private.store_city_places('school', '[]')$$, 'P0001', 'no usable school rows',
  'an empty answer is refused');
select is((select count(*)::integer from public.places where kind = 'school'), 2, 'and the schools loaded before stay');
select is(private.store_city_places('kindergarten', $$[
  {"objektname": "Kita Sonnenschein", "objektart": "Kindergarten", "geo_point_2d": {"lon": 7.4645, "lat": 51.5095}}
]$$), 1, 'kindergartens load');
select is(private.store_city_places('fire_station', $$[
  {"objektname": "Feuer- und Rettungswache 9", "objektart": null, "geo_point_2d": {"lon": 7.5255, "lat": 51.5330}},
  {"objektname": "Löschzug 12", "objektart": null, "geo_point_2d": {"lon": 7.53, "lat": 51.54}}
]$$), 1, 'only the fire stations staffed around the clock load');
select is(private.store_city_places('hospital', $$[
  {"objektname": "Klinikum", "objektart": "KrankenhausKlinik", "geo_point_2d": {"lon": 7.40, "lat": 51.48}},
  {"objektname": "Tagesklinik", "objektart": "Tagesklinik", "geo_point_2d": {"lon": 7.41, "lat": 51.48}}
]$$), 1, 'only hospitals load, not day clinics');
-- Four crossings along Kaiserstraße, 14 m past either end of the site at most, and a bus stop beside it.
select is(private.store_osm_places($$[
  {"type": "node", "id": 1, "lat": 51.51, "lon": 7.4638, "tags": {"highway": "crossing", "crossing": "traffic_signals"}},
  {"type": "node", "id": 2, "lat": 51.51, "lon": 7.4645, "tags": {"highway": "crossing", "crossing": "marked"}},
  {"type": "node", "id": 3, "lat": 51.51, "lon": 7.4655, "tags": {"highway": "crossing", "crossing": "uncontrolled", "crossing_ref": "zebra"}},
  {"type": "node", "id": 4, "lat": 51.51, "lon": 7.4662, "tags": {"highway": "crossing", "crossing": "traffic_signals"}},
  {"type": "node", "id": 5, "lat": 51.51, "lon": 7.4650, "tags": {"highway": "crossing", "crossing": "unmarked"}},
  {"type": "node", "id": 6, "lat": 51.51015, "lon": 7.4650, "tags": {"highway": "bus_stop", "name": "Wallstraße"}},
  {"type": "way", "id": 7, "tags": {"highway": "crossing"}}
]$$), 5, 'crossings with lights, markings or a zebra load, and bus stops');
select results_eq($$select subtype from public.places where kind = 'crossing' order by subtype$$,
  $$values ('marked'), ('traffic_signals'), ('traffic_signals'), ('zebra')$$, 'each crossing keeps its type');
select is(private.store_roads($$[
  {"strassenname": "Kaiserstraße", "strassenklasse": "Hauptverkehrstraße",
   "geo_shape": {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[7.46, 51.51], [7.47, 51.51]]}}},
  {"strassenname": "Nordstraße", "strassenklasse": "Hauptverkehrstraße",
   "geo_shape": {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[7.52, 51.53], [7.54, 51.53]]}}},
  {"strassenname": "Wohnweg", "strassenklasse": "Anliegerstraße",
   "geo_shape": {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[7.50, 51.52], [7.51, 51.52]]}}},
  {"strassenname": "Kaputt", "strassenklasse": "Verkehrsstraße",
   "geo_shape": {"type": "Feature", "geometry": {"type": "Point", "coordinates": [7.5, 51.5]}}}
]$$), 2, 'main and through roads load, not residential streets or broken shapes');
select is(private.store_school_free_days('school_holiday', $$[
  {"startDate": "2026-10-17", "endDate": "2026-10-31", "name": [{"language": "DE", "text": "Herbstferien"}]}
]$$), 1, 'school holidays load');
select is(private.store_school_free_days('public_holiday', $$[
  {"startDate": "2026-11-04", "endDate": "2026-11-04", "name": [{"language": "EN", "text": "Test day"}, {"language": "DE", "text": "Testfeiertag"}]}
]$$), 1, 'public holidays load');

-- Sites. kaiser runs along Kaiserstraße, a main road, next to a primary school
-- (83 m), a kindergarten (50 m), a bus stop (11 m) and the four crossings.
-- quiet is a residential street 78 m from a Gymnasium; lane closes only a
-- parking lane; north_a and north_b are full closures on Nordstraße 139 m apart,
-- 330 m from a fire station; beside lies 22 m north of Kaiserstraße.
insert into public.construction_sites (id, status, title, starts_on, ends_on, latitude, longitude, geom) values
  ('kaiser', 'current', 'Kaiserstraße - Masterneuerung // Halbseitige Sperrung, Spureinzug', '2026-10-01', '2026-12-31',
    51.51, 7.465, pg_temp.box(7.4640, 51.50995, 7.4660, 51.51005)),
  ('quiet', 'current', 'Ruhige Gasse - Kanalbau // Vollsperrung', '2026-10-01', '2026-12-31',
    51.52, 7.50, pg_temp.box(7.4995, 51.5195, 7.5005, 51.5205)),
  ('lane', 'current', 'Parkweg - Baumpflege // Sperrung Parkstreifen', '2026-10-01', '2026-12-31',
    51.51105, 7.4651, pg_temp.box(7.4650, 51.5110, 7.4652, 51.5111)),
  ('north_a', 'current', 'Nordstraße - Fahrbahnsanierung // Vollsperrung', '2026-10-01', '2026-12-31',
    51.53, 7.5255, pg_temp.box(7.5250, 51.52995, 7.5260, 51.53005)),
  ('north_b', 'current', 'Nordstraße - Leitungsbau // Vollsperrung', '2026-10-01', '2026-10-31',
    51.53, 7.5285, pg_temp.box(7.5280, 51.52995, 7.5290, 51.53005)),
  ('later', 'planned', 'Planstraße - Neubau // Vollsperrung', null, null,
    51.56, 7.56, pg_temp.box(7.5595, 51.5595, 7.5605, 51.5605)),
  ('tags', 'current', 'Tagstraße - Fräsarbeiten // Vollsperrung (tagsüber)', '2026-10-01', '2026-12-31',
    51.56, 7.58, pg_temp.box(7.5795, 51.5595, 7.5805, 51.5605)),
  ('beside', 'current', 'Seitenweg - Kanalbau // halbseitige Sperrung', '2026-10-01', '2026-12-31',
    51.51025, 7.4611, pg_temp.box(7.4610, 51.51020, 7.4612, 51.51030));

-- Surroundings
select is(private.refresh_site_context(), 8, 'every site gets its surroundings');
select results_eq($$select road_class, road_name from public.site_context where site_id in ('kaiser', 'north_a', 'quiet') order by site_id$$,
  $$values ('main', 'Kaiserstraße'), ('main', 'Nordstraße'), ('other', null::text)$$,
  'a site takes the main road through it; a site off the main roads is on another street');
select results_eq($$select crossings, school_route_crossings from public.site_context where site_id = 'kaiser'$$,
  $$values (4, 4)$$, 'crossings within 20 m count, and those within 300 m of a primary school are on a school route');
select ok((select primary_school_m between 75 and 90 and primary_school_name = 'Grundschule am Wall'
  from public.site_context where site_id = 'kaiser'), 'the nearest primary school and its distance from the site''s edge');
select is((select jsonb_path_query_array(nearby_sites, '$[*].id') from public.site_context where site_id = 'north_a'),
  '["north_b"]'::jsonb, 'another serious site within 300 m is nearby; a parking-lane closure never is');

-- Ratings. 2 Nov 2026 is a school-day Monday, 7 Nov a Saturday, 19 Oct in the
-- autumn holidays, 4 Nov the fixtures' public holiday.
select results_eq($$select rating, score, band from pg_temp.rate('kaiser', 'car', '2026-11-02 08:00+01')$$,
  $$values (9, 8.7, 'severe')$$, 'a half closure on a main road by a primary school at rush hour is severe for cars');
select is((select jsonb_agg(jsonb_build_array(r->>'factor', (r->>'points')::numeric))
    from pg_temp.rate('kaiser', 'car', '2026-11-02 08:00+01') x, jsonb_array_elements(x.reasons) r),
  '[["closure", 3.6], ["rush_hour", 1.1], ["school", 1.5], ["school_route_crossings", 1.5], ["care", 0.5], ["transit", 0.5]]'::jsonb,
  'every point comes with its reason, and they add up to the score');
select results_eq($$select rating, score from pg_temp.rate('kaiser', 'car', '2026-11-07 12:00+01')$$,
  $$values (5, 4.6)$$, 'on a Saturday the schools, the kindergarten and rush hour don''t count');
select is(pg_temp.reason('kaiser', 'car', '2026-11-07 12:00+01', 'school')->>'not_counted', 'weekend',
  'a school that doesn''t count says why');
select results_eq($$select rating, score from pg_temp.rate('kaiser', 'car', '2026-10-19 08:00+02')$$,
  $$values (6, 6.2)$$, 'in the school holidays the schools don''t count, the kindergarten does');
select is(pg_temp.reason('kaiser', 'car', '2026-10-19 08:00+02', 'school_route_crossings')->>'free_day', 'Herbstferien',
  'and the holidays are named');
select results_eq($$select rating, score from pg_temp.rate('kaiser', 'car', '2026-11-04 08:00+01')$$,
  $$values (5, 4.6)$$, 'on a public holiday there is no rush hour or school either');
select is(pg_temp.reason('kaiser', 'car', '2026-11-04 08:00+01', 'rush_hour')->>'not_counted', 'not_rush_hour',
  'rush hour that doesn''t count says so');
select results_eq($$select rating, score from pg_temp.rate('kaiser', 'pedestrian', '2026-11-02 08:00+01')$$,
  $$values (4, 4.0)$$, 'on foot a half closure changes nothing, but its school-route crossings do');
select is((pg_temp.reason('kaiser', 'pedestrian', '2026-11-02 08:00+01', 'surroundings_cap')->>'points')::numeric, -1.0,
  'surroundings above 4 points are capped, as a reason of its own');
select results_eq($$select rating, score from pg_temp.rate('kaiser', 'bike', '2026-11-02 08:00+01')$$,
  $$values (6, 6.4)$$, 'bikes are slowed less than cars and have no rush hour');
select results_eq($$select rating, score, band from pg_temp.rate('quiet', 'car', '2026-11-02 08:00+01')$$,
  $$values (3, 2.8, 'low')$$, 'a full closure of a residential street near a Gymnasium is low for cars');
select results_eq($$select rating, score from pg_temp.rate('quiet', 'car', '2026-11-07 12:00+01')$$,
  $$values (2, 1.8)$$, 'and lower on a Saturday');
select is((select jsonb_agg(r->>'factor') from pg_temp.rate('lane', 'car', '2026-11-02 08:00+01') x, jsonb_array_elements(x.reasons) r),
  '["closure", "no_effect"]'::jsonb, 'a closure that changes nothing for the mode ignores its surroundings');
select results_eq($$select rating, band from pg_temp.rate('north_a', 'car', '2026-10-20 08:00+02')$$,
  $$values (8, 'high')$$, 'a full closure of a main road near a fire station, next to other works');
select is(pg_temp.reason('north_a', 'car', '2026-11-03 08:00+01', 'nearby_works')->>'not_counted', 'not_same_day',
  'works nearby that have ended don''t count');
select is((select active from pg_temp.rate('later', 'car', '2026-11-02 08:00+01')), false,
  'a planned site without dates doesn''t run');
select is((select active from pg_temp.rate('tags', 'car', '2026-11-02 12:00+01')), true, 'daytime-only works run at noon');
select is((select active from pg_temp.rate('tags', 'car', '2026-11-02 23:00+01')), false, 'but not at night');

insert into public.construction_sites (id, status, title, starts_on, ends_on, latitude, longitude, geom) values
  ('fresh', 'current', 'Neue Straße - Kanal // Vollsperrung', '2026-10-01', '2026-12-31',
    51.56, 7.60, pg_temp.box(7.5995, 51.5595, 7.6005, 51.5605));
select is((select jsonb_agg(r->>'factor') from pg_temp.rate('fresh', 'car', '2026-11-02 08:00+01') x, jsonb_array_elements(x.reasons) r),
  '["closure", "surroundings_unknown"]'::jsonb, 'a site synced since the last refresh is rated by its closures and says its surroundings are unknown');

-- Routes. The path runs along Kaiserstraße.
insert into public.routes (id, start_location, finish_location, start_time, weekdays, modality) values
  ('00000000-0000-4000-8000-000000000011', 'SRID=4326;POINT(7.46 51.51)', 'SRID=4326;POINT(7.47 51.51)', '08:00', '{monday}', 'car');
insert into private.route_lines (route_id, request, line) values
  ('00000000-0000-4000-8000-000000000011', 'test', 'SRID=4326;LINESTRING(7.46 51.51,7.47 51.51)');
insert into public.obstacles (route_id, construction_site_id, distance_meters) values
  ('00000000-0000-4000-8000-000000000011', 'kaiser', 0),
  ('00000000-0000-4000-8000-000000000011', 'beside', 22),
  ('00000000-0000-4000-8000-000000000011', 'north_a', 2200);

select ok((select along_m between 140 and 160 from public.obstacles where construction_site_id = 'kaiser'),
  'an obstacle keeps how far the path runs inside the site, 5 m around it included');
select results_eq($$select route_use, weight, effective_rating from public.route_site_ratings('00000000-0000-4000-8000-000000000011', '2026-11-02 08:00+01') where site_id = 'kaiser'$$,
  $$values ('uses', 1.0, 9)$$, 'a route that uses the site''s street gets its whole rating');
select results_eq($$select site_id from public.route_site_ratings('00000000-0000-4000-8000-000000000011', '2026-11-02 08:00+01')$$,
  $$values ('kaiser'), ('beside'), ('north_a')$$, 'the route''s sites come worst first');
select results_eq($$select route_use, effective_score from public.route_site_ratings('00000000-0000-4000-8000-000000000011', '2026-11-02 08:00+01') where site_id = 'beside'$$,
  $$values ('passes', 0.0)$$, 'a site the route only passes doesn''t count');
update public.obstacles set along_m = 12 where construction_site_id in ('beside', 'north_a');
select results_eq($$select route_use, effective_score from public.route_site_ratings('00000000-0000-4000-8000-000000000011', '2026-11-02 08:00+01') where site_id = 'beside'$$,
  $$values ('crosses', 0.6)$$, 'a slowed site the route only crosses counts 0.3 of its score');
select results_eq($$select route_use, effective_score from public.route_site_ratings('00000000-0000-4000-8000-000000000011', '2026-11-02 08:00+01') where site_id = 'north_a'$$,
  $$values ('crosses', 0.0)$$, 'a blocked site the route only crosses doesn''t count: the junction stays open');

select is(public.route_departure('08:00', '{monday}', null, '2026-10-28 12:00+01'), '2026-11-02 08:00+01'::timestamptz,
  'a weekly route leaves next on its next repeat day');
select is(public.route_departure('08:00', '{wednesday}', null, '2026-10-28 07:00+01'), '2026-10-28 08:00+01'::timestamptz,
  'or later the same day');
select is(public.route_departure('08:00', '{}', '2026-12-24', '2026-10-28 12:00+01'), '2026-12-24 08:00+01'::timestamptz,
  'a single trip leaves on its date');
select is(public.route_departure(null, '{}', null, '2026-10-28 12:00+01'), '2026-10-28 12:00+01'::timestamptz,
  'a route without a leaving time is rated for now');

-- The weights are data
update public.rating_weights set value = 0.5 where key = 'road_other';
select results_eq($$select rating, score from pg_temp.rate('quiet', 'car', '2026-11-02 08:00+01')$$,
  $$values (4, 4.0)$$, 'changing a weight changes the ratings without a release');

-- The jobs
select is((select command from cron.job where jobname = 'sync-places'),
  $$set statement_timeout = '10min'; select private.sync_places()$$,
  'the monthly sync runs with more than the platform''s 2-minute statement timeout');

select * from finish();
rollback;
