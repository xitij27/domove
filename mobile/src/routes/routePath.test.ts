import { fetchRoutePath, routePathUrl, routePlaces } from './routePath';
import type { SavedRoute } from './model';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });
const route: SavedRoute = {
  id: '12345678-1234-1234-1234-123456789abc',
  name: 'Station → Park',
  start: { label: 'Station', coordinate: at(51.51, 7.46) },
  destination: { label: 'Park', coordinate: at(51.52, 7.48) },
  mode: 'bike',
  startTime: null,
  startDate: null,
  weekdays: [],
  waypoints: [
    { id: 'w2', label: 'Second', sequence: 2, coordinate: at(51.515, 7.47) },
    { id: 'w1', label: 'First', sequence: 1, coordinate: at(51.512, 7.465) },
  ],
  createdAt: '2026-10-16T12:00:00Z',
};

test('asks the bike router for start, stops in order and destination as lon,lat', () => {
  expect(routePathUrl(route)).toBe(
    'https://routing.openstreetmap.de/routed-bike/route/v1/driving/7.46,51.51;7.465,51.512;7.47,51.515;7.48,51.52?overview=full&geometries=geojson',
  );
  expect(routePathUrl({ ...route, mode: 'pedestrian' })).toContain('/routed-foot/');
});

test('routePlaces keeps stop order', () => {
  expect(routePlaces(route).map((place) => place.coordinate)).toEqual([at(51.51, 7.46), at(51.512, 7.465), at(51.515, 7.47), at(51.52, 7.48)]);
});

test('reads the routed path as latitude/longitude points', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: [[7.46, 51.51], [7.47, 51.515]] } }] }),
  })) as unknown as typeof fetch;
  await expect(fetchRoutePath(route, fetchImpl)).resolves.toEqual([at(51.51, 7.46), at(51.515, 7.47)]);
  expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('routing.openstreetmap.de'));
});

test.each([
  ['a failed router code', { code: 'NoRoute', routes: [] }],
  ['a missing geometry', { code: 'Ok', routes: [{}] }],
  ['malformed pairs', { code: 'Ok', routes: [{ geometry: { coordinates: [['7.46', '51.51']] } }] }],
])('rejects %s so the caller falls back to a straight line', async (_name, body) => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
  await expect(fetchRoutePath(route, fetchImpl)).rejects.toThrow('Could not route');
});
