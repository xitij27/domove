# Planner dashboard

Website for the city's planners · `dashboard/` · live at <https://domove-dashboard-sigma.vercel.app> · 17 Oct 2026

The app answers one resident's question: which works are on my route? The dashboard answers the city's: across Dortmund and the coming year, are works stacking up so that a neighbourhood loses every way around? It reads the same `construction_sites` table as the app, plus the city's open data, and runs everything in the browser. There is no backend change.

## What it answers

| Question | Where | How |
|---|---|---|
| What should I act on first? | **To do** (the first view) | every suggestion the other views make, one line each, numbered like the map: moves that clear clashes, works to do together, clashes only finishing sooner can clear, districts needing transit help |
| Are works piling up in one place at one time? | **Coordinate** · clashes, and the timeline | works close together on the same days, linked into clusters |
| Which works should happen together instead? | **Coordinate** · do these together | works on the same stretch at different times |
| When should these works start? | a site's panel · best windows; **Plan a new project** | start dates scored against everything else planned |
| Is the Tiefbauamt's programme balanced? | **Coordinate** · works programme | projects in construction per district and period |
| Which running works should finish first? | **Priorities** | severity, time left, overlaps, emergency access, rail nearby |
| Which districts need public-transport attention? | **Transit** | closures with no Stadtbahn in walking distance, per resident |
| How do commuters, logistics, emergency services, cyclists and pedestrians get around on a given day? | **Routes** | the router, around that day's closures for that group |
| What do the closures do to a fire station's reach? | **Routes** · Emergency reach | reach without and with the day's full closures |

Every view follows the chosen day: the header's arrows (a week at a time), a click or drag on the timeline, or the arrow keys on it (a day; PgUp/PgDn a week; Home is today). The map is the same map in every tab, with the tab's layers on top.

Numbers are stated in things a planner can count. A clash is another serious site within 1 km running on the same days, so a suggestion reads "clashes 6 sites on 60 days → 2 sites on 9 days". Disruption is in points: 1 point is a full closure on a main road, and lighter restrictions and side streets count less. Each section's (i) holds its rules; lists are never cut short.

Every figure the dashboard works out is underlined dotted. Hover, focus or tap it to see how it was worked out, with that figure's own numbers: the shares behind a district's road load, the factors behind a priority rank, which works a clash counts and for how many days, the cost a suggested date is chosen by. The working is built in `src/ui/working.ts` from the same results and settings the model uses.

### Scenarios

Moving works (planned sites move; running sites can finish sooner) and adding proposed projects makes a scenario. The timeline then shows it against the published plans in grey, and the header counts the clashes and the busiest day's points, published → yours. The scenario lives in the link only (`#s=…`), so reloading keeps it and **Copy link** shares it. **Export CSV** writes the changes for a coordination meeting: semicolons and a byte-order mark, as German Excel expects, and a feed title starting with `=`, `+`, `-` or `@` is quoted so it can't run as a formula.

## How it scores

All weights and thresholds below are judgement calls and these are their defaults. A planner can change them in the dashboard's **Settings** (the gear at the top right): each is a slider held between limits that keep its formula meaningful, for example severity weights never above a full closure on a main road (1 point), the high band always above the medium one, and works never taking a whole district's road (which would divide by zero). Changed settings go into the scenario link, so whoever opens it sees the same numbers, and a link carrying a value outside its limits has that value dropped. Defaults, limits and the reasons for them are in `src/model/settings.ts`; change a default there and here.

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
| Priority | severity × remaining days ÷ 30 (at most 180) × (1 + ½ per overlapping site within 1 km, at most 6) × 1.5 within 500 m of a fire and rescue station or 300 m of a hospital × 1.5 with no Stadtbahn stop within 600 m |
| Transit need | per district over 30 days: severity-weighted closures more than 600 m from a Stadtbahn stop, plus half of those on main roads (full, half, carriageway or one-way, where buses run), per 10,000 residents |
| Stop under pressure | two or more closures of severity 0.5 or more within 500 m |
| Programme overload | at least 3 projects in "Bau", and at least 1.5 times the period's median over the 12 districts |

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
| [OpenHolidays](https://openholidaysapi.org) | NRW school holidays |
| [Valhalla](https://valhalla1.openstreetmap.de) by FOSSGIS e.V., [OpenFreeMap](https://openfreemap.org) | routes and reach; the basemap |

The city's data is under Datenlizenz Deutschland – Zero 2.0. OpenStreetMap (basemap, routing) needs attribution, which the page footer and the map carry. Only the sites are required: any other source can fail on its own, and the page names what's missing.

## Limits

- **Published plans reach about four weeks ahead** (16 Nov on 17 Oct). After that, load looks low only because later works aren't announced; the timeline marks the date, and suggestions past it say so.
- **No bus network.** The city publishes Stadtbahn stops only, so closures on main roads stand in for bus diversions.
- **The restriction comes from the title.** A site whose title names nothing counts as minor until #12's `closures_override` exists.
- **The works programme has no locations**, so it's compared by district and period only.
- **Daytime-only closures** count around the clock.
- **Scenarios are not stored centrally**: a shared store would need planner logins, because the publishable key mustn't write.
- **The public router is fair-use.** Heavy use needs openrouteservice (#12) or our own router.

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
