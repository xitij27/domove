import { describe, expect, it } from 'vitest';
import type { ProgrammeProject } from '../data/sources';
import { bestWindows, clusterConflicts, dailyLoad, findConflicts, priorities, programmeBalance, transitGaps } from './analysis';
import { toLonLat } from './geo';
import { preparePopulation } from './population';
import { DEFAULT_SETTINGS } from './settings';
import { findNeighbours } from './sites';
import { ORIGIN, testSite } from './testSites';

const noStop = { stop: { name: 'Far', detail: '', m: 900 }, station: null };

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

  it('keeps only the works within the clash distance the planner set', () => {
    const near = { ...DEFAULT_SETTINGS, 'clash.radius': 600 };
    expect(conflicts.some((c) => c.b === 'e')).toBe(true);
    expect(findConflicts(sites, neighbours, 90, 400, near).some((c) => c.b === 'e')).toBe(false);
    expect(findConflicts(sites, neighbours, 90, 400, near).some((c) => c.b === 'b')).toBe(true);
  });

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
  it('ranks long, overlapping closures with no stop nearby first and explains why', () => {
    const sites = [
      testSite('long', 0, 0, 0, 200, noStop),
      testSite('short', 3000, 0, 0, 20),
      testSite('near', 300, 0, 0, 200),
    ];
    const [first] = priorities(sites, findNeighbours(sites), 10);
    expect(first.site.id).toBe('long');
    expect(first.reasons).toEqual(['Full closure on a main road', '1 overlapping site within 1 km', 'No bus or tram stop within 400 m, no train within 1000 m']);
    expect(first.freedOverlapDays).toBe(14);
  });

  it('lets how much a work closes outweigh how long it runs', () => {
    // a side-street closure (severity 0.3) running half a year, against a main-road closure (1) running three weeks
    const sites = [testSite('side', 0, 0, 0, 200, { road: 'local' }), testSite('main', 5000, 0, 0, 20)];
    expect(priorities(sites, findNeighbours(sites), 0)[0].site.id).toBe('main');
    // with severity counted once, as before, the long side-street closure came first
    expect(priorities(sites, findNeighbours(sites), 0, { ...DEFAULT_SETTINGS, 'priority.severityPower': 1 })[0].site.id).toBe('side');
  });

  it('counts a fire station only for works that stop fire engines', () => {
    const station = { fire: { name: 'Wache 1', detail: '', m: 50 } };
    const [full] = priorities([testSite('full', 0, 0, 0, 30, station)], new Map(), 0);
    const [half] = priorities([testSite('half', 0, 0, 0, 30, { ...station, kind: 'half' })], new Map(), 0);
    expect(full.factors.emergency).toBe(DEFAULT_SETTINGS['priority.emergency']);
    expect(full.reasons).toContain('50 m from Wache 1');
    expect(half.factors.emergency).toBe(1);
    expect(half.reasons.join()).not.toContain('Wache 1');
  });
});

describe('transitGaps', () => {
  // a 100 m census square whose centre is `x`, `y` metres from the test grid's centre
  const cell = (x: number, y: number, n: number): [number, number, number] => [...toLonLat([ORIGIN[0] + x, ORIGIN[1] + y]), n];
  const population = preparePopulation([cell(30, 10, 120), cell(60, 10, 80), cell(1000, 0, 500)]);
  const residents = new Map([['Eving', 40_000], ['Hörde', 57_000]]);

  it('counts the residents near works with no stop, each square once', () => {
    const sites = [
      testSite('a', 0, 0, 0, 29, { district: 'Eving', ...noStop }),
      testSite('a2', 40, 0, 0, 29, { district: 'Eving', ...noStop }), // shares both squares with a
      testSite('b', 0, 0, 0, 29, { district: 'Hörde' }), // a bus stop 100 m away
    ];
    const [eving, horde] = transitGaps(sites, residents, population, 0);
    expect(eving).toMatchObject({ district: 'Eving', cutOff: 200 });
    expect(eving.uncoveredSites.map((s) => s.id).sort()).toEqual(['a', 'a2']);
    expect(horde).toMatchObject({ district: 'Hörde', cutOff: 0, uncoveredSites: [] });
    expect(horde.mainRoadSites.map((s) => s.id)).toEqual(['b']);
  });

  it('flags nothing on missing data: no population file, or no stop file', () => {
    const [noPeople] = transitGaps([testSite('a', 0, 0, 0, 29, { district: 'Eving', ...noStop })], residents, null, 0);
    expect(noPeople.cutOff).toBe(0);
    const [noStops] = transitGaps([testSite('a', 0, 0, 0, 29, { district: 'Eving', stop: null })], residents, population, 0);
    expect(noStops).toMatchObject({ cutOff: 0, uncoveredSites: [] });
  });

  it('counts a train station in walking distance as a stop', () => {
    const [g] = transitGaps([testSite('a', 0, 0, 0, 29, { district: 'Eving', ...noStop, station: { name: 'Hbf', detail: '', m: 700 } })], residents, population, 0);
    expect(g.uncoveredSites).toEqual([]);
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
