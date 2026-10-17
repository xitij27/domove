import { createRoutesRepository } from './api';
import type { RouteDraft, SavedRoute } from './model';

const id = '12345678-1234-1234-1234-123456789abc';
const at = { latitude: 51.51, longitude: 7.46 };
const route: SavedRoute = { id, name: 'Station → Park', start: { label: 'Station', coordinate: at }, destination: { label: 'Park', coordinate: at }, mode: 'bike', startTime: '07:45', weekdays: ['monday', 'friday'], waypoints: [], createdAt: '2026-10-16T12:00:00.123456+00:00' };
const draft: RouteDraft = {
  start: { label: ' Station ', coordinate: at }, destination: { label: 'Park ', coordinate: at }, mode: 'bike',
  waypoints: [{ label: ' Cafe ', coordinate: at }, { label: ' ', coordinate: null }, { label: 'Library', coordinate: at }], startTime: '07:45', weekdays: ['friday', 'monday'],
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
      p_waypoints: [{ label: 'Cafe', coordinate: at }, { label: 'Library', coordinate: at }], p_start_time: '07:45', p_weekdays: ['monday', 'friday'],
    }),
  }));
});

test('updates a route through its own RPC with the same arguments', async () => {
  fetchMock.mockResolvedValue(response(route));
  await expect(repository.update(id, draft)).resolves.toEqual(route);
  expect(newId).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/rpc/update_saved_route', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      p_id: id, p_start: { label: 'Station', coordinate: at }, p_finish: { label: 'Park', coordinate: at }, p_modality: 'bike',
      p_waypoints: [{ label: 'Cafe', coordinate: at }, { label: 'Library', coordinate: at }], p_start_time: '07:45', p_weekdays: ['monday', 'friday'],
    }),
  }));
  await expect(repository.update('not-a-uuid', draft)).rejects.toThrow('invalid ID');
  fetchMock.mockResolvedValue(response(null));
  await expect(repository.update(id, draft)).rejects.toThrow('Could not confirm the changes');
});

test('a route that does not repeat sends no days', async () => {
  fetchMock.mockResolvedValue(response({ ...route, weekdays: [] }));
  await repository.create({ ...draft, weekdays: [] });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ p_start_time: '07:45', p_weekdays: [] });
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

test('lists the construction sites on the way of one route, skipping malformed rows', async () => {
  fetchMock.mockResolvedValueOnce(response([{ construction_site_id: 'site-1' }, { construction_site_id: 7 }, null, { construction_site_id: 'site-2' }]));
  await expect(repository.obstacleSiteIds(id)).resolves.toEqual(['site-1', 'site-2']);
  expect(fetchMock).toHaveBeenCalledWith(`https://example.supabase.co/rest/v1/obstacles?route_id=eq.${id}&select=construction_site_id`, expect.anything());
  await expect(repository.obstacleSiteIds('invalid&id=not.is.null')).rejects.toThrow('invalid ID');
  fetchMock.mockResolvedValueOnce(response({ unexpected: true }));
  await expect(repository.obstacleSiteIds(id)).rejects.toThrow('invalid list');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('counts the construction sites on the way of every route in pages, skipping malformed rows', async () => {
  const full = Array.from({ length: 100 }, (_, n) => ({ id: `o-${String(n).padStart(3, '0')}`, route_id: 'a', construction_sites: { status: n < 2 ? 'planned' : 'current' } }));
  fetchMock
    .mockResolvedValueOnce(response(full))
    .mockResolvedValueOnce(response([{ id: 'o-100', route_id: 'b', construction_sites: { status: 'current' } }, null, { id: 'o-101', route_id: 7 }]));
  const counts = await repository.siteCounts();
  expect(Object.fromEntries(counts)).toEqual({ a: { total: 100, planned: 2 }, b: { total: 1, planned: 0 } });
  expect(fetchMock.mock.calls[0][0]).toBe('https://example.supabase.co/rest/v1/obstacles?select=id,route_id,construction_sites(status)&order=id&limit=100');
  expect(fetchMock.mock.calls[1][0]).toBe('https://example.supabase.co/rest/v1/obstacles?select=id,route_id,construction_sites(status)&order=id&limit=100&id=gt.o-099');
  fetchMock.mockResolvedValueOnce(response({ unexpected: true }));
  await expect(repository.siteCounts()).rejects.toThrow('invalid list');
});

test('shows the server validation message', async () => {
  fetchMock.mockResolvedValueOnce(response({ code: '22023', message: 'Final destination must contain 1 to 200 characters.' }, 400));
  await expect(repository.create(draft)).rejects.toThrow('Final destination must contain 1 to 200 characters.');
  fetchMock.mockResolvedValueOnce(response({ code: '42501', message: 'permission denied for table routes' }, 401));
  await expect(repository.delete(id)).rejects.toThrow('HTTP 401');
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
