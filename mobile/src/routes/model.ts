export const TRANSPORT_MODES = {
  pedestrian: 'Pedestrian',
  bike: 'Bicycle',
  car: 'Car',
} as const;

export type TransportMode = keyof typeof TRANSPORT_MODES;

/** In the backend's weekday enum order, Monday first. */
export const WEEKDAYS = [
  { day: 'monday', name: 'Monday', short: 'Mon', letter: 'M' },
  { day: 'tuesday', name: 'Tuesday', short: 'Tue', letter: 'T' },
  { day: 'wednesday', name: 'Wednesday', short: 'Wed', letter: 'W' },
  { day: 'thursday', name: 'Thursday', short: 'Thu', letter: 'T' },
  { day: 'friday', name: 'Friday', short: 'Fri', letter: 'F' },
  { day: 'saturday', name: 'Saturday', short: 'Sat', letter: 'S' },
  { day: 'sunday', name: 'Sunday', short: 'Sun', letter: 'S' },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]['day'];
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
  } else if (stops.some((stop) => !stop.coordinate)) errors.waypoints = 'Pick each stop from the suggestions or the map.';
  const time = draft.startTime.trim();
  if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) errors.startTime = 'Use a leaving time like 08:30.';
  else if (draft.weekdays.length && !time) errors.startTime = 'Pick a time for the repeat days.';
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
    weekdays: WEEKDAYS.map(({ day }) => day).filter((day) => draft.weekdays.includes(day)),
  };
}

/** "Every day", "Weekdays", "Weekends" or the days such as "Mon, Wed, Fri"; null for no days. */
export function repeatSummary(weekdays: readonly Weekday[]) {
  const days = WEEKDAYS.filter(({ day }) => weekdays.includes(day)).map(({ short }) => short).join(', ');
  if (!days) return null;
  if (days === 'Mon, Tue, Wed, Thu, Fri, Sat, Sun') return 'Every day';
  if (days === 'Mon, Tue, Wed, Thu, Fri') return 'Weekdays';
  if (days === 'Sat, Sun') return 'Weekends';
  return days;
}

/** "Leaving at 07:15 · Weekdays", or null for a route without a leaving time. */
export function formatLeaving({ startTime, weekdays }: Pick<SavedRoute, 'startTime' | 'weekdays'>) {
  if (!startTime) return null;
  const repeat = repeatSummary(weekdays);
  return repeat ? `Leaving at ${startTime} · ${repeat}` : `Leaving at ${startTime}`;
}

/** Blank stops are ignored. */
function isFilled(place: PlaceDraft) {
  return place.label.trim() !== '';
}

function placeError(place: PlaceDraft, missing: string) {
  const label = place.label.trim();
  if (!label) return missing;
  if (label.length > MAX_LOCATION_LENGTH) return 'Use 200 characters or fewer.';
  if (!place.coordinate) return 'Pick a place from the suggestions or the map.';
}
