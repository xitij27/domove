# Construction Site Radar Dortmund

Live map of current and planned construction sites from the [Dortmund open data portal](https://open-data.dortmund.de).

## Mobile app (`mobile/`)

The app renders the same data with Google Maps or Mapbox (toggle in the top-right corner). Mapbox needs native code, so the app runs in a **development build**, not Expo Go.

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

