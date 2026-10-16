import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { RoutesRepository } from './api';
import type { SavedRoute } from './model';
import { obstacleSummary, useRouteView } from './routeView';
import type { Site } from '../sites';

const at = (latitude: number, longitude: number) => ({ latitude, longitude });
const route: SavedRoute = {
  id: '1', name: 'Station → Park', mode: 'bike', startTime: null, weekdays: [], createdAt: '2026-10-16T12:00:00Z',
  start: { label: 'Station', coordinate: at(51.51, 7.46) }, destination: { label: 'Park', coordinate: at(51.52, 7.48) },
  waypoints: [{ id: 'w1', label: 'Cafe', sequence: 0, coordinate: at(51.515, 7.47) }],
};
const site: Site = { id: 's1', status: 'current', coordinate: at(51.513, 7.465), title: 'Road works', owner: '', period: '', district: '' };
const routed = [at(51.51, 7.46), at(51.511, 7.462), at(51.52, 7.48)];

const routerAnswer = {
  ok: true, status: 200,
  json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: routed.map((p) => [p.longitude, p.latitude]) } }] }),
};
const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset().mockResolvedValue(routerAnswer);
});
afterAll(() => { globalThis.fetch = originalFetch; });

function repo(listObstacles: RoutesRepository['listObstacles']): RoutesRepository {
  return { list: jest.fn(), create: jest.fn(), delete: jest.fn(), listObstacles };
}

test('shows nothing without a route', async () => {
  const { result } = await renderHook(() => useRouteView(null, repo(jest.fn())));
  expect(result.current).toBeNull();
});

test('draws a straight line until the router answers, then the routed line and the sites on it', async () => {
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => { answer = resolve; });
  fetchMock.mockImplementation(async () => { await answered; return routerAnswer; });
  const repository = repo(jest.fn(async () => {
    await answered;
    return [
      { siteId: 's1', distanceMeters: 0, detectedAt: '2026-10-16T12:00:00Z', site },
      { siteId: 'gone', distanceMeters: 5, detectedAt: '2026-10-16T12:00:00Z', site: null },
    ];
  }));
  const { result } = await renderHook(() => useRouteView(route, repository));
  expect(result.current).toMatchObject({ path: [at(51.51, 7.46), at(51.515, 7.47), at(51.52, 7.48)], sites: null, error: null });
  expect(result.current!.places.map((place) => place.label)).toEqual(['Station', 'Cafe', 'Park']);
  expect(obstacleSummary(result.current!)).toBe('Checking for construction sites…');
  await act(async () => answer());
  await waitFor(() => expect(result.current).toMatchObject({ path: routed, sites: [site] }));
  expect(repository.listObstacles).toHaveBeenCalledWith('1');
  expect(obstacleSummary(result.current!)).toBe('1 construction site on the way.');
});

test('keeps the straight line when routing fails and says when the sites cannot be loaded', async () => {
  fetchMock.mockRejectedValue(new Error('offline'));
  const repository = repo(jest.fn(async () => { throw new Error('Backend down'); }));
  const { result } = await renderHook(() => useRouteView(route, repository));
  await waitFor(() => expect(result.current?.error).toBe('Backend down'));
  expect(result.current!.path).toHaveLength(3);
  expect(obstacleSummary(result.current!)).toBe('Backend down');
});

test('a newly shown route never shows the previous route\'s sites', async () => {
  const other: SavedRoute = { ...route, id: '2' };
  let answer!: () => void;
  const repository = repo(jest.fn(async (id: string) => {
    if (id === '1') return [{ siteId: 's1', distanceMeters: 0, detectedAt: '', site }];
    await new Promise<void>((resolve) => { answer = resolve; });
    return [];
  }));
  const { result, rerender } = await renderHook(({ shown }: { shown: SavedRoute }) => useRouteView(shown, repository), { initialProps: { shown: route } });
  await waitFor(() => expect(result.current?.sites).toEqual([site]));
  await rerender({ shown: other });
  expect(result.current?.sites).toBeNull();
  await act(async () => answer());
  await waitFor(() => expect(result.current?.sites).toEqual([]));
  expect(obstacleSummary(result.current!)).toBe('No construction sites on the way.');
});
