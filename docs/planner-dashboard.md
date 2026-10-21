# Planner dashboard

Website for the city's planners, traffic authority, fire and ambulance, and transit operator · `dashboard/` · live at <https://domove-dashboard-beta.vercel.app> · 17 Oct 2026, roles added 19 Oct 2026

The app answers one resident's question: which works are on my route? The dashboard answers the city's: across Dortmund and the coming year, are works stacking up so that a neighbourhood loses every way around? It reads the same `construction_sites` table as the app, plus the city's open data, and runs everything in the browser. There is no backend change.

## Roles

The features are grouped by who uses them. The roles run across the header. Each wears one of the German road-sign colours (the RAL "Verkehrs-" colours): Planning traffic yellow, the colour of temporary road-works markings; Traffic traffic blue; Emergency traffic red; Transit traffic green, from the H on bus-stop signs. The picked role colours the header's bottom edge, its own button, the tint behind the side panel's figures and the underline of the open view. The map, legend and timeline keep their own colours, so a red in Emergency never reads as disruption. Each role has its own views, its own figures at the top of the side panel, and its own places on the map. All roles share the same sites, settings, scenario and day. The browser remembers the last role; the first visit opens Planning.

| Role | For | Views (the first opens) | Figures | Also on the map |
|---|---|---|---|---|
| **Planning** | works coordination (Tiefbauamt) | To do · Coordinate · Outlook · Priorities | active sites · disruption points · clashes ahead | – |
| **Traffic** | police and traffic control (in practice the road traffic authority and the control centre) | Priorities · Road space · Routes · Outlook | disruption points · full closures · active sites | – |
| **Emergency** | fire and ambulance | Routes · Outlook | full closures · active sites | fire and rescue stations, hospitals |
| **Transit** | buses, trams and bikes | Transit · Routes | stops beside 2+ works · active sites | the Stadtbahn, train and bus lines, Stadtbahn stops, bike share, P+R, each switchable |

- **Routes per role.** Traffic plans for commuters and lorries, Emergency for blue-light vehicles (with emergency reach first), Transit for cyclists and pedestrians. A role with one group shows no group picker.
- **A site's panel.** Moving dates, finishing sooner and the impact score are planning actions, so only Planning shows them. The other roles see the site's facts, the works that coincide with it, and its traffic context.
- **Full closures** counts the active sites whose restrictions include a full closure. That's the same rule by which the routes treat a site as shut for fire and ambulance.
- **Stops beside 2+ works** counts Stadtbahn stops with two or more works of severity 0.5 or more within 500 m, over the 30 days from the chosen day. These are the defaults, which Settings can change. That's the same rule as "stops under pressure" in the Transit view.
- **Lines and stops (Transit).** The card under "Bands | Heat" switches each layer on or off, and the browser remembers the choice. Each layer is drawn its own way:
  - Stadtbahn lines in DSW21's line colours, on a halo so they read on either basemap
  - S-Bahn and regional trains as a dark line with light dashes, the usual map sign for railways
  - buses per street, wider where more lines share it, so the main bus corridors stand out; hover a street for its lines

  A chip per Stadtbahn line (U41–U49) picks out that line: the map frames its route and fades the rest, and a second click brings them back. Stadtbahn stops are drawn small at city zoom so the lines read first. S-Bahn and regional trains, bike share and P+R start switched off.
- **To do → Transit.** A "Far from the Stadtbahn" item's **Open** switches to the Transit role with that district selected.
- **On a phone** the roles form a row of four under the logo.
- **A wider side panel.** Drag the panel's left edge, marked by a small grip at mid-height, to make it wider or narrower, between 320 px and 960 px, always leaving the map 360 px. Or focus the edge (Tab) and use the arrow keys, Shift for bigger steps. A double-click puts it back to 420 px. The browser remembers the width. On phones the panel sits under the map and keeps the full width.
- **German and light by default.** The dashboard opens in German and light, whatever the browser's language and the system's dark setting. Both are changed in the toolbar at the top right, one capsule with the settings gear: **DE | EN**, where a dark plate slides under the language in use, and one sun/moon button, whose sun draws in its rays and turns into a crescent. The browser remembers both.

