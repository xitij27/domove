export const TRANSPORT_MODES = {
  pedestrian: 'Pedestrian',
  bike: 'Bicycle',
  car: 'Car',
} as const;

export type TransportMode = keyof typeof TRANSPORT_MODES;
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
  } else if (stops.some((stop) => !stop.coordinate)) errors.waypoints = 'Pick each stop from the suggestions.';
  const time = draft.startTime.trim();
  if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) errors.startTime = 'Enter a time like 08:30, or leave it empty.';
  return errors;
}

export function normalizeRoute(draft: RouteDraft): { start: Place; destination: Place; mode: TransportMode; waypoints: Place[]; startTime: string | null } {
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
  };
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
