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
3. `cd mobile && npx expo start`, then open the project from the dev app.

Rebuild (step 2) only when native config or native packages change; JS changes reload live.

Checks: `npm test`, `npx tsc --noEmit`, `npx expo lint`.

## Backend (`supabase/`)

Supabase (free plan) with PostGIS. The app reads `construction_sites` through Supabase's REST API with the publishable key; Row Level Security allows reads only. A `pg_cron` job inside Postgres re-syncs both city feeds every hour (`private.sync_construction_sites()`), so there is no server to deploy.

Apply a new migration by pasting the file from `supabase/migrations/` into the Supabase SQL editor and running it.
