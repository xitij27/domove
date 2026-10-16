# Issue #1: create and delete routes

## Start the application

1. Apply the route migrations from `backend/supabase/migrations/`, in this order,
   by pasting each into the Supabase SQL editor (see the root README):
   1. `20261016150000_routes.sql`
   2. `20261016151000_create_delete_routes.sql`
   3. `20261016152000_saved_routes_hardening.sql`
   4. `20261016153000_routes_require_coordinates.sql`
   5. `20261016154000_routes_leaving_time.sql`

   The team database already runs all of them; see [Team database](#team-database).
   The second file was renamed from `20261016160000_create_delete_routes.sql`
   so it no longer shares a version with the obstacles branch; its content is
   unchanged. The third adds table constraints, so it fails if a route has a start
   time without weekdays (or the reverse) or repeats a weekday. Routes created by
   the app never do. The fourth deletes routes saved without coordinates and
   then requires a coordinate for every place. The fifth adds the optional
   leaving time, allows a start time without weekdays and lowers the stop limit
   to 48, so it fails if a route has more than 48 stops.
2. Copy `mobile/.env.example` to `mobile/.env` and set
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Keep the existing map configuration described in the root README.
3. Run `cd mobile`, `npm ci`, then `npm start` and open the existing Android/iOS
   development build. Native build instructions are in the root README.

The app footer offers **Create Route** and **Saved routes**. Type a starting
location and final destination and pick each from the suggestions, select Pedestrian, Bicycle or Car, optionally
add/remove stops, optionally enter a **Leaving at** time such as `08:30`, then
tap **Ready**. The saved list opens after a successful save.
Delete removes a route immediately after the server confirms the deletion. A
failed deletion leaves it visible, with a retryable error. Close returns to the
existing app; Cancel returns from the form to the list without saving.

Suggestions come from [Photon](https://photon.komoot.io) (OpenStreetMap data,
free, no key), nearest to Dortmund first, from the third character on. Only a
picked suggestion gives a place its coordinate; typing over it removes the
coordinate again, and **Ready** asks to pick one. That way every saved route can
be checked against construction sites (#5).

The form trims location text, ignores blank stops and requires a mode. Labels
allow up to 200 characters, and routes allow up to 48 intermediate stops:
openrouteservice takes at most 50 points, start and destination included. The
leaving time decides whether daytime-only construction sites count (between 6:00
and 22:00); without one, the time of planning is used.
Saving disables editing, closing and duplicate submissions until the request ends.
Every request gives up after 15 seconds, so a stalled connection cannot lock
the screen.

## Team database

The team project runs all four route migrations. The SQL editor keeps no
migration history, so this is the record:

| Migration | Applied |
| --- | --- |
| `20261016150000_routes.sql` | Before the PR #7 review |
| `20261016151000_create_delete_routes.sql` | Before the review, under its old name `20261016160000_create_delete_routes.sql` |
| `20261016152000_saved_routes_hardening.sql` | 2026-10-16, pasted into the SQL editor |
| `20261016153000_routes_require_coordinates.sql` | 2026-10-16, after PR #7's checks passed; deleted no routes (the only one had coordinates) |

Checked after the last one:

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

App builds from before this change call the old `create_saved_route` and
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
name for it. No route calculation, map visualization or obstacle analysis is
added here.

The existing schema required a recurring schedule. These migrations make it
optional: a route may have no `start_time` and no `weekdays`, or only a
`start_time` ("today at this time", the form's **Leaving at**), or both. Weekdays
always need a start time and never repeat a day. Existing scheduled/spatial rows,
indexes and enum values are preserved. Consumers must handle these optional
values. Weekdays stay in the underlying tables and can be added to the shared
projection when a feature needs them.

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
  optional `p_start_time` (`"HH:MM"`), and returns one `SavedRoute`. Each place has the read shape
  `{ "label": "…", "coordinate": { "latitude": …, "longitude": … } }`; a missing,
  non-numeric or out-of-range coordinate is rejected. Route and child inserts
  run in one transaction, so a failed stop cannot leave a partial route. Calling
  it again with an existing `p_id` returns that route unchanged. Invalid input
  returns HTTP 400 with code `22023` and a message the app shows as-is.
- `DELETE /rest/v1/routes?id=eq.<uuid>` deletes the route. The existing foreign
  key cascades deletion to all its stops.

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
middle stop, leave one blank, save two routes, reload the app, delete one, and
verify the other remains. Check keyboard scrolling and large text on a small
screen, plus Close returning to the existing map. Automated component tests and
an Android bundle export do not replace physical-device/native-build checks.
