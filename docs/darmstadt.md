# Adding Darmstadt

Research and task list for a second city · checked 19 Oct 2026

**Outcome:** the app and dashboard work for Darmstadt as well as Dortmund, on free open sources that are kept up to date.
**Verdict:** possible, but with less data. Darmstadt publishes no machine-readable list of the city's own road works. We can get utility works (e-netz Südhessen) and federal/state-road works (Hessen), about 35 sites, against about 200 in Dortmund, with almost no planned works and no areas (lines and points only).
**Needs you:**
- One database with a `city` column (recommended: one app, one dashboard, a city switch), or a separate Supabase project and deploy per city?
- Ask Darmstadt (datenplattform@digitalstadt-darmstadt.de) to publish the city's road works, and e-netz Südhessen whether we may use their InfoMap API. Both feeds below are internal endpoints of public web pages, with no stated licence.

## Steps

1. [ ] Add a `city` column (`dortmund` | `darmstadt`) to `construction_sites` and `places`, filled with `dortmund` for existing rows; allow `darmstadt` as a `places.source`. Files: a new migration, `backend/supabase/tests/database/*.test.sql`.
   Done when: the database tests pass and `select city, count(*) from construction_sites group by 1` shows only Dortmund rows.
2. [ ] Sync the e-netz InfoMap feed hourly into `construction_sites`. Use id `enetz:<id>`, `planned` when `start` is after today, and the `mapData` line/point widened to an area (about 10 m) as `geom`. Put "Vollsperrung" in the title when `roadblock` is true so the existing `closureOf()` title parser works unchanged. File: a new migration (`private.sync_darmstadt_sites()`).
   Done when: running it returns about 30 rows, each with a `geom`, and `pg_cron` lists the job.
3. [ ] Add the Hessen roadworks feeds (current and planned) to the same function. Keep points inside the Darmstadt box, merge rows with the same `name` into one site, read `dd.mm.yyyy` dates, and use id `hessen:<name>`. `sperrungsart = 'Vollsperrung'` means a full closure.
   Done when: the A67 and B42 works appear, the planned B26 work appears as `planned`, and a second run adds no duplicates.
4. [ ] Load Darmstadt places from OpenStreetMap and its school holidays from OpenHolidays with `DE-HE`. Make the Overpass area and the holidays region in `private.sync_places()` depend on the city, and send a real `User-Agent` header. File: `20261017120000_site_ratings.sql` logic, in a new migration.
   Done when: `select private.sync_places()` reports roughly the counts in Notes for Darmstadt, and Dortmund's counts are unchanged.
5. [ ] Classify Darmstadt road importance from OSM `highway` (primary/secondary: main road, tertiary: through road) in place of `fb62-strassenabschnitte`. Files: `store_roads` and `private.sync_places()`.
   Done when: a Darmstadt site on the Rheinstraße or the Heinrichstraße rates as on a main road.
6. [ ] Dashboard: give `dashboard/src/data/sources.ts` one source set per city. For Darmstadt, take districts from `DA_ST_Stadtteile.geojson` (converted from EPSG:25832 to longitude/latitude), residents from the latest `Bestand_*.csv`, points of interest and roads from OSM, and holidays for `DE-HE`. Hide the works programme panel when a city has none.
   Done when: `npm run dev` with Darmstadt selected loads with no error banner, and every tab shows Darmstadt data.
7. [ ] Dashboard: take everything Dortmund-specific from a per-city config. That covers the map centre (`MapView.tsx`), the valid-coordinate box (`outlook.ts` `validLonLat`), the Routes landmarks (`RoutesTab.tsx`), the distance scale (`geo.ts` `KX` at 51.5° → 49.87°), the attributions and source lines (`App.tsx`, `MapView.tsx`, `trafficContext.ts`, `impact.ts`, `OutlookPanel.tsx`), and "Stadtbahn" → "Straßenbahn" in the labels.
   Done when: `git grep -i dortmund dashboard/src` hits only the Dortmund config and its tests.
8. [ ] Mobile: same per-city config. That covers the map centres (`GoogleSitesMap.tsx`, `MapboxSitesMap.tsx`), the place-search bias (`routes/places.ts`), the weather location (`weather/weather.ts`), the distance scale (`detours/geo.ts`), the source text (`ratings/HowScoresWork.tsx`), the start-place placeholder (`RouteForm.tsx`), and the quiz (hide it for Darmstadt, or add Darmstadt questions).
   Done when: with Darmstadt selected, the app opens on Darmstadt, shows its sites, plans a route there and shows Darmstadt weather.
9. [ ] Update `README.md` (data sources, who it is for) and this doc's findings.
   Done when: the README names both cities and their sources.

## Verify

