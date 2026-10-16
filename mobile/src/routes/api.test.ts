import { createRoutesRepository } from './api';
import type { SavedRoute } from './model';

const id = '12345678-1234-1234-1234-123456789abc';
const route: SavedRoute = { id, name: 'Station → Park', start: { label: 'Station', coordinate: null }, destination: { label: 'Park', coordinate: null }, mode: 'bike', waypoints: [], createdAt: '2026-10-16T12:00:00Z' };
const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
const repository = createRoutesRepository('https://example.supabase.co/', 'public-test-key');
const response = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });

beforeEach(() => { globalThis.fetch = fetchMock; fetchMock.mockReset(); });
afterAll(() => { globalThis.fetch = originalFetch; });

test('creates a route and its ordered stops in one atomic RPC', async () => {
  fetchMock.mockResolvedValue(response(route));
  await expect(repository.create({ start: ' Station ', destination: 'Park ', mode: 'bike', waypoints: [' Cafe ', ' ', 'Library'] })).resolves.toEqual(route);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/rpc/create_saved_route', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ apikey: 'public-test-key' }),
    body: JSON.stringify({ p_start_label: 'Station', p_finish_label: 'Park', p_modality: 'bike', p_waypoints: ['Cafe', 'Library'] }),
  }));
});

test('invalid forms never send requests', async () => {
  await expect(repository.create({ start: '', destination: '', mode: '', waypoints: [] })).rejects.toThrow('starting location');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a fresh repository reads persisted routes and requests subsequent pages', async () => {
  fetchMock.mockResolvedValueOnce(response(Array(100).fill({ route }))).mockResolvedValueOnce(response([{ route: { ...route, id: 'last' } }]));
  const fresh = createRoutesRepository('https://example.supabase.co', 'public-test-key');
  expect(await fresh.list()).toHaveLength(101);
  expect(fetchMock.mock.calls[1][0]).toContain('offset=100');
});

test('deletes only the selected route, including successful repeated deletes', async () => {
  fetchMock.mockResolvedValue(response(null, 204));
  await repository.delete(id);
  expect(fetchMock).toHaveBeenCalledWith(`https://example.supabase.co/rest/v1/routes?id=eq.${id}`, expect.objectContaining({ method: 'DELETE' }));
  await expect(repository.delete('invalid&id=not.is.null')).rejects.toThrow('invalid ID');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('explains network, backend, configuration and malformed-response failures', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Network error'));
  await expect(repository.list()).rejects.toThrow('Check your connection');
  fetchMock.mockResolvedValueOnce(response(null, 500));
  await expect(repository.delete(id)).rejects.toThrow('HTTP 500');
  fetchMock.mockResolvedValueOnce(response(null, 404));
  await expect(repository.list()).rejects.toThrow('migration');
  await expect(createRoutesRepository('', '').list()).rejects.toThrow('backend connection');
  fetchMock.mockResolvedValueOnce(response({ unexpected: true }));
  await expect(repository.list()).rejects.toThrow('invalid route list');
});
