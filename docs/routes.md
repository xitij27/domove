# Issue #1: create and delete routes

## Start the application

This feature is based on `mobile-app-backend` (commit `926f30c`), which contains
the Expo app and Supabase schema. The feature branch is
`feature/issue-1-create-delete-routes`; integrating it also requires those base commits.

1. In Supabase, apply `20261016150000_routes.sql` if it has not already been applied,
   then apply `20261016160000_create_delete_routes.sql` from `supabase/migrations/`.
   The new migration has not been applied to the team's hosted database by this change.
2. Copy `mobile/.env.example` to `mobile/.env` and set
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Keep the existing map configuration described in the root README.
3. Run `cd mobile`, `npm ci`, then `npm start` and open the existing Android/iOS
   development build. Native build instructions are in the root README.

The app footer offers **Create Route** and **Saved routes**. Enter a starting
location and final destination, select Pedestrian, Bicycle or Car, optionally
add/remove stops, then tap **Ready**. The saved list opens after a successful save.
Delete removes a route immediately after the server confirms the deletion. A
failed deletion leaves it visible, with a retryable error. Close returns to the
existing app; Cancel returns from the form to the list without saving.

The form trims location text, ignores blank stops and requires a mode. Labels
allow up to 200 characters, and routes allow up to 50 intermediate stops.
Saving disables editing, closing and duplicate submissions until the request ends.

## Shared contract for teammates

Import from `mobile/src/routes/model.ts` and `mobile/src/routes/api.ts`:

```ts
import { routesRepository } from './routes/api';
import type { SavedRoute } from './routes/model';

const routes: SavedRoute[] = await routesRepository.list();
const route = await routesRepository.create({
  start: 'Dortmund Hauptbahnhof',
  destination: 'Westfalenpark, Dortmund',
  mode: 'bike',
  waypoints: ['Friedensplatz, Dortmund'],
});
await routesRepository.delete(route.id);
```

```ts
type SavedRoute = {
  id: string;                       // Database-generated UUID
  name: string;                     // Derived from start and destination
  start: RouteLocation;
  destination: RouteLocation;
  mode: 'pedestrian' | 'bike' | 'car'; // UI label for bike is Bicycle
  waypoints: (RouteLocation & { id: string; sequence: number })[];
  createdAt: string;                // Database-generated ISO timestamp
};
type RouteLocation = {
  label: string;
  coordinate: { latitude: number; longitude: number } | null;
};
```

Visit `start`, then `waypoints` in array order, then `destination`.
Coordinates are **null until resolved**; never interpret null as `(0, 0)`.
Map/calculation features can resolve labels and populate the existing PostGIS
`routes.start_location`, `routes.finish_location` and `route_waypoints.location`
columns. The read projection automatically reflects those coordinates. No
geocoder, route calculation, map visualization or obstacle analysis is added here.

The existing schema required coordinates and a recurring schedule. The new
migration allows null coordinates and `start_time`, and empty `weekdays` for
unscheduled plans. Existing scheduled/spatial rows, indexes and enum values are
preserved. Consumers must handle these optional values. Labels or coordinates
must be present for every location. Scheduling remains in the underlying tables
and can be added to the shared projection when that feature needs it.

## Persistence and API

- `GET /rest/v1/saved_routes?select=route&order=created_at.desc,id.desc` returns
  `{ route: SavedRoute }[]`. The repository reads pages of 100 rows.
- `POST /rest/v1/rpc/create_saved_route` takes `p_start_label`, `p_finish_label`,
  `p_modality` and optional `p_waypoints: string[]`, and returns one `SavedRoute`.
  Route and child inserts run in one transaction, so a failed stop cannot leave
  a partial route. The server also validates inputs.
- `DELETE /rest/v1/routes?id=eq.<uuid>` deletes the route. The existing foreign
  key cascades deletion to all its stops.

Use the existing publishable key in the `apikey` header. The read view uses
`security_invoker`; the RPC also uses invoker privileges, preserving table RLS.
This retains the existing hackathon access model: no login, and routes are shared
by all users of the configured backend. Per-user ownership requires the team's
future authentication work. There is no localStorage copy or offline write queue.
Reopening the list or refreshing the app reads Supabase again. Consumers should
reload after a mutation; there is no cross-device realtime subscription.

