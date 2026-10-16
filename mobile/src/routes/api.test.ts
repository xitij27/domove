import { createRoutesRepository } from './api';
import type { RouteDraft, SavedRoute } from './model';

const id = '12345678-1234-1234-1234-123456789abc';
const at = { latitude: 51.51, longitude: 7.46 };
const route: SavedRoute = { id, name: 'Station → Park', start: { label: 'Station', coordinate: at }, destination: { label: 'Park', coordinate: at }, mode: 'bike', startTime: '07:45', weekdays: ['monday', 'wednesday'], waypoints: [], createdAt: '2026-10-16T12:00:00.123456+00:00' };
const draft: RouteDraft = {
  start: { label: ' Station ', coordinate: at }, destination: { label: 'Park ', coordinate: at }, mode: 'bike',
  waypoints: [{ label: ' Cafe ', coordinate: at }, { label: ' ', coordinate: null }, { label: 'Library', coordinate: at }], startTime: '07:45', weekdays: ['monday', 'wednesday'],
};
const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
const newId = jest.fn(() => id);
const repository = createRoutesRepository('https://example.supabase.co/', 'public-test-key', newId);
const response = (value: unknown, status = 200) => ({ ok: status < 400, status, text: async () => value === undefined ? '' : JSON.stringify(value) });
const sentId = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body).p_id;

beforeEach(() => { globalThis.fetch = fetchMock; fetchMock.mockReset(); newId.mockClear(); });
afterEach(() => { jest.useRealTimers(); });
afterAll(() => { globalThis.fetch = originalFetch; });

test('creates a route and its ordered stops in one atomic RPC', async () => {
  fetchMock.mockResolvedValue(response(route));
  await expect(repository.create(draft)).resolves.toEqual(route);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/rpc/create_saved_route', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ apikey: 'public-test-key' }),
    body: JSON.stringify({
      p_id: id, p_start: { label: 'Station', coordinate: at }, p_finish: { label: 'Park', coordinate: at }, p_modality: 'bike',
      p_waypoints: [{ label: 'Cafe', coordinate: at }, { label: 'Library', coordinate: at }], p_start_time: '07:45',
      p_weekdays: ['monday', 'wednesday'],
    }),
  }));
});

test('retrying a failed save reuses its ID, so the server cannot save it twice', async () => {
  const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
  const fresh = createRoutesRepository('https://example.supabase.co', 'public-test-key', () => ids.shift()!);
  fetchMock
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockImplementation(async (_url: string, init: RequestInit) => response({ ...route, id: JSON.parse(init.body as string).p_id }));
  await expect(fresh.create(draft)).rejects.toThrow('Check your connection');
  await fresh.create(draft);
  expect(sentId(1)).toBe(sentId(0));
  await fresh.create(draft);
  expect(sentId(2)).not.toBe(sentId(1));
});

test('a response without the saved route is not treated as saved', async () => {
  fetchMock.mockResolvedValueOnce(response(null));
  await expect(repository.create(draft)).rejects.toThrow('Could not confirm');
});

test('a changed draft is a new save with a new ID', async () => {
  const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
  const fresh = createRoutesRepository('https://example.supabase.co', 'public-test-key', () => ids.shift()!);
  fetchMock.mockResolvedValueOnce(response(null, 500)).mockResolvedValueOnce(response(null, 500));
  await expect(fresh.create(draft)).rejects.toThrow('HTTP 500');
  await expect(fresh.create({ ...draft, destination: { label: 'Library', coordinate: at } })).rejects.toThrow('HTTP 500');
  expect(sentId(1)).not.toBe(sentId(0));
});

test('invalid forms never send requests', async () => {
  const blank = { label: '', coordinate: null };
  await expect(repository.create({ start: blank, destination: blank, mode: '', waypoints: [], startTime: '', weekdays: [] })).rejects.toThrow('starting location');
  await expect(repository.create({ ...draft, start: { label: 'Station', coordinate: null } })).rejects.toThrow('Pick a place');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a fresh repository reads persisted routes and continues after the last route of each full page', async () => {
  fetchMock.mockResolvedValueOnce(response(Array(100).fill({ route }))).mockResolvedValueOnce(response([{ route: { ...route, id: 'last' } }]));
  const fresh = createRoutesRepository('https://example.supabase.co', 'public-test-key');
  expect(await fresh.list()).toHaveLength(101);
  expect(fetchMock.mock.calls[0][0]).not.toContain('or=');
  expect(decodeURIComponent(fetchMock.mock.calls[1][0])).toContain(
    `&or=(created_at.lt."${route.createdAt}",and(created_at.eq."${route.createdAt}",id.lt.${id}))`,
  );
});

