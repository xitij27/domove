import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import type { RawSite } from '../data/sources';
import { toDay } from './days';
import { toLonLat, toXY } from './geo';
import { berlinToday, buildEvidence, outlook, parseReportedDay, potentialConflicts, validLonLat } from './outlook';
import { buildSites, prepareContext } from './sites';

const origin = toXY([7.4653, 51.5136]);
const at = (x: number, y = 0) => toLonLat([origin[0] + x, origin[1] + y]);
const square = (x: number): Polygon => ({ type: 'Polygon', coordinates: [[at(x), at(x + 20), at(x + 20, 20), at(x, 20), at(x)]] });
const raw = (id: string, extra: Partial<RawSite> = {}): RawSite => ({
  id, status: 'current', title: id, owner: 'City', district: '', startsOn: '2026-10-01',
  endsOn: '2026-10-31', center: at(10, 10), geometry: square(0), ...extra,
});
const evidence = (...inputs: RawSite[]) => buildEvidence(inputs, []);
const reference = toDay('2026-10-01');

describe('reported dates and Berlin reference date', () => {
  it('rejects calendar rollover, malformed strings and missing dates', () => {
    for (const value of [null, '', '2026-02-29', '2026-02-31', '2026-13-01', '2026-10-01T00:00:00Z']) {
      expect(parseReportedDay(value)).toBeNull();
    }
    expect(parseReportedDay('2024-02-29')).toBe(toDay('2024-02-29'));
  });
  it('uses Berlin calendar days at midnight and across both DST transitions', () => {
    expect(berlinToday(new Date('2026-10-01T22:30:00Z'))).toBe(toDay('2026-10-02'));
    expect(berlinToday(new Date('2026-03-28T23:30:00Z'))).toBe(toDay('2026-03-29'));
    expect(berlinToday(new Date('2026-03-29T22:30:00Z'))).toBe(toDay('2026-03-30'));
    expect(berlinToday(new Date('2026-10-25T22:30:00Z'))).toBe(toDay('2026-10-25'));
    expect(berlinToday(new Date('2026-10-25T23:30:00Z'))).toBe(toDay('2026-10-26'));
  });
});

describe('source evidence normalization', () => {
  it('does not substitute synthetic date bounds or circles for missing evidence', () => {
    const [missing] = evidence(raw('missing', { startsOn: null, endsOn: null, geometry: null }));
    expect(missing).toMatchObject({ start: null, end: null, openEnded: true, shape: null });
    expect(missing.center).not.toBeNull();
    expect(missing.issues).toHaveLength(3);
  });
  it('handles sentinel dates and inverted intervals as unknown', () => {
    const [open, inverted] = evidence(raw('open', { endsOn: '2999-12-31' }),
      raw('inverted', { startsOn: '2026-11-01', endsOn: '2026-10-01' }));
    expect(open).toMatchObject({ start: reference, end: null, openEnded: true });
    expect(inverted).toMatchObject({ start: null, end: null });
    expect(inverted.issues.join(' ')).toContain('after');
  });
  it('deduplicates repeated IDs and exact project representations while preserving different places', () => {
    const a = raw('a');
    const deduped = evidence(a, { ...a }, { ...a, id: 'alias', title: ' A ' },
      { ...a, id: 'elsewhere', geometry: square(1000), center: at(1010, 10) });
    expect(deduped.map((p) => p.id)).toEqual(['a', 'elsewhere']);
  });
  it('retains the most complete representation for repeated IDs', () => {
    const entries = evidence(raw('a', { geometry: null }), raw('a'));
    expect(entries).toHaveLength(1);
    expect(entries[0].shape).not.toBeNull();
  });
  it('deduplicates matching point and polygon feeds regardless of their source IDs or input order', () => {
    const footprint = raw('polygon', { title: 'Example Street', owner: 'City' });
    const point = { ...footprint, id: 'point', title: ' example STREET ', owner: ' CITY ', geometry: null };
    for (const records of [[point, footprint], [footprint, point]]) {
      expect(evidence(...records).map((p) => p.id)).toEqual(['polygon']);
    }
  });
  it('preserves different real polygons sharing a marker and different published date intervals', () => {
    const first = raw('a', { title: 'Example Street' });
    const second = { ...first, id: 'b', geometry: square(100) };
    const point = { ...first, id: 'point', geometry: null };
    const later = { ...point, id: 'later', startsOn: '2026-10-02' };
    expect(evidence(first, second, point, later).map((p) => p.id)).toEqual(['a', 'b', 'later']);
  });
  it('applies scenario shifts only to originally verified bounds', () => {
    const records = [raw('dated'), raw('missing', { startsOn: null, endsOn: null })];
    const sites = buildSites(records, prepareContext({ roads: [], stops: [], fire: [], hospitals: [] }))
      .map((s) => ({ ...s, start: s.start + 3, end: s.end + 3 }));
    const result = buildEvidence(records, sites);
    expect(result.find((p) => p.id === 'dated')).toMatchObject({ start: reference + 3, end: toDay('2026-11-03') });
    expect(result.find((p) => p.id === 'missing')).toMatchObject({ start: null, end: null });
  });
  it('rejects swapped coordinates, malformed rings, holes outside the exterior and self-intersections', () => {
    expect(validLonLat([51.51, 7.46])).toBe(false);
    expect(validLonLat([7.46, 51.51])).toBe(true);
    const invalid: Polygon[] = [
      { type: 'Polygon', coordinates: [] },
      { type: 'Polygon', coordinates: [[[7.4, 51.5], [7.5, 51.5], [7.5, 51.6]]] },
      { type: 'Polygon', coordinates: [[[51.5, 7.4], [51.5, 7.5], [51.6, 7.5], [51.5, 7.4]]] },
      { type: 'Polygon', coordinates: [square(0).coordinates[0], square(1000).coordinates[0]] },
      { type: 'Polygon', coordinates: [[at(0), at(20, 20), at(0, 20), at(20), at(0)]] },
    ];
    for (const geometry of invalid) expect(evidence(raw('bad', { geometry }))[0].shape).toBeNull();
    const [bad] = evidence(raw('bad', { center: [51.5, 7.4] }));
    expect(bad.center).toBeNull();
  });
  it('keeps the application pipeline usable with malformed source geometry without inventing analytical evidence', () => {
    const malformed = [
      { type: 'Polygon', coordinates: [null] },
      { type: 'Polygon', coordinates: [] },
      { type: 'Polygon', coordinates: [[[Infinity, 51.5], [7.4, 51.5], [7.4, 51.6], [Infinity, 51.5]]] },
    ] as unknown as Polygon[];
    const context = prepareContext({ roads: [], stops: [], fire: [], hospitals: [] });
    for (const geometry of malformed) {
      const source = raw('invalid', { geometry });
      const sites = buildSites([source], context);
      expect(sites[0].shape.bbox.every(Number.isFinite)).toBe(true);
      expect(sites[0].geometry).not.toBe(geometry);
      expect(sites[0].shape.bbox[2] - sites[0].shape.bbox[0]).toBeCloseTo(50, 0);
      const [analytical] = buildEvidence([source], sites);
      expect(analytical.shape).toBeNull();
      expect(analytical.issues.join(' ')).toContain('geometry is invalid');
      expect(source.geometry).toBe(geometry);
    }
    const valid = raw('valid');
    expect(buildSites([valid], context)[0].geometry).toBe(valid.geometry);
  });
});

