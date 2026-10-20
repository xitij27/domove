// Runs the real loaders and the whole analysis against today's data: `LIVE=1 npx vitest run src/live.test.ts`.
// Skipped otherwise, so the checks don't depend on the city's or FOSSGIS's servers.
import { describe, expect, it } from 'vitest';
import * as data from './data/sources';
import { clusterConflicts, dailyLoad, findConflicts, priorities, programmeBalance, stopsUnderPressure, transitGaps } from './model/analysis';
import { isoDay, localToday } from './model/days';
import { dist, toLonLat, toXY } from './model/geo';
import type { XY } from './model/geo';
import { buildSites, findNeighbours, prepareContext } from './model/sites';
import { MAX_CUTS, planDetour } from './routing/valhalla';

describe.runIf(import.meta.env.LIVE)('live data', () => {
  it("loads and analyses today's data", async () => {
    const today = localToday();
    const [raw, roads, stops, fire, hospitals, districts, residents, programme, holidays] = await Promise.all([
      data.fetchSites(), data.fetchRoads(), data.fetchStops(), data.fetchFireStations(), data.fetchHospitals(),
      data.fetchDistricts(), data.fetchResidents(), data.fetchProgramme(), data.fetchHolidays(isoDay(today - 30), isoDay(today + 400)),
    ]);
    const t0 = performance.now();
    const sites = buildSites(raw, prepareContext({ roads, stops, fire, hospitals }));
    const neighbours = findNeighbours(sites);
    const enrichMs = performance.now() - t0;

    const kinds: Record<string, number> = {};
    for (const s of sites) for (const k of s.kinds) kinds[k] = (kinds[k] ?? 0) + 1;
    const roadsCount = { main: 0, secondary: 0, local: 0 };
    for (const s of sites) roadsCount[s.road]++;
    const byName = new Map(districts.map((d) => [d.name, residents.byKey[data.districtKey(d.name)]]));
    const conflicts = findConflicts(sites, neighbours, today, today + 365);
    const clusters = clusterConflicts(conflicts);
    const gaps = transitGaps(sites, byName, null, today);
    const top = priorities(sites, neighbours, today);
    const balance = programmeBalance(programme, districts.map((d) => d.name));
    const load = dailyLoad(sites, today - 30, today + 365);
    const summary = {
      sites: sites.length, enrichMs: Math.round(enrichMs), kinds, roads: roadsCount,
      noRail: sites.filter((s) => s.rail.m > 600).length,
      districts: [...byName].map(([d, r]) => `${d}:${r}`).join(' '),
      loadToday: load[30].total.toFixed(1), loadMax: Math.max(...load.map((p) => p.total)).toFixed(1),
      compound: conflicts.filter((c) => c.type === 'compound').length, bundle: conflicts.filter((c) => c.type === 'bundle').length,
      clusters: clusters.length, biggestCluster: clusters[0]?.siteIds.length,
      topPriority: top.slice(0, 3).map((p) => `${p.site.title.slice(0, 40)} | ${p.reasons.join(' · ')}`),
      topGaps: gaps.slice(0, 3).map((g) => `${g.district} ${g.uncoveredSites.length}`),
      pressuredStops: stopsUnderPressure(sites, stops, today).slice(0, 3).map((p) => `${p.stop.name}:${p.sites.length}`),
      programme: balance.rows.length, holidays: holidays.map((h) => h.start).join(' '),
    };
    console.log(JSON.stringify(summary, null, 1));

    expect(sites.length).toBeGreaterThan(150);
    expect(kinds.full).toBeGreaterThan(50);
    expect(roadsCount.main).toBeGreaterThan(20);
    expect(byName.size).toBe(12);
    expect([...byName.values()].every((r) => r > 20_000)).toBe(true);
    expect(stops.length).toBeGreaterThan(100);
    expect(fire.length).toBeGreaterThan(5);
    expect(programme.length).toBeGreaterThan(400);
    expect(enrichMs).toBeLessThan(5000);
  }, 120_000);

  it('routes a real detour around today’s closures', async () => {
    const today = localToday();
    const [raw, roads] = await Promise.all([data.fetchSites(), data.fetchRoads()]);
    const sites = buildSites(raw, prepareContext({ roads, stops: [], fire: [], hospitals: [] })).filter((s) => s.start <= today && today <= s.end);
    // Along the long axis of full closures on main roads, 300 m beyond either end, until a normal route uses one.
    const beyondEnds = (closed: (typeof sites)[number]) => {
      const ring = closed.shape.polygons[0][0];
      let [p, q] = [ring[0], ring[1]];
      for (const a of ring) for (const b of ring) if (dist(a, b) > dist(p, q)) [p, q] = [a, b];
      const len = dist(p, q);
      const c = toXY(closed.center);
      const beyond = (to: XY): XY => [to[0] + ((to[0] - c[0]) / len) * 300, to[1] + ((to[1] - c[1]) / len) * 300];
      return [toLonLat(beyond(p)), toLonLat(beyond(q))];
    };
    let d = null;
    for (const closed of sites.filter((s) => s.kind === 'full' && s.road !== 'local').slice(0, 5)) {
      const [from, to] = beyondEnds(closed);
      d = await planDetour('commuter', from, to, sites);
      console.log(closed.title, '→', d.avoided.length ? 'avoided' : 'not on the normal route');
      if (d.avoided.length || d.blockedOnRoute.length) break;
    }
    d = d!;
    console.log(JSON.stringify({
      normalMin: (d.normal.seconds / 60).toFixed(1), awareMin: (d.aware.seconds / 60).toFixed(1), extraS: Math.round(d.extraS),
      avoided: d.avoided.map((s) => s.title), stillBlocked: d.blockedOnRoute.map((s) => s.title), slowed: d.slowedOnRoute.length, limit: d.limitReached,
    }, null, 1));
    expect(d.normal.line.length).toBeGreaterThan(10);
    expect(d.avoided.length).toBeLessThanOrEqual(MAX_CUTS);
  }, 120_000);
});
