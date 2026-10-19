# Dortmund: live data check

What works and what is failing in the live Dortmund setup · checked 19 Oct 2026, 14:00–14:15 UTC

**Outcome:** the construction sites, the dashboard and every outside service work. The app's impact scores do not: they have been running without any of the surrounding data (roads, schools, stops, holidays) because those tables are empty in the live database.
**Needs you:** someone with access to the live Supabase project has to run the sync once (step 1). It isn't in the Supabase account the MCP tools can reach, so I could only read it through the public API.

## Steps

1. [ ] Load the surroundings: in the live project's SQL editor run `select private.sync_places();` and then `select private.refresh_site_context();`.
   Done when: `places`, `roads` and `school_free_days` have rows, and `site_context` shows main roads and nearby schools (the counts in the second Notes table are no longer 0).
2. [ ] Give the Postgres HTTP calls a descriptive User-Agent, for example `perform extensions.http_set_curlopt('CURLOPT_USERAGENT', 'domove/1.0 (+https://github.com/xitij27/domove)');` at the start of `private.sync_places()`, in a new migration.
   Done when: the summary returned by `select private.sync_places();` gives counts, not an error, for `osm` (crossings and bus stops).
3. [ ] Find out why the tables are empty. `mobile/src/ratings/testRatings.ts` records live ratings on 17 Oct with surroundings points, so the data was loaded somewhere then. Either that was another database, or this one was reset.
   Done when: the cause is known and, if it was a reset, the setup steps in `docs/site-rating-and-detours.md` cover it.
4. [ ] Before 2027, find the works programme dataset by search instead of by its fixed name, and make the periods follow the data. Files: `dashboard/src/data/sources.ts` (`PERIODS`, `fetchProgramme`) and `dashboard/src/ui/CoordinateTab.tsx` ("Works programme 2025–2028").
   Done when: the panel shows the newest programme the Tiefbauamt has published.

## What is failing

### 1. App impact scores have no surroundings (now)

The `places`, `roads` and `school_free_days` tables are empty. Anyone may read them (row-level security allows it), so the counts are real, not hidden. As a result, for all 187 sites in `site_context`:

- the road is "other" for every site, so a full closure on a main road scores 1.8 disruption points for cars instead of 6;
- there is no nearby school, kindergarten, care home, hospital, fire station, bus stop or Stadtbahn stop, and 0 crossings, so none of those factors add points;
- "other works nearby" is empty for every site. Nearby works count only from 3 disruption points, and with no road data no site reaches that;
- school and public holidays are unknown, so factors that should pause on holidays never do.

Effect: every score in the app is too low, and the "How scores work" reasons never mention a school, stop or main road. The dashboard isn't affected: it reads the city portal directly, and its live test passes (`LIVE=1 npx vitest run src/live.test.ts`).

Cause: migration `20261017120000_site_ratings.sql` sets up a monthly job (`30 3 1 * *`) but leaves the first `select private.sync_places();` to be run by hand (its line 29). On this database it hasn't run, or its results are gone (step 3). Without step 1, the first automatic run is 1 Nov 2026, 03:30 UTC.

### 2. The OpenStreetMap part of that sync will probably fail (when it runs)

overpass-api.de now rejects requests by User-Agent. Tested with a minimal query:

| User-Agent | Answer |
|---|---|
| none, or curl's default | 406 Not Acceptable |
| starting with `PostgreSQL` | 502 |
| `pgsql-http/1.6.1` or a descriptive name | 200 |

`private.sync_places()` calls Overpass through the Postgres `http` extension without setting a User-Agent. I couldn't see which one the extension sends from Supabase, so this is likely, not certain. If it fails, only crossings and bus stops stay missing: each source is loaded separately, and a failed source keeps its old rows.

### 3. Works programme ends with 2026's (later)

The dashboard reads `baumassnahmen-arbeitsprogramm-des-tiefbauamtes-2026-gesamtubersicht` by name, last updated 18 May 2026, with fixed periods 2025 to 2028. When the Tiefbauamt publishes a 2027 programme as a new dataset, the panel will go on showing the 2026 one without any error.

## Notes (reference only)

### Sources checked, all working

| Source | Result |
|---|---|
| Construction sites `fb66-baustellen-tagesaktuell` / `-geplant` (points and areas) | 150 + 37, processed 01:00 UTC today; the live table has 187 rows, last seen 14:00 UTC, all with an area |
| `fb62-stadtbezirke`, `haltestellen`, `schulen`, `kindergarten`, `tagespflegeeinrichtung`, `behindertenwohnheim`, `krankenhaus`, `feuerwehr`, `fahrradmietstation`, `park-and-ride`, `fb62-strassenabschnitte` | all present, processed today: 12, 123, 183, 333, 26, 60, 27, 32, 94, 32, 19510 rows |
| `bevolkerungsstand-stadtbezirke` | 36 rows, updated 18 Jun 2026 (yearly) |
| FOSSGIS Valhalla (`valhalla1.openstreetmap.de`) | 200 |
| FOSSGIS OSRM (`routing.openstreetmap.de/routed-*`) | 200 with any User-Agent, including `PostgreSQL`; 403 only when none is sent. The app and the database both send one. |
| Photon, Open-Meteo, OpenHolidays (`DE-NW`), OpenFreeMap | 200 |

### Live `site_context` on 19 Oct (187 sites)

| Field | Sites with a value |
|---|---|
| `road_class` other than "other" | 0 |
| school, kindergarten, care home, hospital, fire station, bus stop, rail stop | 0 each |
| `crossings` > 0 | 0 |
| `nearby_sites` not empty | 0 |
| closures read from titles | 187 (full 81, half 57, narrowing 24, unknown 18, lights 14, one-way 10, sidewalk 10, other 5) |
