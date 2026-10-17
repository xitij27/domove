# do.move analytics

The existing Planner is extended in place. No mobile, backend, Supabase, root configuration, dependencies or deployment files are changed. All data access is read-only; no new ingestion service or database schema is needed.

## Audit and reused code

The dashboard uses React, TypeScript, Vite, MapLibre and the existing Turf dependency. `data/sources.ts` reads the shared construction table plus Dortmund Open Data. `useData.ts` loads once per page load/retry; changing an outlook window or selecting a site makes no data requests.

Before this change the Planner already provided the map, daily timeline, date navigation, coordination suggestions, scenario shifts, Transit, Capacity and Routes. It had no dedicated 7/14/30-day outlook, no complete project-level Traffic Context and no 35/30/20/15 Impact Score. These features now reuse:

- `model/days.ts`: inclusive day overlap and date formatting.
- `model/sites.ts`: road matching, geometry neighbours with bounding-box prefilter, scenario-aware sites.
- `model/geo.ts`: polygon/hole-aware distances in local planar metres (documented city-scale approximation).
- `model/closures.ts`: the existing German restriction classifier, wrapped for Impact Score mode scoping.
- `App.tsx`, `SitePanel`, `CoordinateTab`, `MapView`, `Timeline`: existing navigation, selection, scenario and map interactions.

`model/outlook.ts` adds source-evidence validation alongside the existing `Site` model. This is necessary because legacy display sites substitute dates and a small circle for point-only records. Synthetic defaults must not establish analytical evidence. A malformed geometry uses the existing display fallback, while its analytical geometry remains unknown.

## Disruption Points are unchanged

`weigh` in `model/sites.ts` computes `severity = weight.<kind> × road.<road>` from Settings (`model/settings.ts`). `dailyLoad` in `model/analysis.ts` sums severity for every site active on a day; the header and timeline show this daily sum. By default restriction weights are full closure 1, half closure 0.5, etc.; road weights are main 1, through 0.6, other 0.3. These are planning assumptions, not measured traffic.

Duration determines the days on which each site contributes. The daily sum has no exposure or conflict multiplier. Concurrent sites each contribute their own points; pair relationships do not add an extra daily penalty. Capacity analysis is a separate module and is not an input to this sum. Existing coordination clashes use their own 50 m–1 km distance/severity rules, and existing finish-first priorities use another formula.

The Impact Score instead prioritizes **one project** for further review using restriction, relevant locations, concurrent construction and duration. Neither metric replaces, scales or combines with the other. Existing weights, date defaults, coordination recommendations and `dailyLoad` were preserved. The only `sites.ts` changes are a type-generalized spatial neighbour input and defensive malformed-geometry handling; valid source data produces the same Disruption Points.

## Construction Outlook

Open **Coordinate → Construction Outlook**. Choose Next 7, 14 or 30 days. The header's selected day is the reference date; the default day is today's Europe/Berlin calendar date. The window is inclusive: `[reference, reference + days - 1]`. Integer calendar days avoid daylight-saving-hour arithmetic. Tests can pass an explicit reference day to `outlook` or a fixed instant to `berlinToday`.

The panel separates projects beginning in the period, already ongoing at its beginning, and ending in it. Ending counts may overlap the other categories. Expand the project list or potential conflict list and select an item to use the existing detail/map interaction. The optional map filter and timeline shading follow the selected period. Selected project/cluster context stays visible; deselect the filter to restore the original map scope. Existing daily timeline values remain unchanged.

Data-quality rules:

- Dates must be real `YYYY-MM-DD` dates; calendar rollover is rejected.
- Missing or sentinel dates (year 2100 onwards, including 2999) are unknown, never multi-century durations.
- Known starts with unknown/open ends are shown as possibly active, explicitly uncertain. Missing starts are not counted as newly beginning. Reversed intervals are excluded from definite date analysis.
- Exact duplicate IDs and identical project representations are counted once. A matching point/polygon representation with the same source metadata, dates and exact valid centre uses the footprint record. Distinct valid polygons at a shared marker stay distinct. Geometrically equivalent polygons with reordered vertices are not automatically merged.
- Geometry must have valid closed rings, finite coordinates, valid topology and Dortmund-area coordinate order/bounds. Polygon holes are respected. Point-only locations can still be displayed, but synthetic circles do not establish exposure or conflict evidence.
- Scenario shifts are applied only to originally verified date bounds. Proposed scenario geometry/dates are explicitly labelled as scenario evidence.

