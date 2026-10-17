import { describe, expect, it } from 'vitest';
import type { ProgrammeProject } from '../data/sources';
import { bestWindows, clusterConflicts, dailyLoad, findConflicts, priorities, programmeBalance, transitGaps } from './analysis';
import { findNeighbours } from './sites';
import { testSite } from './testSites';

describe('dailyLoad', () => {
  it('sums severities per day and band', () => {
    const load = dailyLoad([testSite('a', 0, 0, 10, 12), testSite('b', 0, 0, 12, 20, { kind: 'half', road: 'local' })], 10, 13);
    expect(load.map((p) => p.total)).toEqual([1, 1, 1.15, 0.15]);
    expect(load[2]).toMatchObject({ high: 1, low: 0.15 });
  });
});

describe('conflicts', () => {
  // a and b overlap 5 days 280 m apart; c sits on the same stretch as a, 20 days after it; e overlaps a 700 m away;
  // d is far away.
  const sites = [
    testSite('a', 0, 0, 100, 120),
    testSite('b', 300, 0, 116, 140),
    testSite('e', 0, 720, 100, 110, { kind: 'half' }),
    testSite('c', 30, 0, 141, 150),
    testSite('d', 5000, 0, 100, 140),
  ];
  const neighbours = findNeighbours(sites);
  const conflicts = findConflicts(sites, neighbours, 90, 400);

  it('finds compounding works and bundle chances', () => {
    const compound = conflicts.find((c) => c.type === 'compound' && c.b === 'b')!;
    expect(compound).toMatchObject({ a: 'a', b: 'b', days: 5, from: 116, to: 120, minSeverity: 1 });
    expect(compound.score).toBeCloseTo(5 * (1 - 280 / 1000), 5);
    expect(conflicts.find((c) => c.b === 'e')).toMatchObject({ type: 'compound', days: 11, minSeverity: 0.5 });
    expect(conflicts.find((c) => c.type === 'bundle')).toMatchObject({ a: 'a', b: 'c', days: 20, m: 10 });
    expect(conflicts.some((c) => c.a === 'd' || c.b === 'd')).toBe(false);
  });

  it('clusters serious works within 400 m only', () => {
    const clusters = clusterConflicts(conflicts);
    expect(clusters.map((c) => c.siteIds)).toEqual([['a', 'b']]);
  });

  it("ignores a bundle when the later works have already started", () => {
    expect(findConflicts(sites, neighbours, 145, 400).some((c) => c.type === 'bundle')).toBe(false);
  });
});

describe('bestWindows', () => {
  it('counts clashes in plain numbers: works alongside, and days with at least one', () => {
    // s runs 110–119; x (300 m away) shares 110–115 and y (300 m away) 113–119: 13 days summed, 10 days with any clash.
    // z is on the same stretch, so it counts as together, not as a clash.
    const sites = [testSite('x', 300, 0, 100, 115), testSite('y', 0, 300, 113, 130), testSite('z', 20, 0, 110, 119), testSite('s', 0, 0, 110, 119)];
    const { current } = bestWindows(sites[3], sites, findNeighbours(sites).get('s')!, [], 95, null);
    expect(current).toMatchObject({ clashes: 2, clashDays: 10 });
  });

  it('moves a site out of an overlap and pays for the shift', () => {
    const busy = testSite('busy', 500, 0, 100, 130);
    const site = testSite('s', 0, 0, 110, 119);
    const sites = [busy, site];
    const advice = bestWindows(site, sites, findNeighbours(sites).get('s')!, [], 95, null);
    expect(advice.current.overlap).toBeGreaterThan(0);
    const [best] = advice.options;
    expect(best.overlap).toBe(0);
    expect(best.start).toBe(131); // the first day free of the busy site: the smallest shift that clears it
    expect(advice.options.every((o) => o.cost < advice.current.cost)).toBe(true);
  });

  it('pulls a site towards works on the same stretch', () => {
    const partner = testSite('p', 20, 0, 140, 160);
    const site = testSite('s', 0, 0, 110, 119);
    const sites = [partner, site];
    const [best] = bestWindows(site, sites, findNeighbours(sites).get('s')!, [], 95, null).options;
    expect(best.start).toBeGreaterThanOrEqual(140);
    expect(best.end).toBeLessThanOrEqual(160);
  });

  it('prefers school holidays and flags dates past the known horizon', () => {
    const site = testSite('s', 0, 0, 110, 119);
    const [best] = bestWindows(site, [site], [], [[125, 140]], 95, 115).options;
    expect(best).toMatchObject({ start: 125, holidayDays: 10, afterHorizon: true });
  });

  it('leads with the smallest move that gets most of the benefit', () => {
    // Overlapping a 60-day site 300 m away; moving +45 days clears it, so nothing past that needs suggesting first.
    const busy = testSite('busy', 300, 0, 100, 140);
    const site = testSite('s', 0, 0, 120, 129);
    const sites = [busy, site];
    const [first, ...rest] = bestWindows(site, sites, findNeighbours(sites).get('s')!, [], 95, null).options;
    expect(first).toMatchObject({ start: 141, overlap: 0 });
    expect(rest.every((o) => o.cost >= first.cost)).toBe(true);
  });

  it("suggests nothing when the published dates are already best", () => {
    const site = testSite('s', 0, 0, 110, 119);
    expect(bestWindows(site, [site], [], [], 95, null).options).toEqual([]);
  });
});

