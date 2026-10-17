import { createRatingsApi } from './api';
import { crossingRouteRow, schoolDayRow } from './testRatings';

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
const api = createRatingsApi('https://example.supabase.co/', 'public-test-key');
const response = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });

beforeEach(() => { globalThis.fetch = fetchMock; fetchMock.mockReset(); });
afterAll(() => { globalThis.fetch = originalFetch; });

test('asks for one site\'s score for a mode at a time', async () => {
  fetchMock.mockResolvedValue(response([schoolDayRow]));
  const rating = await api.site('s1', 'car', new Date('2026-11-02T07:00:00Z'));
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/rpc/site_ratings', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ apikey: 'public-test-key' }),
    body: JSON.stringify({ p_modality: 'car', p_at: '2026-11-02T07:00:00.000Z', p_site_ids: ['s1'] }),
  }));
  expect(rating).toMatchObject({ siteId: 's1', rating: 9 });
});

test('a site that left the feed has no score', async () => {
  fetchMock.mockResolvedValue(response([]));
  await expect(api.site('gone', 'bike')).resolves.toBeNull();
});

test('asks for a route\'s scores by its ID', async () => {
  fetchMock.mockResolvedValue(response([crossingRouteRow]));
  const [rating] = await api.route('r1');
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/rpc/route_site_ratings',
    expect.objectContaining({ body: JSON.stringify({ p_route_id: 'r1' }) }));
  expect(rating).toMatchObject({ routeUse: 'crosses', effectiveRating: 3 });
});

test('reads the weights by key', async () => {
  fetchMock.mockResolvedValue(response([{ key: 'school_radius_m', value: 150 }, { key: 'broken', value: 'x' }]));
  await expect(api.weights()).resolves.toEqual({ school_radius_m: 150 });
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/rating_weights?select=key,value', expect.objectContaining({ method: 'GET' }));
});

test('a database without the ratings says so', async () => {
  fetchMock.mockResolvedValue(response({ message: 'Could not find the function' }, 404));
  await expect(api.site('s1', 'car')).rejects.toThrow('Impact scores are not available right now (HTTP 404).');
});
