import { strings } from '../i18n';

/** In the order the form offers them; their names are in the i18n strings. */
export const TRANSPORT_MODES = ['pedestrian', 'bike', 'car'] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** In the backend's weekday enum order, Monday first; their names are in the i18n strings. */
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export type Weekday = (typeof WEEKDAYS)[number];
export type Coordinate = { latitude: number; longitude: number };
/** Every saved location has a coordinate; the label can be null. */
export type RouteLocation = { label: string | null; coordinate: Coordinate };
export type RouteWaypoint = RouteLocation & { id: string; sequence: number };

export type SavedRoute = {
  id: string;
  name: string;
  start: RouteLocation;
  destination: RouteLocation;
  mode: TransportMode;
  /** "HH:MM" when the user leaves; without weekdays it means today. */
  startTime: string | null;
  /** The days the trip repeats on, Monday first; never set without a startTime. */
  weekdays: Weekday[];
  /** "YYYY-MM-DD" when the trip is on one day, as saved_routes sends it; never set with weekdays. */
  startDate?: string | null;
  waypoints: RouteWaypoint[];
  createdAt: string;
};

/** A place being typed; it gets a coordinate only when picked from the suggestions or the map. */
export type PlaceDraft = { label: string; coordinate: Coordinate | null };
export type Place = { label: string; coordinate: Coordinate };
/** A place in the form being chosen on the map: which one, where the map starts, and where the choice goes. */
export type PlacePick = { title: string; kind: 'start' | 'stop' | 'destination'; initial: Coordinate | null; onPick: (place: Place) => void };

export type RouteDraft = {
  start: PlaceDraft;
  destination: PlaceDraft;
  mode: TransportMode | '';
  waypoints: PlaceDraft[];
  /** "HH:MM", or empty for no time. */
  startTime: string;
  /** The days the trip repeats on, in any order; needs a startTime. */
  weekdays: Weekday[];
};

export const MAX_LOCATION_LENGTH = 200;
// openrouteservice takes 50 points, start and destination included
export const MAX_WAYPOINTS = 48;
export type RouteErrors = Partial<Record<'start' | 'destination' | 'mode' | 'waypoints' | 'startTime', string>>;

export function validateRoute(draft: RouteDraft): RouteErrors {
  const t = strings().routes;
  const errors: RouteErrors = {};
  const start = placeError(draft.start, t.enterStart);
  if (start) errors.start = start;
  const destination = placeError(draft.destination, t.enterDestination);
  if (destination) errors.destination = destination;
  if (!(TRANSPORT_MODES as readonly string[]).includes(draft.mode)) errors.mode = t.selectMode;
  const stops = draft.waypoints.filter(isFilled);
  if (draft.waypoints.length > MAX_WAYPOINTS) errors.waypoints = t.tooManyStops(MAX_WAYPOINTS);
  else if (stops.some((stop) => stop.label.trim().length > MAX_LOCATION_LENGTH)) {
    errors.waypoints = t.stopTooLong(MAX_LOCATION_LENGTH);
  } else if (stops.some((stop) => !stop.coordinate)) errors.waypoints = t.pickStops;
  const time = draft.startTime.trim();
  if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) errors.startTime = t.timeFormat;
  else if (draft.weekdays.length && !time) errors.startTime = t.timeForRepeat;
  return errors;
}

export function normalizeRoute(draft: RouteDraft): {
  start: Place; destination: Place; mode: TransportMode; waypoints: Place[]; startTime: string | null; weekdays: Weekday[];
} {
  const errors = validateRoute(draft);
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
  // validateRoute guarantees a coordinate on every place kept here
  const clean = (place: PlaceDraft): Place => ({ label: place.label.trim(), coordinate: place.coordinate! });
  return {
    start: clean(draft.start),
    destination: clean(draft.destination),
    mode: draft.mode as TransportMode,
    waypoints: draft.waypoints.filter(isFilled).map(clean),
    startTime: draft.startTime.trim() || null,
    // In week order and each day once, as the backend checks
    weekdays: WEEKDAYS.filter((day) => draft.weekdays.includes(day)),
  };
}

/** "Every day", "Weekdays", "Weekends" or the days such as "Mon, Wed, Fri"; null for no days. */
export function repeatSummary(weekdays: readonly Weekday[]) {
  const t = strings();
  const days = WEEKDAYS.filter((day) => weekdays.includes(day));
  const are = (...these: Weekday[]) => days.length === these.length && these.every((day) => days.includes(day));
  if (!days.length) return null;
  if (days.length === WEEKDAYS.length) return t.routes.everyDay;
  if (are('monday', 'tuesday', 'wednesday', 'thursday', 'friday')) return t.routes.weekdays;
  if (are('saturday', 'sunday')) return t.routes.weekends;
  return days.map((day) => t.weekdays[day].short).join(', ');
}

/** "Leaving at 07:15 · Weekdays", or null for a route without a leaving time. */
export function formatLeaving({ startTime, weekdays }: Pick<SavedRoute, 'startTime' | 'weekdays'>) {
  if (!startTime) return null;
  return strings().routes.leaving(startTime, repeatSummary(weekdays));
}

/** How many construction sites the obstacles job found on a route's way, and how many of those are only planned. */
export type SiteCount = { total: number; planned: number };

// The obstacles job checks routes every 15 minutes (backend/supabase/migrations/20261016181000_obstacles.sql).
const FIRST_CHECK_MS = 20 * 60_000;

/** "3 construction sites on the way", or that they are still being looked for while `count` is null. */
export function sitesOnWay(count: number | null) {
  const t = strings().routes;
  if (count === null) return t.checking;
  if (count === 0) return t.noSites;
  return t.sitesOnWay(count);
}

/**
 * What the saved list says about a route's sites; `count` is undefined for a route the job found none on. A new
 * route has none until the job first checks it, so it reads as still being checked rather than clear.
 */
export function sitesSummary(route: Pick<SavedRoute, 'createdAt'>, count: SiteCount | undefined, now = Date.now()) {
  if (!count?.total) {
    // Supabase gives microseconds, which not every engine's Date parses.
    const age = now - Date.parse(route.createdAt.replace(/(\.\d{3})\d+/, '$1'));
    return age < FIRST_CHECK_MS ? strings().routes.checkingNew : sitesOnWay(0);
  }
  const t = strings().routes;
  const planned = !count.planned ? '' : count.planned < count.total ? t.somePlanned(count.planned) : count.total === 1 ? t.onePlanned : t.allPlanned;
  return sitesOnWay(count.total) + planned;
}

/** Blank stops are ignored. */
function isFilled(place: PlaceDraft) {
  return place.label.trim() !== '';
}

function placeError(place: PlaceDraft, missing: string) {
  const label = place.label.trim();
  if (!label) return missing;
  if (label.length > MAX_LOCATION_LENGTH) return strings().routes.placeTooLong(MAX_LOCATION_LENGTH);
  if (!place.coordinate) return strings().routes.pickPlace;
}
