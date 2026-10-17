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

## Demo mode

For presentations, the round **play** button under the quiz button starts a
guided tour. The app sets up each screen by itself, and a card at the top says
what is on show. Tap **Next** when you are done talking; **Back** and the ✕
also work. It works in release builds too.

Before the talk:

- Have a saved route that the backend has found construction on. The obstacle
  check runs every 15 minutes, so save a new route at least that long before.
  The demo picks the saved route with the most construction sites. If none
  has any, it says so instead of starting.
- Allow notifications and location on the phone. The demo asks for
  notifications when it starts; navigation asks for location.
- Have internet access. The demo loads the routes and obstacles live, and
  there is no offline version.

The steps:

1. **Construction sites**: every site, with the Current and Planned chips.
2. **A site**: one of the route's sites, with its impact score. Tap "How
   scores work" yourself if you want to show it, since it covers the screen.
3. **Your saved route**: only the sites on its way.
4. **Alerts**: turns the route's alerts on, 1 day before. The route row and
   the site card show when the alert comes.
5. **The alert**: sends that site's alert in 10 seconds. Lock the phone, then
   tap the alert when it arrives. This opens the site's card and moves the tour
   on to step 6 by itself.
6. **Opened from the alert**: the site the alert opened.
7. **Navigation**: Start, with the map following you.
8. **Weather**: the forecast card.
9. **Quiz**: one question.

**Finish** or ✕ closes the route and puts back the route's alert choice from
before the demo. If the tour stops (for example, Android closed the app while
the phone was locked), tap the play button again. Tapping the alert still
opens its site. If that happens, check the route's alerts row, because it may
still say "1 day before".

The demo's alert is a normal alert from this phone, with the same text as a
scheduled reminder. It just arrives in 10 seconds instead of at the alert
time. There is no server push yet (see *Not yet* above).

## Run and test

`expo-notifications` adds native code, so rebuild the development build
(`npx expo run:android`) after pulling. In a development build, the opened
alerts row has **Send test alert**, which sends the alert for the first known
obstacle on that route in two seconds; tap it to check that the site's card
opens.

Automated checks, from `mobile/`: `npm test`, `npx tsc --noEmit`,
`npm run lint`.
