# Ideas: slow roads, traffic and more open data

Brainstorm · what else the app could tell people, and from which data · 16 Oct 2026

Today the app answers one question: which construction sites are on my saved route? For a saved car route from Dortmund Hbf to Westfalenpark, the route card says "Car · 3 construction sites on the way". It doesn't say whether any of them will slow the trip down, at what time or by how much. It also says nothing about the other things that slow a trip down: rush hour, a BVB home game, a jam on the A40. This page collects ideas for answering "where and when will my trip be slow, and why?" and lists the data each idea needs. All sources were checked on 16 Oct 2026.

## The short version

- **The city's open data portal has no traffic speeds or volumes for streets.** It lists where the city counted traffic (1,109 count sites, 1998–2024), but the counts themselves are only available on request and for a fee. So live and typical speeds have to come from a traffic provider. We already have a Mapbox token, and Mapbox's Directions API returns congestion for each piece of a route and a typical trip time for a chosen departure time.
- **What a provider can't know is what the city has planned.** Its forecast comes from past traffic, so a lane closure that starts next week isn't in it. The city's planned sites, its works programme up to 2028 and its official road classes are open data. Putting them on top of the provider's typical traffic gives a forecast for regular trips that a navigation app can't make from traffic history alone: "from 26 Oct your Monday 8:00 trip gets slower: half closure on Westfalendamm".
- **Suggested first steps:**
  1. Rate how much each site affects traffic (idea 1).
  2. Show the traffic-aware trip time and the slow sections for car routes at their leaving time (idea 2).
  3. Flag match days and school holidays (idea 4).
  4. Start storing the open data whose history can't be downloaded later (idea 11).

## At a glance

