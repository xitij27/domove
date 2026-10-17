import { describe, expect, it } from 'vitest';
import type { RawSite, Road } from '../data/sources';
import { toDay } from './days';
import { toLonLat, toXY } from './geo';
import { DEFAULT_SETTINGS } from './settings';
import { buildSites, findNeighbours, OPEN_END, prepareContext, streetKey, weigh } from './sites';
import { testSite } from './testSites';

const O = toXY([7.4653, 51.5136]);
const at = (x: number, y: number) => toLonLat([O[0] + x, O[1] + y]);
// A 100 m x 12 m site along the x axis.
const raw = (id: string, title: string, extra: Partial<RawSite> = {}): RawSite => ({
  id, status: 'current', title, owner: '', district: 'Innenstadt-West', startsOn: '2026-10-01', endsOn: '2026-11-30',
  geometry: { type: 'Polygon', coordinates: [[at(0, 0), at(100, 0), at(100, 12), at(0, 12), at(0, 0)]] },
  center: at(50, 6),
  ...extra,
});
const road = (name: string, cls: string, from: [number, number], to: [number, number]): Road =>
  ({ name, cls, geometry: { type: 'LineString', coordinates: [at(...from), at(...to)] } });

describe('buildSites', () => {
  const ctx = prepareContext({
    roads: [
      road('Westfalendamm', 'Hauptverkehrstraße', [-200, 6], [300, 6]), // runs along the site
      road('Ruhrallee', 'Hauptverkehrstraße', [400, -300], [400, 300]), // far away
    ],
    stops: [{ name: 'Stadthaus', detail: 'U41', district: '', at: at(50, 312) }],
    fire: [],
    hospitals: [],
  });

  it('rates a full closure on a main road at full severity', () => {
    const [s] = buildSites([raw('a', 'Westfalendamm // Vollsperrung')], ctx);
    expect(s).toMatchObject({ kind: 'full', road: 'main', roadName: 'Westfalendamm', severity: 1 });
    expect(s.rail.name).toBe('Stadthaus');
    expect(s.rail.m).toBeCloseTo(300, 0);
  });

  it("doesn't count a main road that only touches the site's end", () => {
    const ctxCross = prepareContext({ roads: [road('Ruhrallee', 'Hauptverkehrstraße', [105, -300], [105, 300])], stops: [], fire: [], hospitals: [] });
    const [s] = buildSites([raw('b', 'Nebenstraße // halbseitige Sperrung')], ctxCross);
    expect(s).toMatchObject({ kind: 'half', road: 'local', severity: 0.15 });
  });

  it('caps open-ended works and keeps undated planned sites inactive', () => {
    const [open, undated] = buildSites([
      raw('c', 'X // Vollsperrung', { endsOn: '2999-12-31' }),
      raw('d', 'Y // Vollsperrung', { status: 'planned', startsOn: null, endsOn: null }),
    ], ctx);
    expect(open).toMatchObject({ openEnded: true, end: OPEN_END, start: toDay('2026-10-01') });
    expect(undated.start).toBeGreaterThan(undated.end);
  });

  it('gives sites without a polygon a small circle', () => {
    const [s] = buildSites([raw('e', 'Z', { geometry: null })], ctx);
    expect(s.geometry.type).toBe('Polygon');
    expect(s.shape.bbox[2] - s.shape.bbox[0]).toBeCloseTo(50, 0);
  });
});

describe('findNeighbours', () => {
  it('links sites within the radius, both ways', () => {
    const sites = [testSite('a', 0, 0, 0, 10), testSite('b', 520, 0, 0, 10), testSite('c', 2000, 0, 0, 10)];
    const n = findNeighbours(sites, 1000);
    expect(n.get('a')).toEqual([{ id: 'b', m: expect.closeTo(500, 0) }]);
    expect(n.get('b')?.map((x) => x.id)).toEqual(['a']);
    expect(n.get('c')).toEqual([]);
  });
});

it('re-weighs severity, worst kind and band under the planner\'s weights', () => {
  const half = testSite('h', 0, 0, 0, 10, { kind: 'half', road: 'secondary', kinds: ['half', 'signal'] });
  expect(half).toMatchObject({ kind: 'half', severity: 0.3, band: 'medium' });
  const [heavier] = weigh([half], { ...DEFAULT_SETTINGS, 'weight.signal': 0.9, 'road.secondary': 0.8, 'band.high': 0.7 });
  expect(heavier).toMatchObject({ kind: 'signal', band: 'high' });
  expect(heavier.severity).toBeCloseTo(0.72);
});

it('compares street names loosely', () => {
  expect(streetKey('Bövinghauser Str. 25 -Arbeiten')).toContain(streetKey('Bövinghauser Straße'));
});
