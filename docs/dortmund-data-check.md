# Dortmund: live data check

What works and what is failing in the live Dortmund setup · checked 19 Oct 2026, 14:00–14:15 UTC, rechecked 14:20–14:50 UTC

**Outcome:** the construction sites, the dashboard and every outside service except Overpass work. The app's impact scores do not: they have been running without any of the surrounding data (roads, schools, stops, holidays) because those tables are empty in the live database.
**Needs you:** run the SQL in step 1 in the live project's SQL editor. The Supabase MCP in `.mcp.json` now reaches the live project, but writing to it needs your approval.

## Steps

1. [ ] Give the monthly sync more time and load the surroundings. In the live project's SQL editor, run these lines together:
   ```sql
   select cron.schedule('sync-places', '30 3 1 * *', $$set statement_timeout = '10min'; select private.sync_places()$$);
   set statement_timeout = '10min';
   select private.sync_places();
   ```
   then `select private.refresh_site_context();`. The first line is migration `20261019150000_sync_places_timeout.sql`. The editor shows the sync's summary: a count, or the error, for each source.
   Done when: `places`, `roads` and `school_free_days` have rows, and `site_context` shows main roads and nearby schools (the counts in the second Notes table are no longer 0).
2. [ ] If the summary shows an error for `osm`, Overpass was full (see 3 below). Run the last two lines of step 1 and the refresh again later.
   Done when: `osm` in the summary is a count, and `site_context` has bus stops and crossings.
3. [ ] Before 2027, find the works programme dataset by search instead of by its fixed name, and make the periods follow the data. Files: `dashboard/src/data/sources.ts` (`PERIODS`, `fetchProgramme`) and `dashboard/src/ui/CoordinateTab.tsx` ("Works programme 2025–2028").
   Done when: the panel shows the newest programme the Tiefbauamt has published.

## What is failing

### 1. App impact scores have no surroundings (now)

The `places`, `roads` and `school_free_days` tables are empty. Anyone may read them (row-level security allows it), so the counts are real, not hidden. As a result, for all 187 sites in `site_context`:

- the road is "other" for every site, so a full closure on a main road scores 1.8 disruption points for cars instead of 6;
- there is no nearby school, kindergarten, care home, hospital, fire station, bus stop or Stadtbahn stop, and 0 crossings, so none of those factors add points;
- "other works nearby" is empty for every site. Nearby works count only from 3 disruption points, and with no road data no site reaches that;
- school and public holidays are unknown, so factors that should pause on holidays never do.

Effect: every score in the app is too low, and the "How scores work" reasons never mention a school, stop or main road. The dashboard isn't affected: it reads the city portal directly, and its live test passes (`LIVE=1 npx vitest run src/live.test.ts`).

Cause: migration `20261017120000_site_ratings.sql` sets up a monthly job (`30 3 1 * *`) but leaves the first `select private.sync_places();` to be run by hand (its line 29), and on this database nobody ran it. Postgres's statistics, kept since 2 Oct (before these tables existed), count 0 rows ever inserted or deleted in all three tables, so they were never loaded and nothing was reset. The 17 Oct figures in `mobile/src/ratings/testRatings.ts` must come from another database, probably a local one. Without step 1, the first automatic run is 1 Nov 2026, 03:30 UTC.

### 2. A slow Overpass can cancel the whole sync (fixed in the repo; step 1 applies it)

Supabase ends every statement after 2 minutes (`statement_timeout` in `platform-defaults.conf`), pg_cron jobs included. `private.sync_places()` is one statement and waits up to 3 minutes for each download. The city and holiday downloads take under a second each, but a busy Overpass can keep a request queued for minutes. The timeout then cancels the whole function. Its `exception when others` blocks don't catch a cancel, so the city data it had already loaded is rolled back as well, and the month's run loads nothing.

Migration `20261019150000_sync_places_timeout.sql` runs the job as `set statement_timeout = '10min'; select private.sync_places()`. Postgres times each statement of such a command separately, so the sync gets the 10 minutes.

### 3. Overpass is overloaded (now, outside our control)

From 14:20 UTC on 19 Oct, overpass-api.de answered most requests with 502 "This Overpass API server is currently at capacity", and the mirrors at private.coffee, kumi.systems and mail.ru answered 500 to 504. A sync run meanwhile loads everything except crossings and bus stops: each source is loaded separately, and a failed source keeps its old rows (step 2).

