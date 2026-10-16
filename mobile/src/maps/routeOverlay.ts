import type { Coordinate, RouteLocation } from '../routes/model';
import type { MapTheme } from '../theme';

/** A saved route drawn over the sites: the path to follow and the places on it. */
export type RouteOverlay = { path: Coordinate[]; start: RouteLocation; stops: RouteLocation[]; destination: RouteLocation };

/** Screen space kept clear around a route brought into view, for the controls that float over the map. */
export type RoutePadding = { top: number; right: number; bottom: number; left: number };

// Clear of the sites' red and yellow. Google tints its pins by hue alone, so each differs in hue.
export const STOP_COLORS = { start: '#2e7d32', stop: '#00838f', destination: '#6a1b9a' } as const;
export const LINE_COLORS: Record<MapTheme, string> = { day: '#1a73e8', night: '#8ab4f8' };
// Outlines the line against roads of a similar colour.
export const CASING_COLORS: Record<MapTheme, string> = { day: '#ffffff', night: '#0e131b' };

/** Every point that should be in view. */
export function routePoints(route: RouteOverlay): Coordinate[] {
  return [...route.path, route.start.coordinate, ...route.stops.map((stop) => stop.coordinate), route.destination.coordinate];
}
