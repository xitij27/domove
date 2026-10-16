export const TRANSPORT_MODES = {
  pedestrian: 'Pedestrian',
  bike: 'Bicycle',
  car: 'Car',
} as const;

export type TransportMode = keyof typeof TRANSPORT_MODES;
export type Coordinate = { latitude: number; longitude: number };
export type RouteLocation = { label: string; coordinate: Coordinate | null };
export type RouteWaypoint = RouteLocation & { id: string; sequence: number };

/** Coordinates stay null until a location is resolved by a consuming feature. */
export type SavedRoute = {
  id: string;
  name: string;
  start: RouteLocation;
  destination: RouteLocation;
  mode: TransportMode;
  waypoints: RouteWaypoint[];
  createdAt: string;
};

export type RouteDraft = {
  start: string;
  destination: string;
  mode: TransportMode | '';
  waypoints: string[];
};

export const MAX_LOCATION_LENGTH = 200;
export const MAX_WAYPOINTS = 50;
export type RouteErrors = Partial<Record<'start' | 'destination' | 'mode' | 'waypoints', string>>;

export function validateRoute(draft: RouteDraft): RouteErrors {
  const errors: RouteErrors = {};
  if (!draft.start.trim()) errors.start = 'Enter a starting location.';
  else if (draft.start.trim().length > MAX_LOCATION_LENGTH) errors.start = 'Use 200 characters or fewer.';
  if (!draft.destination.trim()) errors.destination = 'Enter a final destination.';
  else if (draft.destination.trim().length > MAX_LOCATION_LENGTH) errors.destination = 'Use 200 characters or fewer.';
  if (!Object.hasOwn(TRANSPORT_MODES, draft.mode)) errors.mode = 'Select a transportation mode.';
  if (draft.waypoints.length > MAX_WAYPOINTS) errors.waypoints = 'Use no more than 50 intermediate stops.';
  else if (draft.waypoints.some((label) => label.trim().length > MAX_LOCATION_LENGTH)) {
    errors.waypoints = 'Use 200 characters or fewer for each stop.';
  }
  return errors;
}

export function normalizeRoute(draft: RouteDraft): RouteDraft & { mode: TransportMode } {
  const errors = validateRoute(draft);
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
  return {
    start: draft.start.trim(),
    destination: draft.destination.trim(),
    mode: draft.mode as TransportMode,
    waypoints: draft.waypoints.map((label) => label.trim()).filter(Boolean),
  };
}
