import { describe, expect, it } from 'vitest';
import type { Poi } from '../data/sources';
import { toLonLat, toXY } from './geo';
import { potentialConflicts } from './outlook';
import type { ProjectEvidence } from './outlook';
import { testSite } from './testSites';
import { trafficContext } from './trafficContext';

const a = testSite('a', 0, 0, 100, 110, { roadName: 'Example road', road: 'main' });
const b = testSite('b', 200, 0, 105, 120);
const evidence = (site = a): ProjectEvidence => ({
  id: site.id, start: site.start, end: site.end, openEnded: false,
  shape: site.shape, center: site.center, issues: [],
});
const stop = (name: string, metres: number): Poi => {
  const origin = toXY(a.center);
  return { name, detail: 'Verified stop', district: '', at: toLonLat([origin[0] + 10 + metres, origin[1]]) };
};

describe('trafficContext', () => {
  it('uses only a matched source road class, without inventing OSM categories', () => {
    const context = trafficContext(a, evidence(), [], true, []);
    expect(context.road).toBe('Example road · main road');
    expect(context.sources.join(' ')).toContain('fb62-strassenabschnitte');
    expect(context.limitations.join(' ')).toContain('not measured traffic volumes');
    expect(context.limitations.join(' ')).toContain('selected main and through roads only');
  });

  it('does not report the legacy local-road default as verified road context', () => {
    expect(trafficContext({ ...a, road: 'local', roadName: '' }, evidence(), [], true, []).road).toBeNull();
    expect(trafficContext(a, evidence(), [], false, []).road).toBeNull();
    expect(trafficContext(a, { ...evidence(), shape: null }, [], true, []).road).toBeNull();
  });

  it('measures stop distances to the verified footprint, sorts, and applies the inclusive radius', () => {
    const context = trafficContext(a, evidence(), [stop('far', 510), stop('boundary', 500), stop('near', 50)], true, []);
    expect(context.stops.map((s) => s.name)).toEqual(['near', 'boundary']);
    expect(context.stops[0].m).toBeCloseTo(50);
    expect(context.sources.join(' ')).toContain('haltestellen');
    expect(context.sources.join(' ')).toContain('not a complete bus-stop inventory');
  });

  it('rejects missing, reversed and non-finite coordinates instead of reversing them silently', () => {
    const invalid = [
      { ...stop('reversed', 0), at: [51.5, 7.4] as [number, number] },
      { ...stop('nan', 0), at: [NaN, 51.5] as [number, number] },
      { ...stop('missing', 0), at: [] as unknown as [number, number] },
    ];
    expect(trafficContext(a, evidence(), invalid, true, []).stops).toEqual([]);
  });

  it('reuses existing Outlook conflict evidence and updates with the selected project', () => {
    const pairs = potentialConflicts([evidence(a), evidence(b)]);
    const contextA = trafficContext(a, evidence(a), [], true, pairs);
    const contextB = trafficContext(b, evidence(b), [], true, pairs);
    expect(contextA.nearby).toEqual([{ id: 'b', metres: 180, from: 105, to: 110 }]);
    expect(contextB.nearby).toEqual([{ id: 'a', metres: 180, from: 105, to: 110 }]);
    expect(trafficContext(a, evidence(a), [], true, []).nearby).toEqual([]);
  });

  it('distinguishes unavailable data from a successful empty dataset', () => {
    const unavailable = trafficContext(a, { ...evidence(), shape: null }, null, false, []);
    expect(unavailable.stops).toEqual([]);
    expect(unavailable.limitations.join(' ')).toContain('Public transport stop data unavailable');
    expect(unavailable.limitations.join(' ')).toContain('synthetic marker');
    expect(unavailable.limitations.join(' ')).toContain('Alternative route analysis unavailable');
    expect(trafficContext(a, evidence(), [], true, []).limitations.join(' ')).not.toContain('Public transport stop data unavailable');
  });

  it('allows configured radii and rejects invalid ones', () => {
    expect(trafficContext(a, evidence(), [stop('outside', 101)], true, [], 100).stops).toEqual([]);
    expect(() => trafficContext(a, evidence(), [], true, [], -1)).toThrow(RangeError);
  });
});
