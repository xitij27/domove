/**
 * Obstacle alignment: construction site active windows vs route travel days (#5).
 *
 * Routes repeat weekly on `weekdays`, run once on `startDate`, or (with
 * neither) run today.
 *
 * A single trip needs its date inside the site's [startsOn, endsOn],
 * a weekly route needs one upcoming active day on one of its weekdays,
 * and an unscheduled route needs the site active today.
 * NULL dates stay open-ended. Expired sites (endsOn < today) never match
 * a weekly or unscheduled route.
 */

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const WEEKDAY_ISO: Record<Weekday, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function toDateString(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    return d.slice(0, 10);
  }
  if (d instanceof Date) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * True when a site with [startsOn, endsOn] is active on at least one of
 * the route's travel days: startDate for a single trip, the upcoming
 * weekdays for a weekly route, today otherwise.
 *
 * Mirrors `private.site_active_on_route()` in 20261016191000_obstacles_weekday_alignment.sql.
 */
export function isSiteActiveOnRoute(
  weekdays: Weekday[] = [],
  startDate: string | null = null,
  startsOn: string | Date | null = null,
  endsOn: string | Date | null = null,
  now: Date = new Date(),
): boolean {
  const pStartDate = toDateString(startDate);
  const pStartsOn = toDateString(startsOn);
  const pEndsOn = toDateString(endsOn);
  const today = toDateString(now) ?? new Date().toISOString().slice(0, 10);

  // 1. A single trip meets the site when its date falls in the site's window.
  if (pStartDate !== null) {
    const startsOk = pStartsOn === null || pStartsOn <= pStartDate;
    const endsOk = pEndsOn === null || pEndsOn >= pStartDate;
    return startsOk && endsOk;
  }

  // 2. A weekly route meets the site when an upcoming active day falls on one
  // of its weekdays. Only the first seven days out of greatest(starts_on, today)
  // are checked: any longer window holds every weekday, so the seventh day past
  // the start decides it.
  if (weekdays && weekdays.length > 0) {
    // Expired sites (ends_on < today) never match a weekly route.
    if (pEndsOn !== null && pEndsOn < today) {
      return false;
    }
    // NULL ends_on is open-ended into the future, so all weekdays are covered.
    if (pEndsOn === null) {
      return true;
    }

    const windowStart = pStartsOn !== null && pStartsOn > today ? pStartsOn : today;
    if (windowStart > pEndsOn) {
      return false;
    }

    const startD = new Date(`${windowStart}T00:00:00Z`);
    const endD = new Date(`${pEndsOn}T00:00:00Z`);
    const diffDays = Math.round((endD.getTime() - startD.getTime()) / (24 * 60 * 60 * 1000));

    // A window of >= 7 days (start + 6 days) covers every day of the week.
    if (diffDays >= 6) {
      return true;
    }

    const weekdaySet = new Set(weekdays.map((w) => WEEKDAY_ISO[w]));

    for (let i = 0; i <= diffDays; i++) {
      const d = new Date(startD.getTime() + i * 24 * 60 * 60 * 1000);
      const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday, ...
      const isoDow = day === 0 ? 7 : day;
      if (weekdaySet.has(isoDow)) {
        return true;
      }
    }
    return false;
  }

  // 3. No schedule means today: the site must be active now.
  const startsOk = pStartsOn === null || pStartsOn <= today;
  const endsOk = pEndsOn === null || pEndsOn >= today;
  return startsOk && endsOk;
}

export const siteActiveOnRoute = isSiteActiveOnRoute;