test('deletes only the selected route, including successful repeated deletes', async () => {
  fetchMock.mockResolvedValue(response(undefined, 204));
  await repository.delete(id);
  expect(fetchMock).toHaveBeenCalledWith(`https://example.supabase.co/rest/v1/routes?id=eq.${id}`, expect.objectContaining({ method: 'DELETE' }));
  await expect(repository.delete('invalid&id=not.is.null')).rejects.toThrow('invalid ID');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('shows the server validation message', async () => {
  fetchMock.mockResolvedValueOnce(response({ code: '22023', message: 'Final destination must contain 1 to 200 characters.' }, 400));
  await expect(repository.create(draft)).rejects.toThrow('Final destination must contain 1 to 200 characters.');
  fetchMock.mockResolvedValueOnce(response({ code: '42501', message: 'permission denied for table routes' }, 401));
  await expect(repository.delete(id)).rejects.toThrow('HTTP 401');
});

test('lists obstacles with their construction sites', async () => {
  fetchMock
    .mockResolvedValueOnce(response([
      { construction_site_id: 'site-1', distance_meters: 0, detected_at: '2026-10-16T12:00:00Z' },
      { construction_site_id: 'site-2', distance_meters: 22.4, detected_at: '2026-10-16T12:00:00Z' },
    ]))
    .mockResolvedValueOnce(response([
      { id: 'site-1', status: 'current', title: 'Road works', owner: null, period: 'Mon–Fri', district: 'Mitte', latitude: 51.51, longitude: 7.47 },
      { id: 'site-2', status: 'planned', title: 'Bridge', owner: null, period: null, district: null, latitude: 51.52, longitude: 7.48 },
    ]));
  await expect(repository.listObstacles(id)).resolves.toEqual([
    { siteId: 'site-1', distanceMeters: 0, detectedAt: '2026-10-16T12:00:00Z', site: expect.objectContaining({ id: 'site-1', title: 'Road works' }) },
    { siteId: 'site-2', distanceMeters: 22.4, detectedAt: '2026-10-16T12:00:00Z', site: expect.objectContaining({ id: 'site-2', title: 'Bridge' }) },
  ]);
  expect(decodeURIComponent(fetchMock.mock.calls[0][0])).toContain(`obstacles?route_id=eq.${id}`);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('an obstacle whose site left the feed keeps a null site', async () => {
  fetchMock
    .mockResolvedValueOnce(response([{ construction_site_id: 'gone', distance_meters: null, detected_at: '2026-10-16T12:00:00Z' }]))
    .mockResolvedValueOnce(response([]));
  await expect(repository.listObstacles(id)).resolves.toEqual([
    { siteId: 'gone', distanceMeters: null, detectedAt: '2026-10-16T12:00:00Z', site: null },
  ]);
});

test('an empty obstacle list needs no site request and rejects bad IDs', async () => {
  fetchMock.mockResolvedValueOnce(response([]));
  await expect(repository.listObstacles(id)).resolves.toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(repository.listObstacles('invalid&id=not.is.null')).rejects.toThrow('invalid ID');
});

test('gives up on a request that takes too long', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const pending = expect(repository.list()).rejects.toThrow('took too long');
  await jest.advanceTimersByTimeAsync(15_000);
  await pending;
});

test('explains network, backend, configuration and malformed-response failures', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Network error'));
  await expect(repository.list()).rejects.toThrow('Check your connection');
  fetchMock.mockResolvedValueOnce(response(null, 500));
  await expect(repository.delete(id)).rejects.toThrow('HTTP 500');
  fetchMock.mockResolvedValueOnce({ ok: false, status: 502, text: async () => '<html>Bad gateway</html>' });
  await expect(repository.list()).rejects.toThrow('HTTP 502');
  fetchMock.mockResolvedValueOnce(response(null, 404));
  await expect(repository.list()).rejects.toThrow('not available right now');
  await expect(createRoutesRepository('', '').list()).rejects.toThrow('backend connection');
  fetchMock.mockResolvedValueOnce(response({ unexpected: true }));
  await expect(repository.list()).rejects.toThrow('invalid route list');
});
