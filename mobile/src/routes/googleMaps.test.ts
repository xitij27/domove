import type { SavedRoute } from './model';
import { googleMapsDirectionsUrl } from './googleMaps';
import { at, leg } from '../detours/testPlan';

const place = ([longitude, latitude]: [number, number]) => ({ label: null, coordinate: { latitude, longitude } });
const route = (stops: [number, number][] = [], mode: SavedRoute['mode'] = 'car'): SavedRoute => ({
  id: '12345678-1234-1234-1234-123456789abc',
  name: 'Home → Work',
  start: place(at(0, 0)),
  destination: place(at(2000, 0)),
  mode,
  startTime: null,
  weekdays: [],
  waypoints: stops.map((point, index) => ({ id: String(index), sequence: index, ...place(point) })),
  createdAt: '2026-10-16T12:00:00Z',
});

test('opens the original route in Google Maps when no detour is needed', () => {
  const direct = leg(200, [0, 0], [1000, 0], [2000, 0]);
  const url = new URL(googleMapsDirectionsUrl(route([], 'pedestrian'), { ...direct, kind: 'direct', sites: [], penaltyS: 0, cost: 200, blockedBy: [] })!);
  expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
  expect(url.searchParams.get('api')).toBe('1');
  expect(url.searchParams.get('travelmode')).toBe('walking');
  expect(url.searchParams.get('waypoints')).toBeNull();
});

test('adds a point from the chosen detour so Google routes around the same obstruction', () => {
  const direct = { ...leg(200, [0, 0], [1000, 0], [2000, 0]), kind: 'direct' as const, sites: [], penaltyS: 0, cost: 200, blockedBy: [] };
  const detour = { ...leg(240, [0, 0], [500, 250], [1500, 250], [2000, 0]), kind: 'blocked' as const, sites: [], penaltyS: 0, cost: 240, blockedBy: [] };
  const url = new URL(googleMapsDirectionsUrl(route(), detour, direct)!);
  expect(url.searchParams.get('waypoints')).toMatch(/,/);
  expect(url.searchParams.get('travelmode')).toBe('driving');
});

test('preserves saved stops in order before adding detour anchors', () => {
  const first = at(500, 0);
  const second = at(1500, 0);
  const direct = { ...leg(200, [0, 0], [500, 0], [1500, 0], [2000, 0]), kind: 'direct' as const, sites: [], penaltyS: 0, cost: 200, blockedBy: [] };
  const url = new URL(googleMapsDirectionsUrl(route([first, second], 'bike'), direct)!);
  expect(url.searchParams.get('waypoints')).toBe(`${first[1]},${first[0]}|${second[1]},${second[0]}`);
  expect(url.searchParams.get('travelmode')).toBe('bicycling');
});

test('does not silently drop saved stops Google cannot carry on mobile', () => {
  const stops = [at(200, 0), at(400, 0), at(600, 0), at(800, 0)];
  expect(googleMapsDirectionsUrl(route(stops))).toBeNull();
});