describe('priorities', () => {
  it('ranks long, overlapping, car-dependent closures first and explains why', () => {
    const sites = [
      testSite('long', 0, 0, 0, 200, { rail: { name: 'X', detail: '', m: 900 } }),
      testSite('short', 3000, 0, 0, 20, { rail: { name: 'Y', detail: '', m: 100 } }),
      testSite('near', 300, 0, 0, 200, { rail: { name: 'Z', detail: '', m: 100 } }),
    ];
    const [first] = priorities(sites, findNeighbours(sites), 10);
    expect(first.site.id).toBe('long');
    expect(first.reasons).toEqual(['Full closure on a main road', '1 overlapping site within 1 km', 'No Stadtbahn within 600 m']);
    expect(first.freedOverlapDays).toBe(14);
  });
});

describe('transitGaps', () => {
  it('weighs closures far from the Stadtbahn per resident', () => {
    const sites = [
      testSite('a', 0, 0, 0, 29, { district: 'Eving', rail: { name: '', detail: '', m: 900 } }),
      testSite('b', 0, 0, 0, 29, { district: 'Hörde', rail: { name: '', detail: '', m: 100 } }),
    ];
    const [eving, horde] = transitGaps(sites, new Map([['Eving', 40_000], ['Hörde', 57_000]]), 0, 30);
    expect(eving).toMatchObject({ district: 'Eving', uncovered: 1, mainRoad: 1, score: 1.5 / 4 });
    expect(horde).toMatchObject({ uncovered: 0, mainRoad: 1 });
  });
});

describe('programmeBalance', () => {
  it('counts projects in construction and flags overloaded cells', () => {
    const p = (district: string, stage: string): ProgrammeProject => ({
      id: `${district}${Math.random()}`, name: 'x', district, trade: '', status: '', priorityClass: '1', points: 1, mainRoad: false, transit: false,
      stages: { '2025': '', '2026_i': '', '2026_ii': '', '2026_iii': '', '2026_iv': '', '2027': stage, '2028': '' },
    });
    const projects = [...Array(6)].map(() => p('Eving', 'Bau')).concat([p('Hörde', 'Bau'), p('Mengede', 'Bau'), p('Mengede', 'Planung'), p('Citywide', 'Bau')]);
    const balance = programmeBalance(projects, ['Eving', 'Hörde', 'Mengede']);
    expect(balance.rows).toEqual(['Eving', 'Hörde', 'Mengede', 'Citywide']);
    expect(balance.medians['2027']).toBe(1);
    expect(balance.cells.get('Eving')!['2027']).toMatchObject({ count: 6, overloaded: true });
    expect(balance.cells.get('Mengede')!['2027']).toMatchObject({ count: 1, overloaded: false });
    expect(balance.cells.get('Citywide')!['2027'].count).toBe(1);
  });
});