The client prevents concurrent double taps. If a connection fails after the
server commits but before its response arrives, check **Saved routes** before
retrying; saves do not have cross-request idempotency tokens.

## Checks

From `mobile/`:

```sh
npm test -- --runInBand
npx tsc --noEmit
npm run lint
npx expo export --platform android --output-dir dist/issue-1-android
```

The component tests drive the actual form/list with an in-memory repository;
API tests check HTTP calls and failures. `test-renderer` is the only explicit
new development dependency (already used transitively by `jest-expo`), installed
with `npx expo install --dev test-renderer@1.3.0`. No production dependencies changed.

Database tests use PostgreSQL 16/PostGIS 3.5 and a disposable database, without
running the unrelated construction-feed sync migration. Example Docker setup:

```sh
docker run -d --rm --name domove-issue1-db -e POSTGRES_PASSWORD=local-issue1-test postgis/postgis:16-3.5
# Wait until pg_isready succeeds:
docker exec domove-issue1-db pg_isready -U postgres
docker exec domove-issue1-db psql -U postgres -c "create database domove_issue1 template template0;"
docker exec domove-issue1-db psql -U postgres -d domove_issue1 -c "create schema extensions; create role anon; create role authenticated; grant usage on schema public, extensions to anon, authenticated;"
docker cp supabase/migrations/20261016150000_routes.sql domove-issue1-db:/tmp/routes.sql
docker cp supabase/migrations/20261016160000_create_delete_routes.sql domove-issue1-db:/tmp/create_delete_routes.sql
docker cp supabase/tests/routes.sql domove-issue1-db:/tmp/routes_test.sql
docker exec domove-issue1-db psql -U postgres -d domove_issue1 -v ON_ERROR_STOP=1 -f /tmp/routes.sql -f /tmp/create_delete_routes.sql -f /tmp/routes_test.sql
docker run -d --rm --name domove-issue1-rest --link domove-issue1-db:db -p 127.0.0.1:3081:3000 -e PGRST_DB_URI=postgres://postgres:local-issue1-test@db:5432/domove_issue1 -e PGRST_DB_ANON_ROLE=anon -e PGRST_DB_SCHEMAS=public postgrest/postgrest:latest
node supabase/tests/routes-rest.mjs
docker stop domove-issue1-rest domove-issue1-db
```

`supabase/tests/routes.sql` checks validation, permissions, coordinate projection,
ordered stops, atomic rollback and cascade deletion; all its writes roll back.
The REST smoke test checks the real JSON contract and fresh-request persistence,
then deletes its own fixtures.

Before demoing, check on a device: create each mode, add several stops, remove a
middle stop, leave one blank, save two routes, reload the app, delete one, and
verify the other remains. Check keyboard scrolling and large text on a small
screen, plus Close returning to the existing map. Automated component tests and
an Android bundle export do not replace physical-device/native-build checks.

## Change inventory

Modified:
- `README.md`: link to this guide.
- `mobile/App.tsx`: expose the route manager beside the existing app.
- `mobile/package.json`, `mobile/package-lock.json`: declare the test renderer.

Created:
- `mobile/src/routes/model.ts`: shared types and draft validation.
- `mobile/src/routes/api.ts`: Supabase repository.
- `mobile/src/routes/RouteForm.tsx`: route entry and optional stops.
- `mobile/src/routes/RoutesManager.tsx`: launcher, saved list and deletion.
- `mobile/src/routes/model.test.ts`, `mobile/src/routes/api.test.ts`,
  `mobile/src/routes/RoutesManager.test.tsx`: unit, API and component checks.
- `supabase/migrations/20261016160000_create_delete_routes.sql`: schema evolution,
  shared read projection and atomic create RPC.
- `supabase/tests/routes.sql`, `supabase/tests/routes-rest.mjs`: database and REST checks.
- `docs/routes.md`: setup, integration contract and verification instructions.

Verified on 2026-10-16: all 17 Jest tests (including the existing sites test),
TypeScript, Expo lint, Android JavaScript/Hermes bundle export, SQL assertions
on PostgreSQL 16/PostGIS 3.5, and the REST smoke test with PostgREST 16.4 passed.
No physical-device test, signed native build, or hosted Supabase deployment was performed.
