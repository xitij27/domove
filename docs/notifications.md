# Issue #4: construction notifications

## What works now

Alerts live on the map, next to the construction sites they are about. In
**Saved routes**, **Map & alerts** shows a route on the map (see
[routes.md](routes.md)). The card at the bottom then has an alerts row, e.g.
"Alerts 1 day before at 09:00 · Next Thu 23 Oct, 09:00". Tapping it offers
**1 week before**, **1 day before** and **Off** (the default), plus the alert
time (default 09:00, phone time), picked from the phone's clock like the
leaving time. Each change is saved at once. Tapping a site's pin on the route
shows when its alert comes ("Alert Thu 23 Oct, 09:00"), that it already came
("Alerted …"), that alerts are off, or "No alert scheduled". These come from
what the phone really scheduled, so a phone that blocks the app's
notifications shows no alert times, and the row warns about it. The choice is
stored on the phone, in `construction-notifications.json` in the app's
documents folder.

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

- **Detour time.** Issue #4 asks for "Take a detour of __ minutes" and for the
  detour with turn-by-turn steps on the route's map. Both need the detours from
  route planning (#12). Until then the alert leaves the detour sentence out and
  opens the site on the construction map, not on its route. There is no
  hand-off to Google Maps (question 10 in
  [route-planning-open-questions.md](route-planning-open-questions.md)).
- **Alert times while a route is open.** The alerts row reads the phone's
  reminders when the route opens and after each change, not again when the app
  re-checks obstacles on returning to the foreground; reopen the route to see
  those.
- **Alerts while the app is closed for a long time.** The phone only learns
  about new obstacles when the app is opened. Real server push needs routes to
  have owners first (question 7 there), then an Expo push sender on the
  backend.

## Run and test

`expo-notifications` adds native code, so rebuild the development build
(`npx expo run:android`) after pulling. In a development build, the opened
alerts row has **Send test alert**, which sends the alert for the first known
obstacle on that route in two seconds; tap it to check that the site's card
opens.

Automated checks, from `mobile/`: `npm test`, `npx tsc --noEmit`,
`npm run lint`.
