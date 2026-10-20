# Route planning: open questions

Open questions · [Route planning, issue #12](https://github.com/xitij27/domove/issues/12) · 16 Oct 2026

Issue #12 plans obstruction-free routes from a start to a destination. This page lists the questions the plan left open: why each one matters, the options, and what waited on it. **All of them were decided on 16 Oct 2026**; [What the decisions change](#what-the-decisions-change) lists where the answers differ from #12's assumptions. Facts about the live database and the city feeds were checked on 16 Oct 2026.

## At a glance

| # | Question | Decision | Waiting on it |
|---|---|---|---|
| 1 | [Do we need a separate planner, or is the route form from #1 enough?](#1-do-we-need-a-separate-planner-or-is-the-route-form-from-1-enough) | **#1's route form only** (option A); no separate planner | the app part of #12 |
| 2 | [Which engine draws the paths?](#2-which-engine-draws-the-paths) | **openrouteservice now, pgRouting later** if we outgrow it | API work |
| 3 | [Who syncs construction sites and replans saved routes?](#3-who-syncs-construction-sites-and-replans-saved-routes) | **the pg_cron job only**; the Node sync goes | database migration 1, replanning |
| 4 | [Does a full road closure block people on foot and on bikes?](#4-does-a-full-road-closure-block-people-on-foot-and-on-bikes) | **walking: slowed; bike: blocked** | impact defaults |
| 5 | [How much detour is worth it to avoid a slowed site?](#5-how-much-detour-is-worth-it-to-avoid-a-slowed-site) | **#12's penalties, highest one per site**; no "avoid all" switch | impact defaults |
| 6 | [Which day do we plan for when a route has no weekdays?](#6-which-day-do-we-plan-for-when-a-route-has-no-weekdays) | **today** | replanning, #4 |
| 7 | [When do routes get owners and login?](#7-when-do-routes-get-owners-and-login) | **anonymous sign-ins** before anyone outside the team saves a route | saving real addresses |
| 8 | [What do we keep from a search that isn't saved?](#8-what-do-we-keep-from-a-search-that-isnt-saved) | **moot**: with option A there are no unsaved searches | API design |
| 9 | [Where do place suggestions come from, and how far may a trip go?](#9-where-do-place-suggestions-come-from-and-how-far-may-a-trip-go) | **public Photon, called by the app; trips anywhere** with a notice outside Dortmund | search UI |
| 10 | [What does "Open in Google Maps" hand over?](#10-what-does-open-in-google-maps-hand-over) | **no hand-off**; the app shows its own steps | #4 |
| 11 | [Smaller questions with a default](#11-smaller-questions-with-a-default) | see the table; three differ from the defaults | nothing yet |
| | [Checked already](#checked-already) | | |
| | [To try out once we have an ORS key](#to-try-out-once-we-have-an-ors-key) | | |

## 1. Do we need a separate planner, or is the route form from #1 enough?

**Decision:** A, paths for saved routes only. #1's form now has place suggestions and saves coordinates (PR #7). The search bar can still follow later; nothing in A is wasted. **Decided by:** xitij27, 16 Oct 2026.

Anton commented on #12: "An entire route mapping is not needed. The user can already make routes from the route creation mask."

What #1's form did when this was asked: it saved start, destination, stops and mode as text only, without coordinates or a path. Since PR #7 it suggests places and saves their coordinates; a saved route still needs a path before #2 can draw it and #3, #4 and #5 can find the sites on it.

| | A. Paths for saved routes only | B. Separate planner, as in #12 |
|---|---|---|
| Where people enter places | #1's form, with suggestions in its fields so each place gets coordinates | a search bar on the map, and #1's form |
| When the path appears | after saving, on the route's map (#2) | while searching, before saving |
| Database work from #12 | all of it: closure kinds and impacts, `route_obstructions`, `sites_on_paths`, `route_paths`, replanning | the same |
| API work from #12 | `/api/plan` and `/api/places` | the same |
| App work from #12 | suggestions in #1's fields; the path and its sites on #2's map; time and detour on the route | all of A, plus the search bar, the planner panel, the result card, "Your location", picking an alternative, picking a day |
| Questions that go away | 8 (nothing is searched without saving) | none |

A is a subset of B: everything A needs, B needs too. So building A first wastes nothing, and the search bar can follow if people want to check a trip without saving it.

Without suggestions in the form, we could look up the typed text after saving and take the first hit. But "Hauptstraße" alone matches several streets in and around Dortmund, and the route would quietly start in the wrong place.

## 2. Which engine draws the paths?

**Decision:** openrouteservice now, pgRouting if we outgrow it. **Decided by:** xitij27, 16 Oct 2026.

The engine has to route around areas we give it, for car, bike and walking. The database functions in #12 don't depend on the engine; only `/api/plan` calls it, so switching later changes one file.

| | openrouteservice API | pgRouting in our Supabase | Self-hosted GraphHopper or Valhalla |
|---|---|---|---|
| Avoid areas | yes (`avoid_polygons`) | yes, any cost we write in SQL | yes |
| Extra time for slowed sites | no; we ask up to three times and score the paths | yes | GraphHopper: yes |
| Turn-by-turn text | yes, in German | no, we'd build it from street names | yes |
| Turn restrictions | yes | only with `pgr_trsp` | yes |
| Limits | free key: 2,000 directions a day and 40 a minute, so about 650 plans a day | shared free CPU; `anon` queries stop after 3 s | a server with a few GB of RAM, which we don't have |
| Work | an API key and a fetch | import Dortmund's OSM roads, refresh them monthly, write the planner in SQL | run and update a server |

pgRouting 3.4.1 is available in our project but not enabled. Because `anon` queries stop after 3 s (`authenticated` after 8 s), a planner inside the database, called with the publishable key, would have to search only a small box around the trip.

## 3. Who syncs construction sites and replans saved routes?

**Decision:** A, the pg_cron job only. It switches to the area feeds and writes polygons; #5's Node sync stops writing `construction_sites`. **Decided by:** xitij27, 16 Oct 2026.

Two syncs write `public.construction_sites` in the live database today:

| | pg_cron job (on main) | Node loop (#5's branch) |
|---|---|---|
| Runs | hourly at :00 inside Postgres, `private.sync_construction_sites()` | every 15 minutes wherever the Node backend runs; it last wrote at 16:23 UTC on 16 Oct |
| Reads | the point feeds | the area feeds |
| Writes polygons (`geom`, `area_sqm`) | no | yes |
| Deletes | every site its feeds don't list | every site it hasn't seen for an hour |
| Needs a server | no | yes, or an outside cron that calls `POST /api/detect/run` |

Right now the point and area feeds list the same 158 current and 54 planned sites, and all 212 rows have a polygon, so the two syncs don't get in each other's way. If the feeds ever differ, the pg_cron job deletes the sites only the area feeds list, polygons included, until the Node loop adds them back. A site that only the pg_cron job adds has no polygon. Route planning needs a polygon for every site, so one sync has to own the table.

- **A. pg_cron only (assumed).** Switch the SQL function to the `-flachen` feeds and have it write `geom` and `area_sqm`. Replanning becomes a second pg_cron job that calls `/api/plan` through the `http` extension, the same way the sync calls the city. No server. SQL is harder to test than TypeScript.
- **B. Node only.** Drop the pg_cron job. Something has to run the loop: Vercel Hobby crons run only once a day, so an outside cron service would call it.

Keeping both isn't an option.

## 4. Does a full road closure block people on foot and on bikes?

**Decision:** walking: slowed (+60 s); bike: blocked. **Decided by:** xitij27, 16 Oct 2026.

95 of 212 sites say Vollsperrung. That usually closes the road to vehicles, while the sidewalk often stays open. 13 sites say outright that the sidewalk is closed, and those block walking whatever we decide here.

| A full closure counts for walking as | What happens |
|---|---|
| blocked | Safest, but walks get longer and some destinations become unreachable |
| slowed (assumed) | The path goes around when the detour is short, otherwise through it with a warning |
| no effect | Shortest walks, but we may send people into a closed street |

Bikes have the same choice: blocked (assumed), or slowed, meaning "push the bike along the sidewalk".

## 5. How much detour is worth it to avoid a slowed site?

**Decision:** the penalties in #12, tuned in `closure_impacts` after test trips. A site with several closure kinds takes the highest penalty, not the sum. No "Avoid all construction" switch for now. **Decided by:** xitij27, 16 Oct 2026.

A penalty is the extra time we count for passing a slowed site. With +120 s for a half closure, a car goes around it when the detour adds less than 2 minutes. To decide:

- **The numbers.** They live in the `closure_impacts` table, so we can change them without a release.
- **Sites with several closure kinds**, e.g. a half closure with temporary lights: take the highest of their penalties (assumed) or add them up.
- **An "Avoid all construction" switch** for users that turns every slowed site into a blocked one. Not planned so far.

## 6. Which day do we plan for when a route has no weekdays?

**Decision:** plan and replan for today. **Decided by:** xitij27, 16 Oct 2026.

Sites are active on certain days only, so a path depends on the travel day. Saved routes can have weekdays and a start time, but since #1 both are optional: in the live database `weekdays` may be empty and `start_time` may be null. Such a route has no "next travel day".

- **Plan and replan for today (assumed).** Simple; a planned closure shows up only on its first day.
- **Ask for weekdays when a planned route is saved.** One more field in the form.
- **Plan each of the next 7 days** and show on which days the route is affected. Fits #4's notifications best, but costs seven times the ORS calls.

## 7. When do routes get owners and login?

**Decision:** Supabase anonymous sign-ins before anyone outside the team saves a route. Until then, save only test addresses. **Decided by:** xitij27, 16 Oct 2026.

Today anyone with the publishable key can read, change and delete every route; the routes migration leaves RLS open until there is login. Route planning adds exact coordinates, and start and destination are often someone's home and work.

- **Keep it open for the demo**, and save only test addresses.
- **Supabase anonymous sign-ins.** Each install gets a user id without an account screen, and RLS checks `owner_id = auth.uid()`. A small change with real protection, but routes are lost when the app is reinstalled.
- **Full accounts** (email or Google sign-in). Routes move between phones, but we need sign-up screens.

Suggestion: anonymous sign-ins before anyone outside the team saves a route.

## 8. What do we keep from a search that isn't saved?

**Decision:** moot. Question 1 was answered with A, so every path belongs to a saved route. **Decided by:** xitij27, 16 Oct 2026.

This only matters if question 1 is answered with B; with A, every path belongs to a saved route.

The plan stores nothing from a search unless the user saves the route. But `/api/plan` is a GET with the coordinates in the URL, so that Vercel's edge cache can answer repeated searches. The coordinates therefore also land in Vercel's request logs and stay in the cache for 5 minutes.

- **GET with coordinates rounded to 5 decimals, about 1 m (assumed).** Cache hits save ORS calls; coordinates appear in logs.
- **POST.** No coordinates in URLs or logs, but no edge cache, so every search costs ORS calls.

## 9. Where do place suggestions come from, and how far may a trip go?

**Decision:** public Photon, called directly by the app (as #1's form does; no `/api/places` for now). Trips may go anywhere; suggestions are biased to Dortmund, and a path that leaves the city gets a notice that we have no site data there. **Decided by:** xitij27, 16 Oct 2026.

- **Provider.** Photon's public server is free and needs no key, but it's fair use: komoot throttles heavy users. Every character typed after the third sends a request (with a 300 ms debounce). Fine for a demo; for real use we'd host Photon ourselves or pay for a geocoder.
- **Area.** Construction data covers only Dortmund. We can allow trips anywhere and show a notice when the path leaves the city (assumed), or only suggest places in Dortmund. Limiting suggestions to Dortmund is clearer, but people commute from Unna or Bochum.

## 10. What does "Open in Google Maps" hand over?

**Decision:** hand off to Google Maps, with via-points that keep Google on our way around the closures. The app does no navigation itself: no in-app turn-by-turn steps and no follow mode. **Decided by:** xitij27, 21 Oct 2026. This replaces the decision of 16 Oct 2026 (no hand-off, our own steps instead).

In #4, tapping the notification should show the detour in Google Maps. But Google Maps doesn't know our closures and plans its own path between the points we hand over, and a link carries only a few via-points, so Google may still lead through a closure between two of them.

- **Via-points just past each avoided site (assumed).** Usually enough to keep Google on our path.
- **Our own steps list only**, no hand-off.
- **Hand-off plus a warning** that Google doesn't know about the closures.

## 11. Smaller questions with a default

Decided one by one; **bold** marks an answer that differs from the default. **Decided by:** xitij27, 16 Oct 2026.

| Question | Default in the plan | Decision |
|---|---|---|
| Closures only during the day ("Vollsperrung (tagsüber)") | Treated as all day | **Ignored outside 6:00–22:00.** The travel time is the route's optional "Leaving at" time, else the time of planning |
| One-way closures where the feed doesn't name the direction | Slowed in both directions | **Blocked in both directions** for car and bike; no effect on walking |
| Sites that match no closure pattern (18 of 212 today) | Slowed for every mode | **No effect** until someone sets `closures_override` |
| How far to grow a polygon so it covers the road's centre line | 5 m; tune per closure kind after test trips | As the default |
| A manual fix for a misread site (`closures_override`) | Kept on the row; lost when the site's id changes, e.g. when a planned site becomes current | As the default |
| Stops per trip: #1 allows 50, but ORS takes 50 points including start and destination | At most 48, or fewer if the form gets crowded | 48 |
| A site from the current feed without dates | Active today (all 212 sites have dates right now) | As the default |
| A planned site without dates | Not active | As the default |

## What the decisions change

Where an answer differs from what #12 assumed, this is the work it adds or removes:

- **#12 shrinks to option A** (question 1): no search bar, planner panel or result card. The path, its sites and the detour show on the saved route's map (#2).
- **No `/api/places`** (question 9): the app calls Photon directly, as #1's form already does.
- **#4 shows the detour in the app** (question 10), not in Google Maps. Update #4's text ("The user sees his Detour in Google Maps").
- **Daytime-only closures** (section 11):
  - the closure parser also sets a "daytime only" flag for "tagsüber";
  - `route_obstructions` and `sites_on_paths` take a travel time and skip those sites outside 6:00–22:00;
  - #1's form gets an optional "Leaving at" field, stored in `routes.start_time`;
  - the `routes_schedule_complete` constraint is relaxed, so a start time is allowed without weekdays. It means "today at this time"; weekdays still need a time.
- **`closure_impacts` defaults** (section 11): `one_way` is blocked for car and bike (none for walking), and `unknown` is none for every mode.
- **#1's stop limit drops from 50 to 48** (section 11): in the form, in `create_saved_route` and in the `route_waypoints_seq_limit` constraint.
- **#5's Node sync stops writing `construction_sites`** (question 3). Its obstacle loop can stay, but it reads the table the pg_cron job fills.

## Checked already

Checked on 16 Oct 2026 against the live Supabase project and the city's open data API.

- **The live database already has the site polygons.** All 212 rows have `geom` and `area_sqm`. The migration files on main don't have these columns, and Supabase's migration history is empty because everything went in through the SQL editor. `weekdays_are_distinct`, `route_point_json`, `saved_routes`, `create_saved_route` and `obstacles` also exist live but not on main. The first step in #12 (bring the schema onto main) stays.
- **pgRouting:** version 3.4.1 is available, not enabled.
- **Query time limits:** `anon` 3 s, `authenticated` 8 s.
- **Dates:** all 212 sites have a start and an end date.
- **Point and area feeds** both list 158 current and 54 planned sites.
- **ORS ignoring avoid areas:** the forum reports turned out to be malformed MultiPolygons and swapped latitude and longitude. ORS's maintainers say a polygon has to cross the road to block it. Growing each polygon by `buffer_m` is for that, and `sites_on_paths` checks every path again anyway.
- **Licence of the Dortmund feeds:** Datenlizenz Deutschland – Zero 2.0, so no attribution is required (naming "Stadt Dortmund, Tiefbauamt" is still polite). OpenStreetMap, openrouteservice and Photon do require attribution.

## To try out once we have an ORS key

- Does `alternative_routes` work together with `avoid_polygons`? If not, alternatives come only from our three requests.
- How far must a polygon grow before ORS avoids the street? Try five sites of each closure kind.
- How long does a request with 20 to 30 avoid polygons take?
- What does ORS do when the start lies inside an avoid area? The plan removes such polygons anyway; this tells us whether we have to.
- How good are Photon's suggestions for Dortmund addresses and places like "Hauptbahnhof" or "Westfalenpark"?