`potentialConflicts` reuses `findNeighbours` and `overlapDays`: actual footprints touch/intersect or are within `impact.radius` (default 250 m) **and** both verified construction intervals intersect. The radius is a planner setting. Bounding boxes prefilter spatial work; memoization avoids rerunning it when just changing the date window. Outlook clips these shared pairs to its selected window. Context and scoring reuse the full-period pairs, so changing the outlook window cannot incorrectly erase score conflicts.

These are **Potential Construction Conflicts**, not confirmed traffic disruptions. Incomplete dates/footprints cannot prove an absence of conflicts.

## Traffic Context

Select any construction project and scroll within its existing details. Traffic Context shows a matched source road class, known rail stops within 500 m of the real footprint, and nearby concurrent projects from the shared Outlook analysis.

The existing road matcher checks the source road centreline against the construction footprint. The current road loader includes selected main/connector/through classes; an unmatched site is therefore **unknown**, not a verified residential/local road. The new panel never interprets road type as measured traffic volume.

Missing stop data or geometry is unavailable, not zero. Invalid stop coordinates are omitted and counts are marked incomplete. Stops are rail/Stadtbahn coverage, not a complete bus-stop inventory. Proximity does not establish that any line is disrupted. The existing Routes tab remains available for trip investigation. Project-specific alternative route analysis is explicitly unavailable here; no detour, delay, congestion or economic-loss estimate is invented.

## Construction Impact Score

The project detail panel offers Public Services / City Administration and Business / Logistics contexts. Public exposure uses the combined schools, kindergartens and available rail-stop lists. If a required facility source fails, public exposure is unknown. For business exposure, choose one or more premises/warehouses/destinations on the map, rename or remove them. These points exist only in React memory in the current tab: they are not sent to the construction backend, stored centrally, added to the scenario URL or exported in CSV. Refreshing clears them.

Pure functions in `model/impact.ts` calculate:

`Impact Score = 100 × (s_S·S + s_E·E + s_C·C + s_D·D) / (s_S + s_E + s_C + s_D)`, with the shares `impact.S/E/C/D` from Settings (default 35/30/20/15, so the default is `35*S + 30*E + 20*C + 15*D`). Every weight and threshold below is a Settings entry in the "Impact score" group; the defaults are given.

| Factor | Normalization |
| --- | --- |
| S: Restriction Severity | The heaviest named restriction's weight from the Severity settings (`weight.<kind>`, the same weights Disruption Points use: full closure 1, half closure 0.5, …); a path-only closure counts as `weight.sidewalk`; explicitly reported no relevant restriction 0; unknown null. |
| E: Location Exposure | Nearest relevant point to the real footprint: ≤100 m 1; >100–250 m 0.75; >250–500 m 0.40; >500 m 0. Use the maximum exposure, never sum facilities. Missing geometry or relevant locations is null. |
| C: Construction Conflict | Shared Outlook footprint intersection/contact + date overlap 1; within 250 m + overlap 0.5; no relevant pair 0 only with sufficient evidence; unresolved required data null. A known intersection establishes the maximum even if other data is incomplete. |
| D: Construction Duration | Inclusive 1–2 days 0.25; 3–14 days 0.5; 15–30 days 0.75; >30 days 1. Missing/invalid/open/sentinel dates null. |

Restriction information is classified from actual source wording, not a structured verified closure feed. The wrapper distinguishes path-only formulations in either word order from full road closures. A path-only score is an initial planning weight, not a judgement that the restriction is minor for affected pedestrians/cyclists. Unrecognized wording stays unknown. Synthetic scenario titles without restriction wording may also have an unknown S factor.

Every required factor must be known before a total is displayed. Missing values never become zero and weights are never redistributed. Available factor values, weighted contributions, sources and explanations remain visible. Score thresholds (`impact.band.*`) default to ≤30 Low, >30–60 Medium, >60–80 High, >80 Very High **Review Priority**. Weights/categories are provisional hackathon assumptions, not scientific validation or an official Dortmund metric. Traffic Context remains separate, with no fifth factor.

The 82.5 example exists only in tests (`S=1,E=1,C=.5,D=.5`); live results are calculated dynamically. Factor equations retain two decimals so 0.65 × 35 is displayed accurately as 22.75. The total's working (each factor × its share) shows on hover, as for every derived figure.

## Sources and freshness

The existing `construction_sites` read API supplies current/planned records, dates, centres and footprints normalized from Dortmund's construction feeds. No duplicate construction ingestion was added. The endpoint does not provide a source modification timestamp; the panel labels **retrieval time** in Berlin and does not imply continuous real-time completeness.

Verified official Explore v2.1 datasets:

