# Issue #4: construction notifications

## What works now

Each saved route has a **Notifications** button in **Saved routes**. It offers
**1 Week Before**, **1 Day Before** and **Disabled** (the default), plus a
notification time (default 09:00, phone time). The choice is stored on the
phone, in `construction-notifications.json` in the app's documents folder.

When the app starts and whenever it comes back to the foreground, it reads
`public.obstacles` (filled every 15 minutes by the `detect-obstacles` pg_cron
job, see #5) together with each site's dates and each route's destination. For
every obstacle on a route with notifications on, it schedules one local
reminder:

- the chosen lead time before the site's start date, at the notification time;
- if that moment has passed, or the work has already started, at the next
  notification time instead;
- none once the site's end date has passed.

A reminder that has fired is not sent again, even if the app is reopened. When
an obstacle disappears from the table, or a route is deleted or switched to
Disabled, its pending reminder is cancelled. If the obstacle check fails
(offline, backend down), the reminders scheduled last time stay as they are.

The alert reads: "There is a Construction Site at *site* on your Route to
*destination*. Tap here to see it." Tapping it opens the construction map with
that site's card.

## Not yet

- **Detour time and the route's map.** Issue #4 asks for "Take a detour of __
  minutes" and for the detour with turn-by-turn steps on the route's map. Both
  need the route map (#2) and the detours from route planning (#12). Until then
  the alert leaves the detour sentence out and opens the site on the
  construction map. There is no hand-off to Google Maps (question 10 in
  [route-planning-open-questions.md](route-planning-open-questions.md)).
- **Alerts while the app is closed for a long time.** The phone only learns
  about new obstacles when the app is opened. Real server push needs routes to
  have owners first (question 7 there), then an Expo push sender on the
  backend.

## Run and test

`expo-notifications` adds native code, so rebuild the development build
(`npx expo run:android`) after pulling. In a development build, the notification screen has **Send Test Construction
Alert**, which sends the alert for the first known obstacle on that route in
two seconds; tap it to check that the site's card opens.

Automated checks, from `mobile/`: `npm test`, `npx tsc --noEmit`,
`npm run lint`.
