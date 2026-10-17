import { describe, expect, it } from 'vitest';
import type { Poi } from '../data/sources';
import { toLonLat, toXY } from './geo';
import { calculateImpact, durationValue, exposureValue, impactAssessment, restrictionSeverity, reviewPriority } from './impact';
import { potentialConflicts } from './outlook';
import type { ProjectEvidence } from './outlook';
import type { Site } from './sites';
import { testSite } from './testSites';

const site = (id = 'a', x = 0, start = 100, end = 109) => testSite(id, x, 0, start, end, { title: 'Example street - Vollsperrung' });
const evidence = (s: Site, patch: Partial<ProjectEvidence> = {}): ProjectEvidence => ({
  id: s.id, start: s.start, end: s.end, openEnded: false, shape: s.shape, center: s.center, issues: [], ...patch,
});
const location = (s: Site, x: number, name = 'School'): Poi => {
  const [cx, cy] = toXY(s.center);
  return { name, detail: '', district: '', at: toLonLat([cx + x, cy]) };
};
const assess = (s: Site, p = evidence(s), all = [p], pois: Poi[] | null = [location(s, 0)], target: 'public' | 'business' = 'public') =>
  impactAssessment(s, p, all, potentialConflicts(all), pois, target);

describe('restriction severity: reported wording and mode scope', () => {
  it.each([
    ['Kampstraße - Vollsperrung', 1], ['Straße - VSP', 1], ['Halbseitige Sperrung', 0.65],
    ['Vollsperrung der Richtungsfahrbahn', 0.65], ['Einbahnstraße', 0.65],
    ['Fahrstreifenreduzierung', 0.45], ['Fahrbahneinengung', 0.45],
    ['Gehwegsperrung', 0.25], ['Vollsperrung Fußweg', 0.25], ['Vollsperrung des Radwegs', 0.25],
    ['Emscherradweg - Vollsperrung', 0.25], ['Parkstreifen gesperrt', 0.25],
    ['Keine Einschränkungen', 0], ['Straße - keine Verkehrseinschränkungen', 0],
    ['Leitungsarbeiten', null], ['', null], ['Keine Vollsperrung', null],
  ])('%s => %s', (title, value) => expect(restrictionSeverity(title).value).toBe(value));

  it('preserves a separately reported road closure alongside a path closure', () => {
    expect(restrictionSeverity('Vollsperrung des Radwegs; Vollsperrung Straße').value).toBe(1);
    expect(restrictionSeverity('Gehwegsperrung').reason).toContain('not evidence of a full motor-vehicle closure');
    expect(restrictionSeverity('Vollsperrung des Radwegs').reason).toContain('walking/cycling only');
  });
});

describe('exposure', () => {
  it.each([[0, 1], [100, 1], [100.01, 0.75], [250, 0.75], [250.01, 0.4], [500, 0.4], [500.01, 0], [-1, null], [NaN, null], [Infinity, null]])(
    'classifies distance %s m as %s', (m, expected) => expect(exposureValue(m)).toBe(expected),
  );

  it('uses the nearest geometry distance and maximum exposure, rather than adding locations', () => {
    const s = site();
    const result = assess(s, evidence(s), undefined, [location(s, 150, 'Far school'), location(s, 0, 'Inside school')]);
    expect(result.factors[1]).toMatchObject({ value: 1, contribution: 30 });
    expect(result.factors[1].reason).toContain('Inside school');
    // Centre is 10 m inside the square: the boundary is 10 m closer than its centre.
    expect(assess(s, evidence(s), undefined, [location(s, 109)]).factors[1].value).toBe(1);
    expect(assess(s, evidence(s), undefined, [location(s, 111)]).factors[1].value).toBe(0.75);
  });

  it('separates public-service and locally selected business locations', () => {
    const s = site();
    const result = assess(s, evidence(s), undefined, [location(s, 0, 'Warehouse')], 'business');
    expect(result.factors[1].reason).toContain('selected business');
    expect(result.factors[1].source).toContain('browser only');
    expect(assess(s).factors[1].source).toContain('Dortmund Open Data');
    expect(assess(s, evidence(s), undefined, [], 'business').factors[1].value).toBeNull();
  });

  it('does not fabricate unavailable locations or synthetic geometry', () => {
    const s = site();
    for (const pois of [null, []]) expect(assess(s, evidence(s), undefined, pois).factors[1].value).toBeNull();
    expect(assess(s, evidence(s, { shape: null })).factors[1].value).toBeNull();
    const swapped: Poi = { name: 'Invalid', detail: '', district: '', at: [51.5, 7.4] };
    expect(assess(s, evidence(s), undefined, [swapped]).factors[1].value).toBeNull();
    expect(assess(s, evidence(s), undefined, [swapped, location(s, 150)]).factors[1].value).toBeNull();
    expect(assess(s, evidence(s), undefined, [swapped, location(s, 0)]).factors[1].value).toBe(1);
  });
});