- [Street segments](https://open-data.dortmund.de/explore/dataset/fb62-strassenabschnitte/): `strassenname`, `strassenklasse`, `geo_shape`.
- [Stops](https://open-data.dortmund.de/explore/dataset/haltestellen/), [schools](https://open-data.dortmund.de/explore/dataset/schulen/) and [kindergartens](https://open-data.dortmund.de/explore/dataset/kindergarten/): existing POI fields including `objektname`, `i_zusinfo`, `stadtbezbe`, `geo_point_2d {lon,lat}`.

The catalog and sample record endpoints returned HTTP 200 during implementation on 17 October 2026. These city sources carry Datenlizenz Deutschland – Zero 2.0. No guaranteed update frequency is stated by their metadata. Existing OpenStreetMap/OpenFreeMap/FOSSGIS attribution stays in place. No traffic-count values or newly subscribed/paid API are introduced. Live network failures are shown; production never silently switches to demo data.

## Run and review

From `dashboard/`, use the existing `.env`/`.env.local` containing only public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put database passwords or service-role keys into Vite variables.

```powershell
npm ci
npm run dev
npm test -- --run
npx tsc --noEmit
npm run lint
npm run build
# Optional read-only source smoke test, with public VITE_ variables available:
$env:LIVE = '1'
npx vitest run src/analytics.live.test.ts
Remove-Item Env:LIVE
```

Keep any existing dev server running; Vite can choose another free port if needed. No Expo/native build or backend deployment is required.

Manual review: compare 7/14/30-day lists and timeline shading; move the header date; disable/re-enable map filtering; select a listed or mapped site; inspect Traffic Context and factor explanations; switch to Business, add/remove map points, then compare another site. Test a project with unknown dates and verify that it has no fabricated total. Apply an existing scenario shift and check scenario labels. Verify To do, Priorities, Transit, Capacity, Routes, theme switching and the original logo remain available. Browser interaction is a separate check from the automated render/model tests.

Use `git log --oneline 4218815..53-impact-score`, `git show <commit>` and `git diff 4218815..53-impact-score -- dashboard/` to review the incremental work. `git diff --name-only 4218815..53-impact-score -- mobile backend supabase .github` should be empty. No push, PR, merge or deployment is part of this implementation; review locally before preparing a PR manually.

## Validation record

Baseline: 78 unit tests passed, 2 live tests skipped; TypeScript, lint and production build passed. Final full suite: **181 passed, 3 opt-in live tests skipped**. TypeScript, lint and production build passed. The new opt-in read-only analytics smoke test passed separately against real sources: 189 source projects, 188 verified footprints, 61 potential full-period pairs and 13 complete public-service scores. Remaining projects correctly withheld totals where required evidence was insufficient. These counts are a dated smoke-test observation, not a hardcoded UI expectation. Browser interaction was not verified because the connected browser-control tool exposed no browser surfaces; static React render tests cover the new panels. Existing large-bundle build warnings remain; no dependency upgrade was performed.

| Local commit | Coherent change / files | Validation before commit |
| --- | --- | --- |
| `7e97811` | Outlook source evidence, date windows and shared conflict functions; `model/outlook{,.test}.ts`, `model/sites.ts` input type | 23 targeted tests, TypeScript |
| `8bb67e7` | Outlook panel and tests, `App`, retrieval time in `useData`, timeline shading, scoped styles | 19 targeted tests, TypeScript, lint, build |
| `94adef8` | Traffic Context model/tests, optional facility source exports/tests, loader integration/tests | 18 targeted tests, TypeScript |
| `9823a49` | Traffic Context detail panel/test, App wiring, scoped border | 8 targeted tests, TypeScript, lint |
| `3078bf2` | Pure Impact Score functions and tests | 58 targeted tests, TypeScript |
| `8890c98` | Uncertain map states/tests, missing context data, scoped path restrictions, filtered links and scenario labels | 72 targeted tests, TypeScript |
| `676ba24` | Explainable Impact Score panel/test, local business map points, App wiring and scoped styles | 66 targeted tests, TypeScript, lint |
| `fbc8345` | Malformed geometry pipeline guard/regression and opt-in live analytics test | 24 targeted tests, TypeScript; live smoke test passed |

The documentation commit follows the final full test, type, lint and production-build checks. Nothing was pushed, merged or deployed.

Changed implementation areas: `App.tsx`, `data/{sources,useData}.ts`, `model/{outlook,trafficContext,impact,sites}.ts`, `ui/{OutlookPanel,TrafficContextPanel,ImpactScorePanel,MapView,mapState,Timeline}`, narrowly scoped styles, their tests and this document. `model/analysis.ts`, restriction/road weights, the mobile application, backend and shared database behavior remain unchanged.