## What it answers

| Question | Where | How |
|---|---|---|
| What should I act on first? | **To do** (Planning's first view) | every suggestion the other views make, one line each, numbered like the map: moves that clear clashes, works to do together, clashes only finishing sooner can clear, districts with works far from the Stadtbahn |
| Are works piling up in one place at one time? | **Coordinate** · clashes, and the timeline (Planning) | works close together on the same days, linked into clusters |
| Which works should happen together instead? | **Coordinate** · do these together (Planning) | works on the same stretch at different times |
| When should these works start? | a site's panel · best windows; **Plan a new project** in Coordinate (Planning) | start dates scored against everything else planned |
| What starts, runs and ends soon? | **Outlook** (Planning, Traffic, Emergency) | the next 7, 14 or 30 days: works starting, running and ending, possible conflicts and uncertain dates; the map and timeline can show only that window |
| Is the Tiefbauamt's programme balanced? | **Coordinate** · works programme (Planning) | projects in construction per district and period |
| Which running works should finish first? | **Priorities** (Planning, Traffic) | severity (counted squared), time left, overlaps, full closures near a fire station or hospital, no stop nearby |
| How much road space does each district have per resident? | **Road space** (Traffic) | an estimate of each district's road load at the busy hour, from its lane-kilometres and residents; a line under the sliders says how many points the day's works add at most (3 on 20 Oct), since they barely change the order |
| Where do works leave people with no stop nearby? | **Transit** (Transit) | the residents (2022 census) living near works that have no bus or tram stop or train station in walking distance |
| How do commuters, logistics, emergency services, cyclists and pedestrians get around on a given day? | **Routes** (Traffic: commuters, logistics · Emergency · Transit: cyclists, pedestrians) | the router, around that day's closures for that group |
| What do the closures do to a fire station's reach? | **Routes** · Emergency reach (Emergency) | reach without and with the day's full closures |

Every view follows the chosen day: the arrows above the role's figures (a week at a time), a click, tap or drag on the timeline, or the arrow keys on it (a day; PgUp/PgDn a week; Home is today). The map is the same map in every view, with the view's and the role's layers on top.

**The timeline** counts the construction sites running each day, stacked by how much each disrupts: high at the bottom, then medium and low, in the map's colours, with the levels the Severity settings set. It shows only the days the city's data speaks for: from today to four weeks after the last published start, further when the chosen day or a moved work lies later, and back to a chosen day before today. Days after the published plans end are shaded "Not yet published" and their bars faded, as only the works already announced count there; days before today are faded too, as the feed drops ended works. The line above the chart reads out the day under the pointer, else the chosen day: its sites, by level, and its disruption points. The tallest bar carries its count, the note under the chart names the busiest day and where the data stops, and **Weekly table** lists each week's busiest day with its sites, high-disruption sites and points. On a phone the chart sits under the day arrows, with the stacked page; a tap or a sideways drag picks a day, and an up-or-down swipe scrolls the page.

Numbers are stated in things a planner can count. A clash is another serious site within 1 km running on the same days, so a suggestion reads "clashes 6 sites on 60 days → 2 sites on 9 days". Disruption is in points: 1 point is a full closure on a main road, and lighter restrictions and side streets count less. Each section's (i) holds its rules; lists are never cut short.

Every figure the dashboard works out is underlined dotted. Hover, focus or tap it to see how it was worked out, with that figure's own numbers: the shares behind a district's road load, the factors behind a priority rank, which works a clash counts and for how many days, the cost a suggested date is chosen by. The working is built in `src/ui/working.ts` from the same results and settings the model uses.

### Site names

The city writes each site's title as place, work and closure, with "-", "/", "//", "///" or "_" between them, short forms and typos: "Spissenagelstraße - Arbeiten an den Wasserleitungen // Vollsperrung". The dashboard names a site **place · work** instead, "Spissenagelstraße · Water pipes", in every list, the map's popups and the site panel. The closure is left out of the name because the chips and popups already give it ("Full closure").

- **In English** the work is named from a list of the feed's terms, typos and short forms included: "KVP" (Kampfmittelverdachtspunkt) reads "Wartime bomb check", "Notmaßnahme Wasserrohrbruch" "Emergency: burst water main". A work the list doesn't know keeps the city's words as they are. The city's offices are named in English too ("Privatmaßnahme" reads "Private works", "StA 66 - Tiefbauamt" "Civil engineering office (StA 66)"); companies and agencies keep their names.
- **In German** the work is the city's own words, without the slashes and the closure.
- **The city's text** is never lost: hover or focus a site's name for it, and the site panel lists it under the site's facts. The CSV export keeps it too.
- The split is in `src/model/siteName.ts` (with the feed's real titles as tests), the English terms in `src/i18n/feedTerms.ts`. **To name a new kind of work**, add a pattern to `WORK` and its English to `WORK_EN`.

### Scenarios

Moving works (planned sites move; running sites can finish sooner) and adding proposed projects makes a scenario. The timeline then draws the published plans' daily site count as a grey line over the scenario's bars, and a yellow-tinted bar above the views counts the clashes and the busiest day's points, published → yours. The bar only appears once something differs from the published plans. The scenario lives in the link only (`#s=…`), so reloading keeps it and **Copy link** shares it. **Export CSV** writes the changes for a coordination meeting: semicolons and a byte-order mark, as German Excel expects, and a feed title starting with `=`, `+`, `-` or `@` is quoted so it can't run as a formula.

## How it scores

All weights and thresholds below are judgement calls and these are their defaults. A planner can change them in the dashboard's **Settings** (the gear at the top right): each is a slider held between limits that keep its formula meaningful, for example severity weights never above a full closure on a main road (1 point), the high band always above the medium one, and works never taking a whole district's road (which would divide by zero). Changed settings go into the scenario link, so whoever opens it sees the same numbers, and a link carrying a value outside its limits has that value dropped. Defaults, limits and the reasons for them are in `src/model/settings.ts`; change a default there and here.

Settings takes the whole side panel: the day, the figures, the scenario bar and the views make way for it and come back with Back. It opens with one fold per group; only Severity starts open, and a fold's title says how many of its settings differ from the defaults. **Severity is a table** rather than sliders: what a site closes down the side (each with its weight), the road across the top (each with its weight), and in every cell the severity they make, tinted by its band, with how many of the chosen day's sites sit there. Picking a row, a road or the band scale under the table opens one slider for it; the picked cells are outlined, the rest step back, and the table re-tints as the slider moves. A line under it counts the day's sites per band, and once anything differs, what the defaults would give. The table is worked out in `src/model/severityGrid.ts`.

The other groups don't list a slider per number either. Settings in the same unit share **one ruler** with a marker each: a group's distances on one scale (log, so 50 m and 2 km both get room), its durations on another, severity thresholds over the high/medium/low bands, the review-priority bands over their four zones. The list under a ruler names each marker with its value and a plain hint ("≈ 5 min on foot", "≈ 6 months", the band a severity falls in); picking a name makes its marker the draggable one, with its own limits shaded on the scale and its limits, default and Reset under it. The arrow keys move the picked marker a step, Shift ten. Counts (lanes, sites, projects) are − / + steppers, and the impact score's four shares are one bar of 100 whose dividers move points from one share to the next. Which control shows which setting is in `src/ui/settingsLayout.ts`; a test checks that every setting is shown once. Each group has its own hue (Clashes raspberry, Best dates gold, Access teal, Priorities violet, Transit green, Works programme slate, Road capacity blue, Impact score orchid; Severity its band colours), worn by its fold's edge, its thumbs, its picked name and the frame of the picked setting's limits. A track's pattern says what kind of scale it is: distances fade in towards further, durations step in calendar blocks between their ticks, factors and costs are hatched, severity and points show their bands.

| | Rule |
|---|---|
| Restriction | read from the title with issue #12's patterns, e.g. "VSP", "halbs. Sp.", "Vollsperrung Fußweg" (a sidewalk, not the street). A path as the place ("Emscherradweg zw. …") makes its Vollsperrung a path closure. On 17 Oct: 89 full, 65 half, 28 narrowing, 18 lights, 13 sidewalk, 12 one-way, 18 name nothing. |
| Restriction weight | full 1 · one carriageway 0.7 · one-way 0.6 · half 0.5 · narrowing 0.3 · lights 0.3 · moving 0.25 · sidewalk 0.2 · nothing named 0.1 · parking lane 0.05; a site naming several takes the highest |
| Road weight | main road 1 (Hauptverkehrstraße, roads to motorways and federal roads) · through road 0.6 (Verkehrsstraße) · other 0.3, from the city's street register |
| Road of a site | a road's centre line runs within 8 m of the site's polygon for at least 30 m (10 m when the title names the street), so a side-street site touching a main road at the junction stays a side-street site |
| Severity | restriction weight × road weight: a full closure on a main road is 1, on a residential street 0.3. High from 0.6, medium from 0.3. |
| Overlap | two sites 50 m – 1 km apart running on the same days, both at least 0.15: severity × severity × days × (1 − distance / 1 km) |
| Cluster | overlaps between sites of at least 0.3 within 400 m, linked together. With every 1 km link the city centre chains into one cluster of 46 sites. |
| Do together | sites at most 50 m apart with 1–180 days between them, the later one not started yet |
| Best window | starts from 30 days before to 90 days after the published start (180 for proposed projects), costing the overlap, minus half the days shared with works on the same stretch, plus 0.03 × severity per day moved, minus 0.1 × severity per day in NRW school holidays. The first option is the smallest move that gets 90 % of the best result. |
| Cluster advice | a move only when it at least halves that site's overlap; otherwise the works that keep the cluster going longest |
| Priority | severity² × remaining days ÷ 30 (at most 180) × (1 + ½ per overlapping site within 1 km, at most 6) × 1.5 for a full closure within 500 m of a fire and rescue station or 300 m of a hospital × 1.5 with no stop nearby. Squaring makes how much a work closes count more than how long it runs: a main-road full closure (1) outweighs a side-street one (0.3) eleven times, not three. Only full closures get the fire and hospital factor, the same rule by which the emergency routes treat a site as shut. |
| No stop nearby | no bus or tram stop within 400 m and no train station within 1 km of the work, in a straight line, from OpenStreetMap |
| Residents near works with no stop | per district over 30 days: the residents living within 300 m of works of severity 0.15 or more with no stop nearby, from the 2022 census's 100 m squares, each square counted once even when several works are near it. Main-road closures (full, half, carriageway or one-way, where buses run) are listed separately, as the bus diversions to agree. |
| Stop under pressure | two or more closures of severity 0.5 or more within 500 m |
| Programme overload | at least 3 projects in "Bau", and at least 1.5 times the period's median over the 12 districts |
| Impact score | one site's review priority out of 100: shares 35 restriction (its restriction weight above) · 30 nearest school, kindergarten or stop (1 within 100 m, 0.75 within 250 m, 0.4 within 500 m) · 20 works at the same time (1 touching, 0.5 within 250 m) · 15 duration (0.25 up to 2 days, 0.5 up to 14, 0.75 up to 30, then 1); the shares are scaled to add up to 100. Low up to 30, medium up to 60, high up to 80. No total while any factor is unknown; details in `dashboard/ANALYTICS.md`. |

## Routes per group

The router is Valhalla on FOSSGIS's public server: free, no key, and fair use, so the dashboard asks at most once a second (as the obstacles job does with their OSRM) and remembers answers.

| Group | Router profile | Blocked by | Slowed by |
|---|---|---|---|
| Commuters | car | full closures, one-way rules | #12's penalties: half and carriageway +120 s, narrowing, lights and moving +60 s |
| Logistics | truck | as cars, plus half closures, closed carriageways and narrowings (our assumption) | as cars |
| Emergency | car | full closures only; blue-light vehicles pass the rest | as cars |
| Cyclists | bicycle | full closures, one-way rules | half +60 s, narrowing +30 s, lights +60 s |
| Pedestrians | foot | closed sidewalks | full closure +60 s, lights +30 s |

The public server takes at most 100 vertices and 10 km of outline in `exclude_polygons`; today's 89 full closures alone have 43 km. So the dashboard asks for the normal route, finds the blocking sites the path uses for more than 20 m, excludes a 30 m square where it runs through each, and asks again, for at most three rounds and 19 squares. Sites it can't route around (the trip starts or ends in one, or every other way is closed) are listed as still blocking; a route through a closure is never shown without saying so.

**Emergency reach** asks for the area a fire and rescue station reaches in 5–12 minutes, then the same with squares at the 19 most severe full closures inside it. The difference, without slivers under 5,000 m², is the lost area; residents are estimated from each district's population density.

## Data

| Source | Used for |
|---|---|
| Supabase `construction_sites` with `Accept: application/geo+json`, synced hourly from the city's feeds | the sites and their polygons |
| [open-data.dortmund.de](https://open-data.dortmund.de) `fb62-strassenabschnitte` (main, connector and through roads, about 4,000 segments) | road class |
| `fb62-stadtbezirke`, `bevolkerungsstand-stadtbezirke` | districts and their residents (2025) |
| `haltestellen`, `fahrradmietstation`, `park-and-ride` | 123 Stadtbahn stops, 94 bike-share stations, 32 P+R sites |
| `feuerwehr` (the Feuer- und Rettungswachen), `krankenhaus` (`KrankenhausKlinik`) | emergency layers |
| `baumassnahmen-arbeitsprogramm-des-tiefbauamtes-2026-gesamtubersicht` | 578 projects with their stage per period to 2028 |
| `public/transit-lines.json`, built from [OpenStreetMap](https://www.openstreetmap.org) route relations by `npm run transit-network` (19 Oct 2026) | the Transit role's lines: 8 Stadtbahn lines with DSW21's colours, 21 S-Bahn and regional train lines (no ICE, IC or Flixtrain), and 109 bus lines (no Flixbus) as 7,450 street pieces, each with the lines that use it; about 150 KB compressed, loaded the first time the Transit role opens |
| `public/transit-stops.json`, built by the same `npm run transit-network` from OpenStreetMap (20 Oct 2026) | "no stop nearby": 4,131 bus, 294 tram and 89 train stops in a box reaching about 2 km past the city limit, so a work near the edge finds the stop across it; about 55 KB compressed |
| `public/population.json`, built by `npm run population` from the [2022 census](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_inhalt.html)'s 100 m grid (Zensus 2022, Destatis) | residents near works: 10,955 squares with 598,262 residents inside Dortmund's districts; about 75 KB compressed |
| [OpenHolidays](https://openholidaysapi.org) | NRW school holidays |
| [Valhalla](https://valhalla1.openstreetmap.de) by FOSSGIS e.V., [OpenFreeMap](https://openfreemap.org) | routes and reach; the basemap |

The city's data is under Datenlizenz Deutschland – Zero 2.0. OpenStreetMap (basemap, routing, transit lines and stops) needs attribution, which the page footer and the map carry. `transit-lines.json` and `transit-stops.json` are databases derived from OpenStreetMap, so they stay under the ODbL and say so in their `attribution` field. Rebuild both after a timetable change (usually December) with `npm run transit-network`. The script refuses to overwrite them if Overpass returns fewer than 5 Stadtbahn lines, 100 bus pieces, 1,000 bus stops, 100 tram stops or 20 train stations. The census grid is open data that must name its source, "© Statistisches Bundesamt (Destatis), Zensus 2022", which the footer does. `npm run population` checks its own coordinate conversion against two known points and refuses a total outside 500,000–700,000 residents. Only the sites are required: any other source can fail on its own, and the page names what's missing.

## Limits

- **Published plans reach about four weeks ahead** (16 Nov on 17 Oct). After that, load looks low only because later works aren't announced; the timeline shades the days after it, and suggestions past it say so.
- **The feed forgets ended works.** None of the city's sites is kept once it ends, so earlier days look quieter than they were. So the timeline starts at today and fades the earlier days when one is chosen, and disruption points aren't compared with a "usual" level until there's history to compare with. The database keeps that history from 20 Oct 2026 in `construction_site_history`.
- **A stop nearby isn't a bus that comes often.** "No stop nearby" measures straight-line distance to any stop; how often buses run there, and walking routes, aren't counted. On 20 Oct 2026 it left 39 residents near works with no stop: 24 in Hörde (Syburg), 15 in Innenstadt-Nord. Before 20 Oct the view counted only works far from the Stadtbahn, which put Hörde first although 96.8 % of its residents live within 400 m of a bus or tram stop.
- **Bus routes aren't in the figures.** Closures on main roads stand in for bus diversions, and "stops beside 2+ works" counts the city's Stadtbahn stops. The bus lines on the Transit map come from OpenStreetMap but don't feed any figure yet.
- **The restriction comes from the title.** A site whose title names nothing counts as minor until #12's `closures_override` exists.
- **The works programme has no locations**, so it's compared by district and period only.
- **Daytime-only closures** count around the clock.
- **Scenarios are not stored centrally**: a shared store would need planner logins, because the publishable key mustn't write.
- **The public router is fair-use.** Heavy use needs openrouteservice (#12) or our own router.
- **Roles are views, not permissions.** Anyone with the link sees every role. That's fine while every source is public, but loading a city's internal plans needs logins first.
- **The role isn't in the share link.** A colleague opening a scenario link sees it in their own last role.

## Roles in the code

- `src/ui/modes.ts`: `MODES` lists each role's views (the first one opens), its figures and its route groups. The picked role is kept in `localStorage` under `domove-dashboard-mode`, falling back to Planning when storage is blocked.
- `src/ui/ModeSwitch.tsx`: the switch and its icons. Role names and role lines are under `modes` in `src/i18n/en.ts` and `de.ts`. View names are under `app.tabs`.
- `src/App.tsx`:
  - `statPool`: every figure a role can show, each with its working
  - `pois`: the places each role adds to the map
  - `Legend`: the legend rows for those places
  - the site panel's planning-only parts (`plan` on `SitePanel`, and the impact score)
- `src/ui/modes.test.ts`: every view and every route group must stay reachable from some role, and a role has route groups exactly when it has Routes.
- **To add a view to a role**, add its id to that role's `tabs`. **To add a role**, add it to `MODES` and its words to both language files. The type check fails on any word missing in German.
- **Look.**
  - Role colours are tokens in `src/styles.css`: `--mode` (edge and bar), `--mode-ink` (icons and lines, at least 4.5:1 on the surface and on the tint, in both themes) and `--mode-wash` (the panel tint). They are set by `data-mode` on the app and on each role button. The scenario bar keeps the yellow `--selection` edge in every role.
  - Headings, figures, roles and views use Barlow Semi Condensed, a typeface drawn from road signage. It's bundled with the site (`@fontsource/barlow-semi-condensed`, weights 500 and 600), so no font request goes to Google. Body text stays in the system font.

## Run, test, deploy

From `dashboard/`, after copying `.env.example` to `.env`:

```sh
npm ci
npm run dev                          # http://localhost:5173
npm test -- --run                    # unit tests: closure patterns on real titles, geometry, scoring, scenario links, routing against a fake router
LIVE=1 npx vitest run src/live.test.ts   # the whole analysis on today's data, and a real detour
npx tsc --noEmit && npm run lint && npm run build
```

The **Checks** workflow runs the unit tests, the type check, lint and the build on every pull request; the live test stays manual, so the checks don't depend on the city's or FOSSGIS's servers.

Deploy: Vercel project `domove-dashboard` in the team's Vercel account, Root Directory `dashboard`, with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set for production. `npx vercel@latest deploy --prod` from `dashboard/` uploads the local code (`.vercelignore` keeps the local `.env` out).