describe('construction conflicts reuse Outlook results', () => {
  it.each([[10, 100, 1], [100, 100, 0.5], [270, 100, 0.5], [271, 100, 0], [10, 110, 0]])(
    'with other project at x=%s, start=%s gives %s', (x, start, value) => {
      const a = site();
      const all = [evidence(a), evidence(site('b', x, start, start + 3))];
      expect(assess(a, all[0], all).factors[2].value).toBe(value);
    },
  );

  it('does not assume that missing project data means no conflict', () => {
    const a = site();
    const p = evidence(a);
    const other = evidence(site('b', 100), { start: null });
    expect(assess(a, p, [p, other]).factors[2].value).toBeNull();
    expect(assess(a, evidence(a, { shape: null })).factors[2].value).toBeNull();
    expect(assess(a, p, [p, { ...other, shape: null }]).factors[2].value).toBeNull();
    expect(assess(a, p, [p, evidence(site('far', 5000), { start: null })]).factors[2].value).toBe(0);
  });

  it('can establish the maximum intersection factor despite an unrelated unknown project', () => {
    const a = site();
    const p = evidence(a);
    expect(assess(a, p, [p, evidence(site('b', 10)), evidence(site('c', 100), { end: null })]).factors[2].value).toBe(1);
  });

  it('does not count a duplicate project ID as another construction site', () => {
    const a = site();
    const p = evidence(a);
    expect(assess(a, p, [p, p]).factors[2].value).toBe(0);
  });
});

describe('duration uses inclusive reported dates', () => {
  it.each([[1, 0.25], [2, 0.25], [3, 0.5], [14, 0.5], [15, 0.75], [30, 0.75], [31, 1]])(
    '%s days => %s', (days, value) => expect(durationValue(evidence(site('a', 0, 100, 99 + days)))).toBe(value),
  );

  it('rejects missing, invalid, open-ended and sentinel dates', () => {
    const p = evidence(site());
    for (const patch of [{ start: null }, { end: null }, { start: 200 }, { end: NaN }, { openEnded: true }, { end: 376199 }]) {
      expect(durationValue({ ...p, ...patch })).toBeNull();
    }
  });
});

describe('complete assessment', () => {
  it('calculates the documented 82.5 fixture dynamically', () => {
    expect(calculateImpact({ S: 1, E: 1, C: 0.5, D: 0.5 })).toBe(82.5);
    const a = site();
    const all = [evidence(a), evidence(site('b', 100))];
    const result = assess(a, all[0], all);
    expect(result.total).toBe(82.5);
    expect(result.priority).toBe('Very High Review Priority');
    expect(result.factors.map((f) => f.contribution)).toEqual([35, 30, 10, 7.5]);
    expect(result.factors.every((f) => f.reason.length > 0 && f.source.length > 0)).toBe(true);
    expect(result.missing).toEqual([]);
    expect(assess(a, all[0], all)).toEqual(result);
  });

  it('retains available contributions but withholds a total for any missing factor', () => {
    const a = { ...site(), title: 'Leitungsarbeiten' };
    const result = assess(a);
    expect(result.total).toBeNull();
    expect(result.priority).toBeNull();
    expect(result.missing).toEqual(['Restriction Severity']);
    expect(result.factors[0].contribution).toBeNull();
    expect(result.factors[1].contribution).toBe(30);
    for (const key of ['S', 'E', 'C', 'D'] as const) {
      expect(calculateImpact({ S: 1, E: 1, C: 1, D: 1, [key]: null })).toBeNull();
    }
  });

  it('rejects out-of-range or non-finite factors instead of silently clamping', () => {
    for (const S of [-1, 1.1, NaN, Infinity]) expect(calculateImpact({ S, E: 1, C: 1, D: 1 })).toBeNull();
    expect(calculateImpact({ S: 0, E: 0, C: 0, D: 0 })).toBe(0);
    expect(calculateImpact({ S: 1, E: 1, C: 1, D: 1 })).toBe(100);
  });

  it.each([[0, 'Low'], [30, 'Low'], [30.1, 'Medium'], [60, 'Medium'], [60.1, 'High'], [80, 'High'], [80.1, 'Very High'], [100, 'Very High']])(
    'classifies %s as %s', (score, prefix) => expect(reviewPriority(score)).toBe(`${prefix} Review Priority`),
  );
});
