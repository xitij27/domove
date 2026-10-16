# Construction Site Radar Dortmund

Live map of current and planned construction sites from the [Dortmund open data portal](https://open-data.dortmund.de).

## Mobile app (`mobile/`)

The app renders the same data with Google Maps or Mapbox (toggle in the top-right corner), with a day or night map (sun/moon switch below it; the choice is remembered). Mapbox needs native code, so the app runs in a **development build**, not Expo Go.

1. Copy `mobile/.env.example` to `mobile/.env` (gitignored) and fill in:
   - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: see Backend below.
   - `EXPO_PUBLIC_MAPBOX_TOKEN`: Mapbox default public token (free up to 25k monthly users).
   - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`: Google Cloud key with **Maps SDK for Android** enabled (mobile map loads are free; Google requires a billing account on file).
2. Build and install the dev app on an Android phone, either:
   - in the cloud: `npx eas-cli@latest build --profile development --platform android` (free Expo account; first run creates `eas.json`; add `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` with `npx eas-cli env:create` since `.env` is not uploaded), or
   - locally with Android Studio installed: `npx expo run:android`.

   For a sideloadable release APK, every push to `main` runs the **Android APK** workflow (`.github/workflows/android-apk.yml`), and it can also be started by hand from the Actions tab; download the APK from the run's artifacts. It needs the three `EXPO_PUBLIC_MAPBOX_TOKEN` / `EXPO_PUBLIC_SUPABASE_*` values as repository secrets (`gh secret set <NAME>`). If a release APK crashes at launch, see [docs/android-launch-crash.md](docs/android-launch-crash.md).
3. `cd mobile && npx expo start`, then open the project from the dev app.

Rebuild (step 2) only when native config or native packages change; JS changes reload live.

Checks: `npm test`, `npx tsc --noEmit`, `npx expo lint`.

Route creation and deletion (Issue #1): see [setup, shared route model, API and tests](docs/routes.md).

## Backend (`backend/supabase/`)

Supabase (free plan) with PostGIS. The app reads `construction_sites` through Supabase's REST API with the publishable key; Row Level Security allows reads only. A `pg_cron` job inside Postgres re-syncs both city feeds every hour (`private.sync_construction_sites()`), so there is no server to deploy.

Apply a new migration by pasting the file from `backend/supabase/migrations/` into the Supabase SQL editor and running it.

### API on Vercel (`backend/`)

A small Vercel Function, `GET /api/sites?status=current|planned`, serves the table with a 5-minute edge cache. Vercel Hobby (free) is enough; the hourly sync stays in `pg_cron` because Hobby cron jobs only run daily.

Deploy: import the repo in Vercel, set **Root Directory** to `backend`, and add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (see `backend/.env.example`). Check with `cd backend && npm run typecheck`.

# SQL Tables

The tables for different data in the app.

## Routes

The routes the user is planning to take with planned departure schedule, start, finish and any waypoints.

## Obstacles

The construction sites on the way of any given routes. They are calculated in an event loop regularly.

## Construction Sites

All the construction sites in the city with their locations and planned duration.

# User Stories

## Create a Route

As a user, I want to create routes that I plan to take in the future.

1. The user opens the app.
2. The user taps **Create Route**.
3. The user enters the start destination.
4. The user enters the final destination.
5. The user selects a travel mode: pedestrian, bike, or car.
6. The user enters any intermediate destinations.
7. The user taps **Ready**.
8. The user sees the route in the list of routes.

## View a Route on a Map

As a user, I want to see a map so that I can view my routes.

1. The user opens the app.
2. The user sees a list of routes.
3. The user taps a route.
4. The user sees a map of the route.

## View Construction Sites

As a user, I want to see construction sites so that I can see disruptions.

1. The user opens the app.
2. The user sees a list of routes.
3. The user taps a route.
4. The user sees a map of the route with all current construction sites along it.
5. The user turns on a toggle to see future construction sites.
6. The user sees a map of the route with all current and future construction sites along it.
7. The user taps a construction-site pin and sees its planned duration, client, and type of construction work.

## Receive Push Notifications

As a user, I want to receive push notifications for my usual routes so that I can be prepared.

1. The user receives a push notification: “There is a construction site at __ on your route to __. Take a detour of __ minutes. Tap here to see it.”
2. The user taps the notification.
3. The user sees the detour in Google Maps.