describe('inclusive outlook windows', () => {
  it.each([7, 14, 30] as const)('selects exactly %i days including both boundary days', (days) => {
    const projects = evidence(raw('first', { endsOn: '2026-10-01' }),
      raw('last', { startsOn: `2026-10-${String(days).padStart(2, '0')}` }),
      raw('later', { startsOn: `2026-10-${String(days + 1).padStart(2, '0')}` }));
    const result = outlook(projects, reference, days);
    expect(result.to - result.from + 1).toBe(days);
    expect(result.active.map((p) => p.id).sort()).toEqual(['first', 'last']);
    expect(result.ending.map((p) => p.id)).toEqual(['first']);
  });
  it('distinguishes ongoing, starting, ending, and undated work', () => {
    const result = outlook(evidence(raw('ongoing', { startsOn: '2026-09-01' }),
      raw('starting'), raw('ending', { startsOn: '2026-09-01', endsOn: '2026-10-03' }),
      raw('unknown', { startsOn: null, endsOn: null }), raw('open', { endsOn: '2999-12-31' })), reference, 7);
    expect(result.ongoing.map((p) => p.id)).toEqual(['ongoing', 'ending']);
    expect(result.starting.map((p) => p.id)).toEqual(['starting', 'open']);
    expect(result.ending.map((p) => p.id)).toEqual(['ending']);
    expect(result.uncertain.map((p) => p.id).sort()).toEqual(['open', 'unknown']);
    expect(result.active.some((p) => p.id === 'unknown')).toBe(false);
  });
});

describe('potential conflicts reuse real footprint distances and inclusive periods', () => {
  it('detects intersection, near projects, and a shared boundary date without distant or nonconcurrent pairs', () => {
    const projects = evidence(raw('a', { endsOn: '2026-10-03' }),
      raw('intersect', { geometry: square(10), startsOn: '2026-10-03' }),
      raw('near', { geometry: square(220), startsOn: '2026-10-03' }),
      raw('far', { geometry: square(1000) }),
      raw('later', { startsOn: '2026-11-01', endsOn: '2026-11-30' }),
      raw('point', { geometry: null }), raw('unknown', { endsOn: null }));
    const pairs = potentialConflicts(projects);
    expect(pairs.find((p) => p.a === 'a' && p.b === 'intersect')).toMatchObject({
      from: reference + 2, to: reference + 2, intersects: true, metres: 0,
    });
    expect(pairs.find((p) => p.a === 'a' && p.b === 'near')).toMatchObject({ intersects: false, metres: expect.closeTo(200, 0) });
    expect(pairs.every((p) => !['far', 'later', 'point', 'unknown'].includes(p.a) &&
      !['far', 'later', 'point', 'unknown'].includes(p.b))).toBe(true);
    expect(outlook(projects, reference, 7, 250, pairs).conflicts)
      .toEqual(pairs.map((p) => ({ ...p, to: Math.min(p.to, reference + 6) })));
  });
  it('respects polygon holes instead of treating a site inside a hole as intersecting', () => {
    const outer = [at(0), at(100), at(100, 100), at(0, 100), at(0)];
    const hole = [at(20, 20), at(80, 20), at(80, 80), at(20, 80), at(20, 20)];
    const island: Polygon = { type: 'Polygon', coordinates: [[at(40, 40), at(60, 40), at(60, 60), at(40, 60), at(40, 40)]] };
    const pairs = potentialConflicts(evidence(raw('a', { geometry: { type: 'Polygon', coordinates: [outer, hole] } }),
      raw('b', { geometry: island })), 25);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ intersects: false, metres: expect.closeTo(20, 0) });
  });
  it('clips conflict evidence to the selected outlook interval', () => {
    const result = outlook(evidence(raw('a'), raw('b', { geometry: square(10) })), reference + 5, 7);
    expect(result.conflicts[0]).toMatchObject({ from: reference + 5, to: reference + 11 });
  });
});
