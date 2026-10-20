# Issue #1: create and delete routes

## Start the application

1. Apply the route migrations from `backend/supabase/migrations/`, in this order,
   by pasting each into the Supabase SQL editor (see the root README):
   1. `20261016150000_routes.sql`
   2. `20261016151000_create_delete_routes.sql`
   3. `20261016152000_saved_routes_hardening.sql`
   4. `20261016153000_routes_require_coordinates.sql`
   5. `20261016154000_routes_leaving_time.sql`
   6. `20261016190000_routes_leaving_date.sql` (after the obstacles migrations)
   7. `20261016200000_update_saved_route.sql`
   8. `20261017130000_restore_update_saved_route.sql`

   Apply all of them in order; see [Team database](#team-database) for the
   manually recorded deployment history. The eighth migration is the repair
   for Issue #43 and must be present anywhere route editing is enabled.
   The second file was renamed from `20261016160000_create_delete_routes.sql`
   so it no longer shares a version with the obstacles branch; its content is
   unchanged. The third adds table constraints, so it fails if a route has a start
   time without weekdays (or the reverse) or repeats a weekday. Routes created by
   the app never do. The fourth deletes routes saved without coordinates and
   then requires a coordinate for every place. The fifth adds the optional
   leaving time, allows a start time without weekdays and lowers the stop limit
   to 48, so it fails if a route has more than 48 stops. The sixth adds the
   optional leaving date, puts weekdays into the RPC and the read view, and
   changes no data. The seventh adds `update_saved_route` for editing and
   changes no data. The eighth repairs Issue #43 by reapplying that function at
   the migration tip and fixing its route-label assignments; it is idempotent
   for databases where the seventh migration was already applied.
2. Copy `mobile/.env.example` to `mobile/.env` and set
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Keep the existing map configuration described in the root README.
3. Run `cd mobile`, `npm ci`, then `npm start` and open the Android/iOS
   development build. The **Leaving at** pickers use
   `@react-native-community/datetimepicker`, a native module, so a development
   build from before it was added must be rebuilt once (`npx expo run:android`).
   Native build instructions are in the root README.

The app footer is a sheet below the map with **Create Route** and **Saved routes**.
Tapping either, or pulling the sheet up, raises it over the map. Type a starting
location and final destination and pick each from the suggestions, select Pedestrian, Bicycle or Car, optionally
add/remove stops, optionally set **Leaving at**, then tap **Ready**.
**Leaving at** works like setting an alarm: tap the large time to open the
phone's clock (on iOS it opens below the days), and optionally tap the round
**M T W T F S S** buttons to repeat on those days. It reads "Doesn't repeat"
until a day is picked, then sums the days up, e.g. "Weekdays" or "Mon, Wed".
Picking a day before a time opens the clock; ✕ clears both. The saved list
opens after a successful save, and each route reads e.g. "Leaving at 07:15 · Weekdays".
Below that it says how many construction sites the obstacles job found on its
way, e.g. "3 construction sites on the way · 1 of them planned": the same sites
**Map & alerts** shows, counted for every route in one request as the list loads.
A route saved in the last 20 minutes with none yet reads as still being checked,
since the job looks at new routes every 15 minutes. An edited route keeps its
old count until the job routes it again.
Each saved route has a blue pencil and a trash button. The pencil opens the form
filled in with the route; **Save changes** replaces it in place, keeping its
place in the list, and a route shown on the map is redrawn.
The trash button removes a route immediately after the server confirms the deletion. A
failed deletion leaves it visible, with a retryable error. Close, pulling the
sheet down or Android's back button lowers it to the map again, except while a
save or deletion is still running; Cancel returns from the form to the list
without saving.

**Map & alerts** lowers the sheet and draws the route on the map behind it (no
second map): the path, a green start, teal stops and a violet destination. The
camera fits the route, and the map then shows only the construction sites on
its way, the ones the obstacles job stored for it in `obstacles` (see
[notifications.md](notifications.md)). The Current/Planned chips count and
filter those. A card at the bottom names the route and how many sites lie on
the way, and holds the route's construction alerts; a site's card says when
its alert comes (see [notifications.md](notifications.md)). The route card's ✕
or Android's back button shows every site again. Deleting the
route also closes it. The path comes from the same FOSSGIS OSRM request as
`private.route_requests`, so it is the line the obstacles were matched against;
until it answers, or if it fails, a straight line joins the stops. A route the
job has not checked yet shows no sites.

Meanwhile the app looks for the best way around the construction sites that run
when the route is next taken, for its mode ([site-rating-and-detours.md](site-rating-and-detours.md#in-the-app)).
The card reads "Looking for a way around construction…" for a few seconds, then
e.g. "Recommended · 18 min (+4 min) · 6.2 km" and "Avoids Kaiserstraße (9/10)",
or "No detour needed". The way replaces the line on the map, up to two other ways
show in grey, and tapping one, or its button on the card, picks it for Google Maps.
A site the way can't avoid is named on the card. The blue **Google Maps** button at
the top of the route card opens the selected way (or the original route if no detour
is needed) in Google Maps with the route's stops and detour anchors (Issue #55). It is
greyed out, with a note, when Google can't keep every saved stop (more than three).

The app does no navigation itself: there is no in-app Start or follow mode.
Directions while travelling come from Google Maps, through the button above.

Suggestions come from [Photon](https://photon.komoot.io) (OpenStreetMap data,
free, no key), nearest to Dortmund first, from the third character on. Only a
picked suggestion gives a place its coordinate; typing over it removes the
coordinate again, and **Ready** asks to pick one. That way every saved route can
be checked against construction sites (#5).

The form trims location text, ignores blank stops and requires a mode. Labels
allow up to 200 characters, and routes allow up to 48 intermediate stops:
openrouteservice takes at most 50 points, start and destination included. The
leaving time decides whether daytime-only construction sites count (between 6:00
and 22:00); without one, the time of planning is used. It is set like an alarm:
a time from the phone's clock and, optionally, the days it repeats on. A route
doesn't repeat until days are picked, and days need a time; without days, the
time means today. The app no longer sends a leaving date, though the database
still accepts one.
Saving disables editing, closing and duplicate submissions until the request ends.
Every request gives up after 15 seconds, so a stalled connection cannot lock
the screen.

## Team database

The team project runs the route schema through the eighth migration. The SQL editor keeps no
migration history, so this is the record:

| Migration | Applied |
| --- | --- |
| `20261016150000_routes.sql` | Before the PR #7 review |
| `20261016151000_create_delete_routes.sql` | Before the review, under its old name `20261016160000_create_delete_routes.sql` |
| `20261016152000_saved_routes_hardening.sql` | 2026-10-16, pasted into the SQL editor |
| `20261016153000_routes_require_coordinates.sql` | 2026-10-16, after PR #7's checks passed; deleted no routes (the only one had coordinates) |
| `20261016154000_routes_leaving_time.sql` | 2026-10-16, after PR #7's checks passed; changed no data |
| `20261016190000_routes_leaving_date.sql` | 2026-10-16, through `SUPABASE_DB_URL` in one transaction, after a rolled-back dry run; changed no data |
| `20261016200000_update_saved_route.sql` | Missed on the team database; its absence caused Issue #43 |
| `20261017130000_restore_update_saved_route.sql` | 2026-10-17, through `SUPABASE_DB_URL` in one transaction |

Checked after the Issue #43 repair:

- Through the REST API with the publishable key, `update_saved_route` is present
  and a missing route reaches the function's HTTP 400 validation response rather
  than the old HTTP 404 schema-cache error.
- In a rolled-back production transaction, a throwaway car route was created,
  updated to bike and returned with `mode: "bike"`; no test data was retained.

Checked after `20261016190000_routes_leaving_date.sql`:

- The new constraints, the list index and the five-argument
  `create_saved_route` are in place, the old four-argument version is gone, and
  the existing route still reads back with its coordinates.
- Through the REST API with the publishable key, an invalid save returns
  HTTP 400 with the server's message, and the route list loads.
- Supabase's security advisor reports nothing. The performance advisor's
  "multiple permissive policies" warning comes from the open hackathon policies,
  which the [ownership TODO](routes-database-todo.md) replaces.

Checked after `20261016153000_routes_require_coordinates.sql`: the three location
columns are `not null`, only the jsonb `create_saved_route` exists, and through the
REST API a save without a coordinate returns HTTP 400 with "Pick the starting
location from the suggestions.", while a save with coordinates reads them back.

Before `20261016190000_routes_leaving_date.sql`, the team database's
`create_saved_route` already took a `p_weekdays` parameter and the view returned
`weekdays`, added outside these migrations. The migration keeps both, so it
drops either earlier signature. Checked after it: only the eight-argument
`create_saved_route` exists; in a rolled-back transaction as `anon`, a save with
a date and a time returns `startDate: "2026-10-20"`, weekdays read back in
order, and a date without a time, a date with weekdays, or weekdays without a
time each fail with their message. Both existing routes read back unchanged
through the REST API (one with Monday to Friday), with `startDate: null`.

Checked after `20261016154000_routes_leaving_time.sql`: only the six-argument
`create_saved_route` exists. Through the REST API, a save with `p_start_time`
returns `startTime: "08:30"`, a save without it (as app builds without the
**Leaving at** field send) still works, and 49 stops return HTTP 400. The
existing route reads back with `startTime: "08:00"`.

App builds from before the coordinates change call the old `create_saved_route` and
now get HTTP 404, so they cannot save routes. Update to this branch's app code;
JS changes reload live in a development build.

## Shared contract for teammates

Import from `mobile/src/routes/model.ts` and `mobile/src/routes/api.ts`:

```ts
import { routesRepository } from './routes/api';
import type { SavedRoute } from './routes/model';

const routes: SavedRoute[] = await routesRepository.list();
const route = await routesRepository.create({
  start: { label: 'Hauptbahnhof Dortmund', coordinate: { latitude: 51.5168, longitude: 7.4593 } },
  destination: { label: 'Westfalenpark, Dortmund', coordinate: { latitude: 51.4951, longitude: 7.4754 } },
  mode: 'bike',
  startTime: '08:30',               // or '' for no leaving time
  weekdays: ['monday', 'friday'],   // or [] to not repeat; needs startTime
  waypoints: [{ label: 'Friedensplatz, Dortmund', coordinate: { latitude: 51.5119, longitude: 7.4669 } }],
});
await routesRepository.delete(route.id);
```

```ts
type SavedRoute = {
  id: string;                       // UUID, generated by the app
  name: string;                     // Derived from start and destination
  start: RouteLocation;
  destination: RouteLocation;
  mode: 'pedestrian' | 'bike' | 'car'; // UI label for bike is Bicycle
  startTime: string | null;         // "HH:MM" leaving time; without weekdays it means today
  weekdays: Weekday[];              // Days the trip repeats on, Monday first; [] when it doesn't
  waypoints: (RouteLocation & { id: string; sequence: number })[];
  createdAt: string;                // Database-generated ISO timestamp
};
type RouteLocation = {
  label: string | null;
  coordinate: { latitude: number; longitude: number };
};
```

Visit `start`, then `waypoints` in array order, then `destination`.
Every location has a coordinate, stored in the PostGIS columns
`routes.start_location`, `routes.finish_location` and `route_waypoints.location`
(all `not null`). Routes created by the app always have labels; a location
written with only a coordinate has a null label, and the list shows a generic
name for it. Route calculation and obstacle analysis happen in the backend's
obstacles job; **Map & alerts** only draws a route and reads the job's results.

The existing schema required a recurring schedule. These migrations make it
optional: a route may have no `start_time` and no `weekdays`, or only a
`start_time` ("today at this time", the form's **Leaving at**), or both. Weekdays
always need a start time and never repeat a day. A `start_date` (a single trip
on that day) also needs a start time and cannot be combined with weekdays. Existing scheduled/spatial rows,
indexes and enum values are preserved. Consumers must handle these optional
values. The view also returns `weekdays` (lowercase day names, `[]` for none),
which the app's `SavedRoute` type does not read yet.

If `create` fails, calling it again with the same draft reuses the route's ID.
A save that reached the server before its response was lost therefore returns the
stored route instead of saving it twice. A changed draft gets a new ID.

## Persistence and API

- `GET /rest/v1/saved_routes?select=route&order=created_at.desc,id.desc` returns
  `{ route: SavedRoute }[]`. The repository reads pages of 100 rows and continues
  after the last route of each full page
  (`or=(created_at.lt.<createdAt>,and(created_at.eq.<createdAt>,id.lt.<id>))`),
  so routes added or deleted meanwhile do not shift the pages.
- `POST /rest/v1/rpc/create_saved_route` takes `p_id` (a UUID chosen by the app),
  `p_start`, `p_finish`, `p_modality`, optional `p_waypoints` (an array) and
  optional `p_start_time` (`"HH:MM"`), `p_weekdays` (e.g. `["monday"]`, needs
  `p_start_time`) and `p_start_date` (`"YYYY-MM-DD"`, needs `p_start_time`, not
  with weekdays), and returns one `SavedRoute`. Each place has the read shape
  `{ "label": "…", "coordinate": { "latitude": …, "longitude": … } }`; a missing,
  non-numeric or out-of-range coordinate is rejected. Route and child inserts
  run in one transaction, so a failed stop cannot leave a partial route. Calling
  it again with an existing `p_id` returns that route unchanged. Invalid input
  returns HTTP 400 with code `22023` and a message the app shows as-is.
- `POST /rest/v1/rpc/update_saved_route` (`routesRepository.update(id, draft)`)
  takes the same arguments and checks, with `p_id` naming the route to change,
  and returns the changed `SavedRoute`. Its places, mode, leaving time and stops
  are replaced in one transaction; its ID and `createdAt` stay. A missing route
  returns code `22023`. The obstacles job routes it again on its next run.
- `DELETE /rest/v1/routes?id=eq.<uuid>` deletes the route. The existing foreign
  key cascades deletion to all its stops.
- `GET /rest/v1/obstacles?route_id=eq.<uuid>&select=construction_site_id`
  (`routesRepository.obstacleSiteIds`) lists the sites on a route's way, which
  **Map & alerts** keeps on the map.
- `GET /rest/v1/obstacles?select=id,route_id,construction_sites(status)&order=id`
  (`routesRepository.siteCounts`), in keyset pages of 100, counts the sites on
  every route's way, and how many of them are planned, for the saved list.

The 200-character and 48-stop limits are also table constraints, so they hold
for writes that do not go through the RPC.

Use the existing publishable key in the `apikey` header. The read view uses
`security_invoker`; the RPC also uses invoker privileges, preserving table RLS.
This retains the existing hackathon access model: no login, and routes are shared
by all users of the configured backend. Per-user ownership is still open: see
[routes-database-todo.md](routes-database-todo.md).
There is no localStorage copy or offline write queue.
Reopening the list or refreshing the app reads Supabase again. Consumers should
reload after a mutation; there is no cross-device realtime subscription.

## Checks

From `mobile/`:

```sh
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npx expo export --platform android --output-dir dist/issue-1-android
```

The component tests drive the actual form/list through React Native Testing
Library with an in-memory repository; API tests check HTTP calls and failures.

The **Checks** workflow (`.github/workflows/checks.yml`) runs these on every pull
request, together with the database tests:

- `backend/supabase/tests/database/routes.test.sql` (pgTAP): validation, table
  constraints, idempotent retries, coordinate projection, ordered stops, atomic
  rollback and cascade deletion. All its writes roll back.
- `backend/supabase/tests/routes-rest.mjs`: the real JSON contract through the
  REST API, fresh-request persistence and deletion. It deletes its own fixtures
  and refuses to run against anything but a local stack.

They run on a local Supabase stack with only the route migrations, because the
construction-sites migration fetches the city's live feeds. To run them yourself
(Docker and the Supabase CLI), from the repository root:

```sh
REPO=$PWD
mkdir -p ../routes-db && cd ../routes-db
supabase init
mkdir -p supabase/migrations supabase/tests
cp "$REPO"/backend/supabase/migrations/*routes*.sql supabase/migrations/
cp -r "$REPO"/backend/supabase/tests/database supabase/tests/
supabase start
supabase test db
eval "$(supabase status -o env)"
SUPABASE_URL="$API_URL" SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}" node "$REPO/backend/supabase/tests/routes-rest.mjs"
supabase stop
```

Before demoing, check on a device: create each mode, add several stops, remove a
middle stop, leave one blank, tap **Now**, pick a later date and time, save two routes, reload the app, delete one, and
verify the other remains. Check keyboard scrolling and large text on a small
screen, plus Close returning to the existing map. Automated component tests and
an Android bundle export do not replace physical-device/native-build checks.