| Idea | What the user gets | Main data | Size |
|---|---|---|---|
| 1. [Rate each site's effect](#1-rate-each-sites-effect) | "3 sites nearby · 1 slows traffic" instead of "3 sites" | the city feeds we sync, the city's street register | S–M |
| 2. [Traffic-aware trip time and slow sections](#2-traffic-aware-trip-time-and-slow-sections-car) | "Mon 8:00 · about 19 min, usually 14", slow stretches coloured on the map | Mapbox Directions (`driving-traffic`) | S–M |
| 3. [Forecast the effect of planned sites](#3-forecast-the-effect-of-planned-sites) | "From 26 Oct this trip gets slower" | planned sites, ideas 1 and 2 | M |
| 4. [Match days, events, holidays, weather](#4-match-days-events-holidays-and-weather) | "BVB at home on Saturday, 18:30: heavy traffic near the stadium" | OpenLigaDB, OpenHolidays, Bright Sky, a small event table | S–M |
| 5. [Autobahn roadworks and jams](#5-autobahn-roadworks-and-jams) | jams with delay and speed on the A1, A2, A40, A44, A45 | Autobahn GmbH API | S–M |
| 6. [Leave-earlier alerts](#6-leave-earlier-alerts-for-regular-trips) | a push before the usual leaving time when the trip will take longer than usual | ideas 2–5, server push | M |
| 7. [Parking at the destination](#7-parking-at-the-destination) | "P+R Westfalenpark: 170 of 190 free", later "usually full by 10:00 on Saturdays" | city parking guidance system, parking sensors | S, M for the forecast |
| 8. [Switch mode when the car is slow](#8-switch-mode-when-the-car-is-slow) | P+R, bike share or public transport as the alternative | P+R sites, stops, bike-share feed, Transitous | M |
| 9. [Safer bike and walking routes](#9-safer-bike-and-walking-routes) | accident hotspots where a site narrows the road, lit streets at night | Unfallatlas, street lights | M |
| 10. [Long-range heads-up](#10-long-range-heads-up-from-the-works-programme) | "Planned for 2028: renewal of the B54/B1 bridge" | Tiefbauamt works programme | M |
| 11. [Start collecting history now](#11-start-collecting-history-now) | trends, and our own forecasts later | parking, Autobahn warnings, site history | S |
| 12. [Work with the city](#12-work-with-the-city) | traffic data we may keep; feedback to the city | talks, aggregated counts | — |

Sizes are rough: S is about a day of work, M a few days. Issue numbers below (issue #12 and so on) are GitHub issues; plain numbers are the ideas on this page.

## What this looks like on one trip

Take the saved car route from Dortmund Hbf to Westfalenpark. On the path the FOSSGIS router returns for it (the router the obstacle job uses), the trip leaves the station, follows the Wall (B54) and the Ruhrallee (B54), and turns onto the B1.

| | The route card says |
|---|---|
| **Today** | "Car · 3 construction sites on the way" |
| **Rated (idea 1)** | Only one of the three restricts a street the path drives along: the half closure on Brinkhoffstraße, until 13 Nov. The one-way rule on Poststraße is on a residential side street that the path passes, and the Märkische Straße site is a building renovation (the Jugendamt) that names no restriction. The card could say "3 sites nearby · 1 slows traffic: half closure on Brinkhoffstraße until 13 Nov". |
| **Traffic (idea 2)** | Expected and typical minutes at the route's leaving time, with the slow stretches coloured on the line. |
| **Events (idea 4)** | BVB plays at home on Sat 24 Oct at 18:30 against Eintracht Frankfurt. The stadium and the Westfalenhallen are close to the B1 and to the B54/B1 junction this path uses, so a trip that afternoon gets a match-day warning. |
| **Parking (idea 7)** | P+R Westfalenpark had 170 of 190 spaces free at 23:38 on 16 Oct (city parking guidance system, refreshed every few minutes). |
| **Long range (idea 10)** | The city's works programme lists the renewal of bridge BW 750 at the B54/B1 junction. Its second change report for 2026 moved construction to 2028, because of detour traffic from the A45 bridge works at Martener Straße. |

## 1. Rate each site's effect

Today a site counts as an obstacle when its area comes within 30 m of the path, whatever it does to traffic. Three facts would let the app tell the sites apart:

- **What the site restricts.** The feed's restriction field (`einschrankung`) is empty for all 158 current sites, so this has to come from the title text, as issue #12's closure parser plans. Across the 212 current and planned sites, the titles name about 89 full closures, 63 half closures, 28 lane reductions or narrowings, 18 temporary traffic lights and 12 one-way rules, and 17 mention the sidewalk or a cycle path. 28 titles name no restriction at all, and a title can name several. A few give hours, e.g. "Fahrspureinzug (09-15 Uhr)".
- **How important the road is.** The city's street register (`fb62-strassenabschnitte`, 19,510 segments with geometry) gives every segment an official class: Hauptverkehrsstraße (main road, spelt `Hauptverkehrstraße` in the data; with its group, e.g. Bundesstraße or Landesstraße), Verkehrsstraße, Sammelstraße, Anliegerstraße (residential) and others. Matching the street named in each title gives roughly 53 of the 212 sites on main roads and 97 on residential or minor streets. Only 13 of the full closures are on main roads.
- **Whether the route drives along it.** "Within 30 m" also catches sites on side streets that the route only crosses or passes. Better tests are the length of the path inside the site's area (grown a little), and whether the site's street is one of the street names the router returns for the path's steps.

Do the road-class match on geometry in PostGIS, not on names: 17 titles didn't match the register because of typos ("Hansamnnstraße", "JUngferntalstraße") or names like "Bundesstraße B1".

Each obstacle then gets a label (blocks, slows traffic, next to the route, no effect) and a one-line reason. This fits issue #12's `closure_impacts` table, and car drivers stop getting alerts about scaffolding on a residential street.

## 2. Traffic-aware trip time and slow sections (car)

Mapbox's [Directions API](https://docs.mapbox.com/api/navigation/directions/) with the `driving-traffic` profile returns, for each piece of the path:

- `congestion` (`low`, `moderate`, `heavy`, `severe` or `unknown`) and `congestion_numeric` (0–100);
- `speed` and `duration`.

For the whole route it returns `duration` and `duration_typical`, the time under typical conditions without live traffic. With `depart_at` it answers for a later departure; close to the current time it mixes in live traffic.

So for a saved route with a leaving time, the app can show "Mon 8:00 · about 19 min, usually 14" (illustrative numbers) and colour the route line by congestion.

- **Cost:** third-party pricing pages put the free tier at 100,000 Directions requests a month; confirm on mapbox.com/pricing. We already have the token.
- **Limit:** 25 coordinates per request, while saved routes allow 48 stops. Long routes need splitting.
- **Cars only.** Congestion barely slows walking or cycling.
- **Privacy:** the request carries the route's start and destination, often someone's home and work. Name Mapbox in the privacy notice.
- **Quick win:** a live traffic layer on the map. react-native-maps has `showsTraffic` for the Google map; on the Mapbox map, add the `mapbox.mapbox-traffic-v1` tileset as a line layer coloured by its `congestion` property. Neither needs a request per route.
- **Detours:** `exclude=point(lon lat)` (beta, best effort, up to 50 points) can route a car around blocking sites with traffic taken into account. It's an option for the detour minutes in issue #25, next to the openrouteservice plan in issue #12.

Alternatives:

- Google's Routes API returns `speedReadingIntervals` (`NORMAL`, `SLOW`, `TRAFFIC_JAM`) along the polyline when asked for `TRAFFIC_ON_POLYLINE` with a traffic-aware routing preference. Traffic-aware requests are billed at least as Pro (5,000 free a month, then $10 per 1,000).
- TomTom's Flow Segment Data API returns the current and the free-flow speed of the road nearest a point, with 20,000 free requests a month. It's handy for checking single sites.

**Storing provider data is restricted.** Google's terms don't allow keeping its responses beyond a few exceptions (coordinates for up to 30 days). Check Mapbox's product terms and TomTom's terms before keeping their speeds to build our own history. Idea 11 lists open data we may keep.

## 3. Forecast the effect of planned sites

This is where the app can know more than a navigation app. Mapbox's typical durations come from past traffic, so a planned lane closure isn't in them until it starts. For each planned site on a saved route, estimate the extra time from:

- the closure kind and the road class (idea 1);
- the time of day. In the city's 2019 mobility survey (`fb61-mobilitatsbefragung-2019-wege`), car drivers' trips of 2–30 km that started between 16:00 and 17:00 took a median 1.67 times the time Google routed for them, against 1.25 for trips starting between 5:00 and 6:00 and about 1.5 for most of the day. Car trips start most often between 7:00 and 8:00 (9.3 % of them) and between 16:00 and 18:00 (19 %). The survey times are self-reported, so they include parking and walking;
- how busy the stretch is at that hour: Mapbox's `congestion` at the route's leaving time (idea 2).

Start with fixed penalties per closure kind (issue #12's `closure_impacts`), scaled by road class and by how busy the stretch is at that hour. Show a plain label or a range ("likely slow 7–9 and 16–18"), not a precise number. When a planned site becomes current, compare the route's traffic-aware time before and after the start date to check the guesses; by hand at first, because of the storage terms in idea 2.

## 4. Match days, events, holidays and weather

- **BVB home games:** [OpenLigaDB](https://api.openligadb.de/getmatchdata/bl1/2026) (free, no key) lists the 17 Bundesliga home games of 2026/27. The next one is Sat 24 Oct at 18:30 against Eintracht Frankfurt. Kick-off times further ahead are placeholders until the DFL sets them. Cup and European games need other league feeds or manual entries.
- **Other big events:** the city lists 11 venues (`veranstaltungsorte`: Westfalenhallen, Warsteiner Music Hall, Friedensplatz, the Fredenbaumpark fairground and others), but no dates. A small hand-kept table covers the big ones: trade fairs and concerts at the Westfalenhallen, the Christmas market, festivals in Westfalenpark.
- **How it works:** a zone around each venue and a time window around each event, e.g. three hours before to two hours after, to be tuned. Routes through the zone in that window get a warning.
- **School holidays:** the [OpenHolidays API](https://openholidaysapi.org) (free, no key). NRW's autumn holidays run from 17 to 31 Oct 2026. Label forecasts "school holidays: usually lighter".
- **Weather:** [Bright Sky](https://brightsky.dev) (DWD data, free, no key) has rain, snow and the DWD's warnings, e.g. for black ice. The city's 105 climate sensors (`klimasensoren-aktuelle-messungen`, every 5 minutes, including precipitation) show very local rain. Weather matters for bike and walking routes too ("rain at 8:00").

## 5. Autobahn roadworks and jams

The Autobahn GmbH's public API (`https://verkehr.autobahn.de/o/autobahn/{road}/services/{roadworks|warning|closure}`, no key) lists roadworks, closures and traffic warnings per motorway. Warnings carry `delayTimeValue` (minutes), `averageSpeed` (km/h) and `abnormalTrafficType` (e.g. `SLOW_TRAFFIC`, `STATIONARY_TRAFFIC`). Each road's list covers all of Germany (161 roadworks on the A45 alone), so filter to a box around Dortmund.

A pg_cron sync next to the city one would cover the A1, A2, A40, A44 and A45, where many commuters come in (the A40 continues into the city as the B1). It also helps trips that leave the city, which have no site data today (question 9 in [route-planning-open-questions.md](route-planning-open-questions.md)). Autobahn works change city traffic too: the B54/B1 bridge renewal was postponed because of detours from the A45 works.

## 6. Leave-earlier alerts for regular trips

Saved routes already have weekdays and a leaving time. Before each trip, compare the expected time (ideas 2–5) with the usual time, and send a push when the difference is above a threshold: "Leave 8 minutes earlier: slow on Ruhrallee". Asking Mapbox for three or four departure times also gives a "best time to leave".

This needs real server push, and server push needs route owners first ([routes-database-todo.md](routes-database-todo.md)). Until then, the phone can check when the app opens, as the construction reminders do.

## 7. Parking at the destination

- **Garages and P+R:** `parkhauser` has the live number of free spaces for 24 garages and P+R sites (the city centre, and P+R Schulte-Rödding, Hafen, Hauptfriedhof and Westfalenpark), refreshed every few minutes. `zeitstempel_status` says how old a value is. Show the free spaces near the destination.
- **On-street sensors:** `parkplatzsensoren` has the city's ~620 parking sensors in real time. Almost half are on disabled parking spaces; most of the others are on loading zones and EV charging spaces. That helps drivers with a disability permit, and deliveries.
- **Forecast:** both datasets are under Datenlizenz Deutschland – Zero, so we may keep them. A few weeks of snapshots give "usually full by 10:00 on Saturdays", the one forecast we can build from open data alone. The garage dataset holds only the current values and the sensor dataset only the last 30 days, so collecting has to start early (idea 11).

## 8. Switch mode when the car is slow

When the car forecast is bad (a match day, a big closure), offer an alternative:

- P+R sites (`park-and-ride`, 32) and rail stops (`haltestellen`: 123 Stadtbahn, S-Bahn and regional stops).
- Bike share: metropolradruhr is now run by Donkey Republic. Its GBFS feed (`https://stables.donkey.bike/api/public/gbfs/2/donkey_ruhr/gbfs.json`, CC0) has live station status for the Ruhr area, about 200 stations of them in and around Dortmund. The city's `fahrradmietstation` dataset lists 94 stations, without live status.
- Public transport trips from [Transitous](https://transitous.org/api/) (`https://api.transitous.org`, MOTIS). Its terms: open-source, non-commercial projects only, a `User-Agent` with contact details, and attribution. The repository has no licence yet.

## 9. Safer bike and walking routes

- **Accidents:** the statistical offices' [Unfallatlas](https://unfallatlas.statistikportal.de) has geocoded accidents with injuries for 2016–2025 (released July 2026), under Datenlizenz Deutschland – Namensnennung 2.0, so attribution is required. Show hotspots on bike and walking routes, especially where a site narrows the road or closes the cycle path (17 site titles mention the sidewalk or a cycle path).
- **Light at night:** the city's street lights (`leuchtstellen`, 54,527 points) could steer walks after dark onto lit streets.
- **Accessibility:** sidewalk closures and emergency sidewalks ("Notgehweg") from the site titles, free disabled parking spaces from the sensors (idea 7), and barrier-free stop upgrades from the works programme (idea 10).

## 10. Long-range heads-up from the works programme

The Tiefbauamt's yearly programme (`baumassnahmen-arbeitsprogramm-des-tiefbauamtes-2026-gesamtubersicht`, 578 projects, as of 28 Jan 2026) gives each project's stage for every quarter of 2026 and for 2027 and 2028: planning, preparation, construction, final invoice. Change reports record later moves; the second one for 2026 has 69 changes. 40 projects carry the flag "Verkehrliche Bedeutung (Hauptstraßen)", importance for main-road traffic. Two examples on the B1:

- the renewal of bridge BW 750 at the B54/B1 junction: construction moved from the third quarter of 2026 to 2028;
- the renovation of the B1 between the B54 and Wittekindstraße, westbound towards Bochum: newly added, construction in 2028.

The projects have names but no geometry, so match them to the street register, by hand for the main-road projects. Show them as "planned for 2028" on routes that use the street, and expect dates to slip, as BW 750's did.

## 11. Start collecting history now

Some data only shows the present. What we don't store now, we can't get back later:

- parking occupancy (idea 7);
- Autobahn warnings (idea 5);
- the construction sites themselves. Today's sync deletes a site once it leaves the feed. Keeping it (e.g. with a `removed_at` column) shows how long sites really last against their announced dates, which streets get works again and again, and how often planned dates slip.

All three are open data and small; one pg_cron job each in Supabase. Mind the free plan's 500 MB database: store parking in 15-minute steps (about 2,300 rows a day for the 24 garages), not every snapshot.

## 12. Work with the city

- **Ask for traffic data.** The city already publishes live parking and sensor data. Ask Smart City Dortmund or the Tiefbauamt to publish counts and speeds from the detectors of its traffic computer, as Aachen did in its Ac-DatEP project (about 90 detector boxes, data on the national Mobilithek). That would give us traffic data we may keep and learn from, for side streets too.
- **Give something back.** Once routes have owners and users agree: how many saved routes each site affects (a ranking for the city's site coordination), reports from users ("site gone", "still there", "worse than announced"), and the typos in the feed's titles.

## Checked, and not there

- **Traffic volumes and speeds for city streets:** not open; the count sites are, the counts aren't.
- **Event dates:** the city lists venues only.
- **Restriction field in the construction feeds:** empty; the titles have to be parsed.
- **Locations in the works programme:** names only, no geometry.
- **Construction-site history:** the feeds list current and planned sites only.
- **Of limited use:** one permanent bike counter (`fb61-dauerzaehlstelle-radverkehr-schnettkerbruecke`, 15-minute counts since 2018, near the TU); the noise maps of main roads (the table has no geometry).

## Sources checked on 16 Oct 2026

City datasets on [open-data.dortmund.de](https://open-data.dortmund.de) (826 datasets in all), all under Datenlizenz Deutschland – Zero 2.0:

| Dataset ID | What | Refreshed |
|---|---|---|
| `fb62-strassenabschnitte` | 19,510 street segments with official road class and geometry | updated 16 Oct 2026 |
| `parkhauser` | free spaces in 24 garages and P+R sites | every few minutes |
| `parkplatzsensoren` | ~620 parking sensors: disabled spaces, loading zones, EV spaces | real time, events kept 30 days |
| `park-and-ride`, `haltestellen`, `fahrradmietstation` | 32 P+R sites, 123 rail stops, 94 bike-share stations | locations only |
| `veranstaltungsorte` | 11 event venues, no dates | locations only |
| `baumassnahmen-arbeitsprogramm-des-tiefbauamtes-2026-gesamtubersicht` | 578 Tiefbauamt projects, stage per quarter up to 2028 | as of 28 Jan 2026 |
| `baumassnahmen-arbeitsprogramm-des-tiefbauamtes-im-jahr-2026-2-veranderungsbericht` | 69 schedule changes | updated 5 Oct 2026 |
| `verkehrszaehlung-zaehlstellenplan` | 1,109 traffic count sites, 1998–2024, without counts | updated Apr 2025 |
| `fb61-mobilitatsbefragung-2019-wege` | 25,393 trips from the 2019 mobility survey | one-off |
| `klimasensoren-aktuelle-messungen` | 105 climate sensors, including precipitation | every 5 minutes |
| `leuchtstellen` | 54,527 street lights | locations only |

Other sources:

| Source | What | Terms |
|---|---|---|
| Autobahn GmbH API (`verkehr.autobahn.de`) | roadworks, closures, warnings with delay and speed | no key; no terms stated on autobahn.api.bund.dev |
| OpenLigaDB | Bundesliga fixtures | free, no key, community-maintained |
| OpenHolidays API | school and public holidays | free, no key |
| Bright Sky | DWD weather and warnings | free, no key; DWD data |
| Donkey Republic GBFS (`donkey_ruhr`) | metropolradruhr stations and bikes, live | CC0 |
| Unfallatlas | geocoded accidents with injuries, 2016–2025 | DL-DE BY 2.0, attribution required |
| Transitous | public transport routing | open-source, non-commercial projects only |
| Mapbox Directions API | congestion per piece of the route, `depart_at`, `duration_typical` | 100,000 free requests a month according to third-party pages; storage terms to check |
| Google Routes API | `speedReadingIntervals` along the route | traffic-aware requests billed at least as Pro: 5,000 free a month; no storing |
| TomTom Flow Segment Data | current and free-flow speed near a point | 20,000 free requests a month |