- Backend: database tests in `backend/supabase/tests/database/`; run `select private.sync_darmstadt_sites(); select private.sync_places();` twice and check the row counts are the same both times.
- Dashboard: `npm test -- --run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, then `LIVE=1 npx vitest run src/live.test.ts` for each city.
- Mobile: `npm test`, `npx tsc --noEmit`, `npx expo lint`, then on a phone save a Darmstadt route that crosses a current e-netz site and check the site is listed with a way around it.

## Risks / not doing

- Thin coverage: the biggest Darmstadt disruptions (the Rheinstraßenbrücke, the 2026 resurfacing programme) are city works that no feed carries. The app will say "no works" on routes that do have them.
- Almost no planned works, so the "one week before" reminder and the dashboard's clash and best-start-date views will have little to show.
- Lines and points widened to areas are guesses at the footprint; road matching and impact scores will be rougher than Dortmund's polygons.
- Both construction feeds are undocumented endpoints that can change or disappear without notice; the sync must keep old rows when a feed fails or comes back empty, as the Dortmund one does.
- Not doing: scraping the prose on darmstadt.de, the works programme panel, or the raw traffic-counter data (possible later).

## Notes (reference only)

### Construction sites

| Source | Endpoint | Covers | Kept up to date? | Format |
|---|---|---|---|---|
| e-netz Südhessen InfoMap. This is the map embedded on the city's [Baustellenticker](https://www.darmstadt.de/leben/mobilitaet/baustellenticker). | `https://enetzinfomap.e-netz-suedhessen.de/api/v1/breakupMapData?name=Darmstadt`. Owners list: `/api/v1/breakupMapOptions` (935 Darmstadt, 923 HEAG mobilo, 907 e-netz Südhessen). | Power, water, gas and district-heating works, plus HEAG tram works: 29 current, 0 planned. The e-netz owner (907) has the same Darmstadt items. | Yes: items starting the same day, ids still rising (56588) | JSON array: `id`, `address`, `description`, `mapData` (a GeoJSON FeatureCollection as a string: LineString or Point, no polygons), `roadblock` (bool, 2 of 29 true), `start`, `end` (ISO dates). Browser requests allowed from any origin (CORS); no key. |
| Verkehrsservice Hessen (Hessen Mobil's works system plus Autobahn GmbH) | `https://verkehrsservice.hessen.de/syncdata/poiroadworks.json` and `.../poiroadworksplanned.json` | Motorways, B and L roads in all of Hessen: 891 + 386 points. Inside the Darmstadt box: 4 works (A67 ×2, B42 ×2) + 2 planned (A67, B26). | Yes: `Last-Modified` within the hour | GeoJSON points. Properties: `name` (the work's id, repeated per point), `street`, `startzeitgesamt`/`endzeitgesamt` (`dd.mm.yyyy`), `kommentar`, `sperrungsart`, `laneStatusCoded`, `von`/`bis`. No key. |
| Autobahn GmbH | `https://verkehr.autobahn.de/o/autobahn/A5/services/roadworks` | Motorways only; already included in the Hessen feed | Yes | JSON |
| The city's own road works (Mobilitätsamt / Tiefbau) | Prose on darmstadt.de and press releases only | n/a | n/a | Not machine-readable. Not on opendata.darmstadt.de, not in the Hessen system, and no Mobilithek feed found. |

Darmstadt box used for filtering: longitude 8.56–8.76, latitude 49.80–49.96.

### Other data

| Used in Dortmund | Darmstadt source | Notes |
|---|---|---|
| Districts `fb62-stadtbezirke` | `https://opendata.darmstadt.de/sites/default/files/DA_ST_Stadtteile.geojson` | 9 Stadtteile, MultiPolygon, **EPSG:25832** (must be converted). Properties `Stadtteil` (code, e.g. 500), `DAStadttei` (name). Updated 2026-08-27. |
| Residents `bevolkerungsstand-stadtbezirke` | Dataset "Bevölkerungsbestand", one CSV per quarter (`Bestand_2026_Q3_0.csv` is the latest) | Updated quarterly (Q3 2026 published 13 Oct). Separator `;`. One row per statistical Bezirk (`bezirk` 110, 120, …), so Stadtteil = `bezirk` rounded down to hundreds. Residents column most likely `ewhg`. The file name changes each quarter (sometimes with a `_0` suffix), so find the latest through `https://opendata.darmstadt.de/dcatapde/dataset/bev%C3%B6lkerungsbestand.json`. |
| Schools, kindergartens, hospitals, fire stations, Stadtbahn stops | OpenStreetMap via Overpass, `area["name"="Darmstadt"]["admin_level"="6"]` | On 19 Oct: 85 schools, 94 kindergartens, 3 hospitals, 5 fire stations, 142 tram stops (`railway=tram_stop`), 261 bus stops, 1658 crossings |
| Care homes | OpenStreetMap | Only 1 `amenity=nursing_home`; also try `social_facility`. That score factor will be weak. |
| Main roads `fb62-strassenabschnitte` | OpenStreetMap `highway=primary/secondary/tertiary` | 670 / 694 / 526 ways |
| Bike share, park and ride | OpenStreetMap `amenity=bicycle_rental`, `park_ride` | not counted |
| Works programme (Tiefbauamt) | none | drop the panel |
| School and public holidays `DE-NW` | OpenHolidays `DE-HE` | |
| (new) | "Verkehrsdaten im Rohformat 2026" on opendata.darmstadt.de | Raw traffic-counter data, updated 2026-09-18; a possible later traffic-volume factor |

### Dead ends

- opendata.darmstadt.de (DKAN 1; full list in `https://opendata.darmstadt.de/catalog.xml`): statistics, elections, traffic-signal plans and traffic counts, but no construction sites and no points of interest. Its CKAN-style API (`/api/3/action/...`) only redirects.
- stadtatlas.darmstadt.de: base-map WMS layers only.
- datenplattform.darmstadt.de: a dashboard (R Shiny), not an API.
- Mobilithek: no Darmstadt construction feed found; Hessen Mobil's feeds there need registration and a client certificate.

### Overpass

On 19 Oct, overpass-api.de rejected curl's default `User-Agent` and ones starting with `PostgreSQL`, and accepted a descriptive one. Dortmund has the same problem; see [dortmund-data-check.md](dortmund-data-check.md).