The first check put these 502s down to the User-Agent. They aren't: the same User-Agent got 502 and 200 minutes apart, and only some are refused every time.

| User-Agent | Answer |
|---|---|
| none, curl's default, or a browser's (`Mozilla/5.0`) | 406 Not Acceptable, every time |
| `PostgreSQL`, `pgsql-http/1.6.1`, `domove/1.0 (+https://github.com/xitij27/domove)` | 502 while the server is full; `PostgreSQL` got 200 in between |
| `domove (https://github.com/xitij27/domove)` | no answer within 40 s while the server is full |

`private.fetch_json()` already sends `User-Agent: domove (https://github.com/xitij27/domove)` on every request, in the repo and on the live database, so nothing needs to change there.

### 4. Works programme ends with 2026's (later)

The dashboard reads `baumassnahmen-arbeitsprogramm-des-tiefbauamtes-2026-gesamtubersicht` by name, last updated 18 May 2026, with fixed periods 2025 to 2028. When the Tiefbauamt publishes a 2027 programme as a new dataset, the panel will go on showing the 2026 one without any error.

## Notes (reference only)

### Sources checked, all working

| Source | Result |
|---|---|
| Construction sites `fb66-baustellen-tagesaktuell` / `-geplant` (points and areas) | 150 + 37, processed 01:00 UTC today; the live table has 187 rows, last seen 14:00 UTC, all with an area |
| `fb62-stadtbezirke`, `haltestellen`, `schulen`, `kindergarten`, `tagespflegeeinrichtung`, `behindertenwohnheim`, `krankenhaus`, `feuerwehr`, `fahrradmietstation`, `park-and-ride`, `fb62-strassenabschnitte` | all present, processed today: 12, 123, 183, 333, 26, 60, 27, 32, 94, 32, 19510 rows |
| Main roads, as `sync_places()` asks for them (`fb62-strassenabschnitte` filtered by `strassenklasse`) | 4,021 sections: Hauptverkehrstraße 2,680, Verkehrsstraße 1,210, Verbindungsstrasse zu BAB,B,L,K 131. 1.1 MB in 0.7 s |
| The place datasets `sync_places()` loads, and OpenHolidays (`DE-NW`) | 4 to 46 kB each, under 0.4 s each |
| `bevolkerungsstand-stadtbezirke` | 36 rows, updated 18 Jun 2026 (yearly) |
| FOSSGIS Valhalla (`valhalla1.openstreetmap.de`) | 200 |
| FOSSGIS OSRM (`routing.openstreetmap.de/routed-*`) | 200 with any User-Agent, including `PostgreSQL`; 403 only when none is sent. The app and the database both send one. |
| Photon, Open-Meteo, OpenFreeMap | 200 |

### Live `site_context` on 19 Oct (187 sites)

| Field | Sites with a value |
|---|---|
| `road_class` other than "other" | 0 |
| school, kindergarten, care home, hospital, fire station, bus stop, rail stop | 0 each |
| `crossings` > 0 | 0 |
| `nearby_sites` not empty | 0 |
| closures read from titles | 187 (full 81, half 57, narrowing 24, unknown 18, lights 14, one-way 10, sidewalk 10, other 5) |

### Live jobs on 19 Oct

| Job | Schedule | Runs so far, all succeeded | Time per run |
|---|---|---|---|
| `sync-construction-sites` | hourly at :00 | 74 since 16 Oct | 1.6 s on average, 12.9 s at most |
| `refresh-site-context` | hourly at :02 | 53 since 17 Oct | 3.7 s on average |
| `detect-obstacles` | every 5 minutes | 705 since 16 Oct | 0.7 s on average, 26 s at most |
| `sync-places` | 03:30 UTC on the 1st | none yet | |

### Free plan

The live database is 21 MB of the free plan's 500 MB; over 500 MB it turns read-only. Loading the surroundings adds a few MB (4,021 road lines, about 800 city places, a few thousand OSM crossings and bus stops, about 30 holiday rows), and each monthly run replaces those rows rather than adding to them. The sync's downloads come into the database, so they don't count towards the 5 GB of monthly egress. The one thing that keeps growing is pg_cron's log, `cron.job_run_details`: about 340 rows a day, roughly 2 to 3 MB a month.
