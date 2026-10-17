import { afterEach, describe, expect, it, vi } from 'vitest';
import { toLonLat, toXY } from '../model/geo';
import type { LonLat } from '../model/geo';
import { testSite } from '../model/testSites';
import { decodePolyline } from './polyline';
import { cutSquare, GROUPS, MAX_CUTS, penaltyFor, planDetour, sitesAlongPath } from './valhalla';

const O = toXY([7.4653, 51.5136]);
const at = (x: number, y: number): LonLat => toLonLat([O[0] + x, O[1] + y]);
// Valhalla's shape encoding (6 decimals), to fake its answers.
const encode = (pts: LonLat[]) => {
  let out = '';
  let [plat, plon] = [0, 0];
  const put = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [lon, lat] of pts) {
    const [ilat, ilon] = [Math.round(lat * 1e6), Math.round(lon * 1e6)];
    put(ilat - plat);
    put(ilon - plon);
    [plat, plon] = [ilat, ilon];
  }
  return out;
};

describe('decodePolyline', () => {
  it("decodes Google's reference example", () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
  it('round-trips Dortmund coordinates at 6 decimals', () => {
    const pts: LonLat[] = [[7.465312, 51.513621], [7.4601, 51.5098]];
    expect(decodePolyline(encode(pts))).toEqual(pts);
  });
});

describe('cutSquare', () => {
  it("stays inside the public server's limits", () => {
    const ring = cutSquare([7.4653, 51.5136]);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    const [a, b] = [toXY(ring[0]), toXY(ring[1])];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(30, 6);
    expect(MAX_CUTS * 5).toBeLessThanOrEqual(100);
    expect(MAX_CUTS * 4 * 30).toBeLessThanOrEqual(10_000);
  });
});

describe('sitesAlongPath', () => {
  const site = testSite('s', 0, 0, 0, 10); // a 20 m square at (0..20, 0..20)
  it('counts a path that runs through a site, cut in its middle', () => {
    const [hit] = sitesAlongPath([at(-100, 10), at(200, 10)], [site]);
    expect(hit.along).toBeCloseTo(30, 0); // 20 m plus 5 m reach on both sides
    const mid = toXY(hit.mid);
    expect(mid[0] - O[0]).toBeCloseTo(10, 0);
  });
  it('ignores a path that only clips a corner', () => {
    expect(sitesAlongPath([at(-50, 50), at(50, -50)], [site])).toEqual([]);
  });

  it('ignores a path crossing a 10 m-wide side-street site at the junction', () => {
    const side = testSite('side', 0, 0, 0, 10);
    side.shape = { polygons: [[[[O[0], O[1]], [O[0] + 10, O[1]], [O[0] + 10, O[1] + 100], [O[0], O[1] + 100], [O[0], O[1]]]]], bbox: [O[0], O[1], O[0] + 10, O[1] + 100] };
    expect(sitesAlongPath([at(-100, 3), at(100, 3)], [side])).toEqual([]);
    expect(sitesAlongPath([at(5, -100), at(5, 200)], [side])).toHaveLength(1);
  });
});

describe('groups', () => {
  it('blocks per group', () => {
    expect(GROUPS.commuter.blocks(['one_way'])).toBe(true);
    expect(GROUPS.emergency.blocks(['one_way'])).toBe(false);
    expect(GROUPS.logistics.blocks(['half'])).toBe(true);
    expect(GROUPS.pedestrian.blocks(['full'])).toBe(false);
    expect(penaltyFor(testSite('h', 0, 0, 0, 1, { kind: 'half', kinds: ['half', 'signal'] }), 'commuter')).toBe(120);
    expect(penaltyFor(testSite('f', 0, 0, 0, 1), 'pedestrian')).toBe(60);
  });
});

describe('planDetour', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('routes around a blocking site the normal route drives through', async () => {
    const site = testSite('closed', 0, 0, 0, 10);
    const through = [at(-300, 10), at(300, 10)];
    const around = [at(-300, 10), at(-300, 200), at(300, 200), at(300, 10)];
    const bodies: { exclude_polygons?: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      const line = body.exclude_polygons ? around : through;
      return new Response(JSON.stringify({ trip: { legs: [{ shape: encode(line) }], summary: { time: body.exclude_polygons ? 200 : 120, length: 1 } } }));
    }));
    const d = await planDetour('commuter', through[0], through[1], [site]);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].exclude_polygons).toHaveLength(1);
    expect(d.avoided.map((s) => s.id)).toEqual(['closed']);
    expect(d).toMatchObject({ extraS: 80, blockedOnRoute: [], limitReached: false });
  });

  it('keeps the route and names the site when there is no way around', async () => {
    const site = testSite('dead-end', 0, 0, 0, 10);
    const through = [at(-310, 12), at(310, 12)];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.exclude_polygons) return new Response(JSON.stringify({ error_code: 442, error: 'No path could be found for input' }), { status: 400 });
      return new Response(JSON.stringify({ trip: { legs: [{ shape: encode(through) }], summary: { time: 120, length: 1 } } }));
    }));
    const d = await planDetour('commuter', through[0], through[1], [site]);
    expect(d.avoided).toEqual([]);
    expect(d.blockedOnRoute.map((s) => s.id)).toEqual(['dead-end']);
    expect(d.extraS).toBe(0);
  });
});
