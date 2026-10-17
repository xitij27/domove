import { schoolDayRow } from '../ratings/testRatings';
import type { SavedRoute } from '../routes/model';
import { createDetourApi, parseAreas } from './api';
import { pointShapeDist, toXY } from './geo';

const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();
const response = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });

beforeEach(() => { globalThis.fetch = fetchMock; fetchMock.mockReset(); });
afterAll(() => { globalThis.fetch = originalFetch; });

const ring = [[7.46, 51.51], [7.461, 51.51], [7.461, 51.511], [7.46, 51.51]];
const areas = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { id: 'poly', latitude: 51.5103, longitude: 7.4607 } },
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[ring]] }, properties: { id: 'multi', latitude: 51.5103, longitude: 7.4607 } },
    { type: 'Feature', geometry: null, properties: { id: 'point', latitude: 51.52, longitude: 7.47 } },
    { type: 'Feature', geometry: null, properties: { id: 'nowhere' } },
    { type: 'Feature', geometry: null, properties: {} },
  ],
};

test('reads each site\'s area, and a 25 m circle for a site that has only a centre', () => {
  const sites = parseAreas(areas);
  expect(sites.map((s) => s.id)).toEqual(['poly', 'multi', 'point']);
  expect(sites[0].shape).toEqual(sites[1].shape);
  const centre = toXY([7.47, 51.52]);
  expect(pointShapeDist(centre, sites[2].shape)).toBe(0);
  expect(sites[2].shape.bbox[2] - centre[0]).toBeCloseTo(25);
  expect(() => parseAreas({})).toThrow('invalid construction site areas');
});

test('asks for the areas as GeoJSON, and keeps them for ten minutes', async () => {
  let now = 0;
  const api = createDetourApi('https://example.supabase.co/', 'public-test-key', () => now);
  fetchMock.mockResolvedValue(response(areas));
  await api.areas();
  await api.areas();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/construction_sites?select=id,latitude,longitude,geom',
    expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ apikey: 'public-test-key', Accept: 'application/geo+json' }) }));
  now = 10 * 60_000;
  await api.areas();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a failed download isn\'t kept', async () => {
  const api = createDetourApi('https://example.supabase.co', 'public-test-key');
  fetchMock.mockResolvedValueOnce(response({ message: 'down' }, 503)).mockResolvedValueOnce(response(areas));
  await expect(api.areas()).rejects.toThrow('HTTP 503');
  await expect(api.areas()).resolves.toHaveLength(3);
});

test('asks the server when the route is next taken, and rates the sites for its mode then', async () => {
  const api = createDetourApi('https://example.supabase.co', 'public-test-key');
  const route = { startTime: '07:15', weekdays: ['monday'], startDate: null } as unknown as SavedRoute;
  fetchMock.mockResolvedValueOnce(response('2026-11-02T06:15:00+00:00')).mockResolvedValueOnce(response([schoolDayRow]));
  const at = await api.departure(route);
  const [rating] = await api.scores('car', at, ['s1']);
  expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.supabase.co/rest/v1/rpc/route_departure',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_start_time: '07:15', p_weekdays: ['monday'], p_start_date: null }) }));
  expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.supabase.co/rest/v1/rpc/site_ratings',
    expect.objectContaining({ body: JSON.stringify({ p_modality: 'car', p_at: '2026-11-02T06:15:00+00:00', p_site_ids: ['s1'] }) }));
  expect(rating).toMatchObject({ siteId: 's1', impact: 'slowed', rating: 9 });
});

test('no sites near the trip need no scores', async () => {
  await expect(createDetourApi('https://example.supabase.co', 'public-test-key').scores('bike', '2026-11-02T06:15:00Z', [])).resolves.toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});
