import type { Coordinate, RouteLocation } from '../routes/model';
import type { MapTheme } from '../theme';

/** A saved route drawn over the sites: the path to follow, other ways to pick, and the places on them. */
export type RouteOverlay = {
  path: Coordinate[];
  /** Drawn in grey under the path; tapping one picks it. */
  alternatives: Coordinate[][];
  start: RouteLocation;
  stops: RouteLocation[];
  destination: RouteLocation;
  /** Every point that should be in view. A new array brings them into view again; picking another way keeps it. */
  fit: Coordinate[];
};

/** Screen space kept clear around a route brought into view, for the controls that float over the map. */
export type RoutePadding = { top: number; right: number; bottom: number; left: number };

// Clear of the sites' red and yellow. Google tints its pins by hue alone, so each differs in hue.
export const STOP_COLORS = { start: '#2e7d32', stop: '#00838f', destination: '#6a1b9a' } as const;
export const LINE_COLORS: Record<MapTheme, string> = { day: '#1a73e8', night: '#8ab4f8' };
// Outlines the line against roads of a similar colour.
export const CASING_COLORS: Record<MapTheme, string> = { day: '#ffffff', night: '#0e131b' };
// The other ways, greyed as Google Maps does: in sight on both maps, but quieter than the way picked.
export const ALTERNATIVE_COLORS: Record<MapTheme, string> = { day: '#8d97a8', night: '#6f7a8c' };

/** Every point of the paths and places given. */
export function routePoints(paths: Coordinate[][], places: RouteLocation[]): Coordinate[] {
  return [...paths.flat(), ...places.map((place) => place.coordinate)];
}
