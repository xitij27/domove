export const TRANSPORT_MODES = {
  pedestrian: 'Pedestrian',
  bike: 'Bicycle',
  car: 'Car',
} as const;

export type TransportMode = keyof typeof TRANSPORT_MODES;

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_SHORT_LABELS: Record<Weekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};
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
  /** "HH:MM" when the user leaves; without weekdays or a date it means today. */
  startTime: string | null;
  /** "YYYY-MM-DD" of a single trip; always comes with a startTime. */
  startDate: string | null;
  /** Empty means the route runs once; otherwise it repeats on these days. */
  weekdays: Weekday[];
  waypoints: RouteWaypoint[];
  createdAt: string;
};

/** A place being typed; it gets a coordinate only when picked from the suggestions. */
export type PlaceDraft = { label: string; coordinate: Coordinate | null };
export type Place = { label: string; coordinate: Coordinate };

export type RouteDraft = {
  start: PlaceDraft;
  destination: PlaceDraft;
  mode: TransportMode | '';
  waypoints: PlaceDraft[];
  /** "HH:MM", or empty for no time. */
  startTime: string;
  /** "YYYY-MM-DD", or empty for today; needs a startTime. */
  startDate: string;
  /** Days the route repeats on; needs a startTime and no startDate. */
  weekdays: Weekday[];
};

export const MAX_LOCATION_LENGTH = 200;
// openrouteservice takes 50 points, start and destination included
export const MAX_WAYPOINTS = 48;
export type RouteErrors = Partial<Record<'start' | 'destination' | 'mode' | 'waypoints' | 'startTime' | 'weekdays', string>>;

export function validateRoute(draft: RouteDraft): RouteErrors {
  const errors: RouteErrors = {};
  const start = placeError(draft.start, 'Enter a starting location.');
  if (start) errors.start = start;
  const destination = placeError(draft.destination, 'Enter a final destination.');
  if (destination) errors.destination = destination;
  if (!Object.hasOwn(TRANSPORT_MODES, draft.mode)) errors.mode = 'Select a transportation mode.';
  const stops = draft.waypoints.filter(isFilled);
  if (draft.waypoints.length > MAX_WAYPOINTS) errors.waypoints = `Use no more than ${MAX_WAYPOINTS} intermediate stops.`;
  else if (stops.some((stop) => stop.label.trim().length > MAX_LOCATION_LENGTH)) {
    errors.waypoints = 'Use 200 characters or fewer for each stop.';
  } else if (stops.some((stop) => !stop.coordinate)) errors.waypoints = 'Pick each stop from the suggestions.';
  const time = draft.startTime.trim();
  const day = draft.startDate.trim();
  if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) errors.startTime = 'Use a leaving time like 08:30.';
  else if (day && !parseDay(day)) errors.startTime = 'Use a leaving date like 2026-10-16.';
  else if (day && !time) errors.startTime = 'Pick a time for the leaving date.';
  const days = draft.weekdays;
  if (days.some((d) => !Object.hasOwn(WEEKDAY_SHORT_LABELS, d))) {
    errors.weekdays = 'Select valid weekdays.';
  } else if (new Set(days).size !== days.length) {
    errors.weekdays = 'Select each weekday only once.';
  } else if (days.length > 0 && !time) {
    errors.weekdays = 'Select a leaving time for the selected days.';
  } else if (days.length > 0 && day) {
    errors.weekdays = 'Pick a leaving date or weekdays, not both.';
  }
  return errors;
}

export function normalizeRoute(draft: RouteDraft): {
  start: Place; destination: Place; mode: TransportMode; waypoints: Place[]; startTime: string | null; startDate: string | null; weekdays: Weekday[];
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
    startDate: draft.startDate.trim() || null,
    weekdays: [...draft.weekdays],
  };
}

/** "YYYY-MM-DD" as a local calendar day (not UTC midnight), or null if there is no such day. */
export function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = match.slice(1).map(Number);
  const parsed = new Date(year, month - 1, date);
  // Date rolls 2026-02-30 over into March
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === date ? parsed : null;
}

/** A short local day such as "Fri, 16 Oct". */
export function formatDay(day: string) {
  return parseDay(day)?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) ?? day;
}

/** Short labels for the selected days, in calendar order (Mon … Sun). */
export function formatWeekdays(days: Weekday[]): string {
  return WEEKDAYS.filter((day) => days.includes(day))
    .map((day) => WEEKDAY_SHORT_LABELS[day])
    .join(' · ');
}

/** Blank stops are ignored. */
function isFilled(place: PlaceDraft) {
  return place.label.trim() !== '';
}

function placeError(place: PlaceDraft, missing: string) {
  const label = place.label.trim();
  if (!label) return missing;
  if (label.length > MAX_LOCATION_LENGTH) return 'Use 200 characters or fewer.';
  if (!place.coordinate) return 'Pick a place from the suggestions.';
}
