import type { LonLat } from './geo';
import { createRouters, decodePolyline, errorCode } from './valhalla';

/** Google's polyline encoding, the other way round, so the answers below can carry any line. */
function encode(points: LonLat[], precision = 6): string {
  const factor = 10 ** precision;
  let out = '';
  let lat = 0;
  let lon = 0;
  const put = (value: number) => {
    let n = value < 0 ? ~(value << 1) : value << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [x, y] of points) {
    const la = Math.round(y * factor);
    const lo = Math.round(x * factor);
    put(la - lat);
    put(lo - lon);
    lat = la;
    lon = lo;
  }
  return out;
}

const response = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });
const trip = (legs: LonLat[][], time = 600, length = 4.2) => ({ trip: { legs: legs.map((l) => ({ shape: encode(l) })), summary: { time, length } } });

const start: LonLat = [7.46, 51.51];
const stop: LonLat = [7.47, 51.515];
const end: LonLat = [7.48, 51.52];

test('decodes Google\'s example polyline', () => {
  expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
});

test('asks for the trip through every place, leaving out areas only when there are some', async () => {
  const fetchMock = jest.fn(async () => response(trip([[start, end]])));
  const router = createRouters(fetchMock as unknown as typeof fetch, 0);
  const cut: LonLat[] = [[7.465, 51.512], [7.466, 51.512], [7.466, 51.513], [7.465, 51.512]];
  await router('bike')([start, end], []);
  await router('car')([start, end], [cut]);
  const bodies = fetchMock.mock.calls.map((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string));
  expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://valhalla1.openstreetmap.de/route');
  expect(bodies[0]).toEqual({ locations: [{ lon: 7.46, lat: 51.51 }, { lon: 7.48, lat: 51.52 }], costing: 'bicycle', directions_type: 'none', units: 'kilometers' });
  expect(bodies[1]).toMatchObject({ costing: 'auto', exclude_polygons: [cut] });
});

test('joins the legs between stops into one line, with the trip\'s time and length', async () => {
  const fetchMock = jest.fn(async () => response(trip([[start, stop], [stop, end]], 900, 3.5)));
  const leg = await createRouters(fetchMock as unknown as typeof fetch, 0)('pedestrian')([start, stop, end], []);
  expect(leg.line).toEqual([start, stop, end]);
  expect(leg.seconds).toBe(900);
  expect(leg.meters).toBe(3500);
});

test('asks the same thing only once', async () => {
  const fetchMock = jest.fn(async () => response(trip([[start, end]])));
  const route = createRouters(fetchMock as unknown as typeof fetch, 0)('car');
  await route([start, end], []);
  await route([start, end], []);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('passes Valhalla\'s error code on, so the planner can tell "no way" from a failure', async () => {
  const fetchMock = jest.fn(async () => response({ error_code: 442, error: 'No path could be found for input' }, 400));
  const failure = await createRouters(fetchMock as unknown as typeof fetch, 0)('car')([start, end], []).catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe('Routing server: No path could be found for input');
  expect(errorCode(failure)).toBe(442);
});

test('an unreachable server or an odd answer is a plain failure', async () => {
  const offline = jest.fn(async () => { throw new TypeError('Network request failed'); });
  const failure = await createRouters(offline as unknown as typeof fetch, 0)('car')([start, end], []).catch((e: unknown) => e);
  expect((failure as Error).message).toBe('Could not reach the routing server.');
  expect(errorCode(failure)).toBeNull();
  const odd = jest.fn(async () => response({ trip: { legs: [] } }));
  await expect(createRouters(odd as unknown as typeof fetch, 0)('car')([start, end], [])).rejects.toThrow('Unexpected answer');
});

test('a request whose route was closed while it waited is never sent', async () => {
  const fetchMock = jest.fn(async () => response(trip([[start, end]])));
  const controller = new AbortController();
  controller.abort();
  await expect(createRouters(fetchMock as unknown as typeof fetch, 0)('car')([start, end], [], controller.signal)).rejects.toThrow('Stopped.');
  expect(fetchMock).not.toHaveBeenCalled();
});
