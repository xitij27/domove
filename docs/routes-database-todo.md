# TODO: route ownership and required coordinates

These two problems came out of the review of PR #7 (create and delete routes).
The rest of that review is fixed in the PR; these were deferred because they
change the database design and need decisions from the team. Until they are
done, treat saved routes as demo data.

## 1. Every install can read, edit and delete every route

The route tables keep the hackathon policies from `20261016150000_routes.sql`:
`anon` may read and write everything. The app uses the publishable key, which
is bundled in the APK, so anyone who extracts it can:

- read every user's routes through `GET /rest/v1/saved_routes`. People type real
  addresses ("Home", "Work"), so this exposes where they live and work;
- delete or rewrite every route, for example with
  `DELETE /rest/v1/routes?id=not.is.null`;
- insert routes without limit. Every client downloads the whole list, so this
  slows down every user's list load.

**Plan**

1. Turn on anonymous sign-ins (Supabase dashboard → Authentication → Sign In /
   Providers). Each install then gets its own user ID without a login screen.
   Anonymous users get the `authenticated` role, not `anon`.
2. In the app, call `signInAnonymously()` on first launch, keep the session
   (`supabase-js` with AsyncStorage is less work than doing it with raw `fetch`)
   and send `Authorization: Bearer <access_token>` with every route request.
3. Add a migration:

   ```sql
   -- Existing rows are demo data: delete them or backfill owner_id first.
   alter table public.routes
     add column owner_id uuid not null default auth.uid() references auth.users on delete cascade;

   drop index public.routes_created_at_id_idx;
   create index routes_owner_created_idx on public.routes (owner_id, created_at desc, id desc);

   drop policy "Anyone can read routes" on public.routes;
   drop policy "Anyone can write routes" on public.routes;
   drop policy "Anyone can read route waypoints" on public.route_waypoints;
   drop policy "Anyone can write route waypoints" on public.route_waypoints;

   create policy routes_owner on public.routes for all to authenticated
     using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
   create policy waypoints_owner on public.route_waypoints for all to authenticated
     using (exists (select 1 from public.routes r where r.id = route_id and r.owner_id = (select auth.uid())))
     with check (exists (select 1 from public.routes r where r.id = route_id and r.owner_id = (select auth.uid())));

   revoke all on public.routes, public.route_waypoints, public.saved_routes from anon;
   revoke execute on function public.create_saved_route(uuid, text, text, public.modality, text[]) from anon;
   ```

   Wrapping `auth.uid()` in `(select …)` lets Postgres evaluate it once per query
   instead of once per row. The obstacles detector connects to the database
   directly as a privileged role, so it bypasses RLS and keeps seeing every route.
   One policy per table also clears the performance advisor's "multiple
   permissive policies" warning for these tables; `obstacles` has the same pair
   of open policies.
4. Add pgTAP tests: user B cannot see, change or delete user A's routes or
   stops, and `anon` can no longer read or write either table.

## 2. Routes are saved without coordinates

The app saves only the text the user typed; `start_location`,
`finish_location` and every `route_waypoints.location` stay NULL. The obstacle
detector on the `5-calculate-obstacles-on-routes` branch needs them:

- `backend/src/lib/detect.ts` calls `mustParse(route.startWkt, "start")`, which
  throws for every route created by the app, so none of them is ever checked for
  obstacles. Each run also logs one error per route and one
  "skipping unparsable waypoint" per stop.
- `backend/src/db/schema.ts` on that branch still declares these columns
  `.notNull()` and re-creates `routes_weekdays_not_empty`, so its Drizzle schema
  no longer matches the database.

**Plan**

1. Look up coordinates when the route is saved. The app already ships a Mapbox
   token, so use Mapbox geocoding or search in the form, or call it behind the
   Vercel API in `backend/`. An autocomplete lets the user pick the right place
   instead of silently taking the top match.
2. Change `create_saved_route` to take a coordinate for the start, the
   destination and every stop.
3. Geocode or delete the existing label-only rows, then require coordinates
   again:

   ```sql
   alter table public.routes
     alter column start_location set not null,
     alter column finish_location set not null;
   alter table public.route_waypoints alter column location set not null;
   ```

   The `routes_start_present`, `routes_finish_present` and
   `route_waypoints_location_present` checks become redundant then.
4. Agree the final constraints with the owner of the obstacles branch and update
   its Drizzle schema to match: `routes_weekdays_distinct` and
   `routes_schedule_complete` replace `routes_weekdays_not_empty`, and the
   coordinate columns' nullability follows step 3.

## Considered and not planned

A single `route_stops` table (start, stops and destination as ordered rows)
would remove the three separate location columns. Both consumers already
rebuild one ordered list: the `saved_routes` view and `detect.ts`. But the
current split was a deliberate choice (list views and endpoint proximity
queries need no join), and the schema is already live. Revisit it only if
editing or reordering stops is added.
