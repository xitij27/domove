// The planner's questions as pure functions of the sites (with the scenario's dates applied).
// Every weight and radius is here and in docs/planner-dashboard.md.
import { PERIODS } from '../data/sources';
import type { PeriodKey, Poi, ProgrammeProject } from '../data/sources';
import { KIND_LABEL } from './closures';
import { overlapDays } from './days';
import { pointShapeDist, toXY } from './geo';
import { NEIGHBOUR_RADIUS, ROAD_LABEL } from './sites';
import type { Neighbour, Site } from './sites';

/** Works this close are on the same stretch of street: better done together than one after the other. */
export const BUNDLE_RADIUS = 50;
export const BUNDLE_MAX_GAP = 180;
/** Below this severity (e.g. a parking lane, or a narrowing on a residential street) works don't compound. */
export const COMPOUND_MIN_SEVERITY = 0.15;
// Clusters link only works at least as disruptive as a half closure on a through road, within 400 m: with every
// 1 km link, the city centre chains into one cluster of 40+ sites that nobody can act on.
export const CLUSTER_MIN_SEVERITY = 0.3;
export const CLUSTER_RADIUS = 400;
const SHIFT_COST = 0.03; // per day moved, times the site's severity
const HOLIDAY_BONUS = 0.1; // per day in school holidays, times the site's severity
const RAIL_REACH = 600; // m: about a 7–8 minute walk to a Stadtbahn stop
const FIRE_REACH = 500;
const HOSPITAL_REACH = 300;

export type Band = 'high' | 'medium' | 'low';
export const bandOf = (severity: number): Band => (severity >= 0.6 ? 'high' : severity >= 0.3 ? 'medium' : 'low');
export const isActive = (s: Site, day: number): boolean => s.start <= day && day <= s.end;
export type DayRange = [number, number];

export type LoadPoint = { day: number; total: number; high: number; medium: number; low: number };

/** Summed severity of the active sites per day, split by band. */
export function dailyLoad(sites: Site[], from: number, to: number): LoadPoint[] {
  const n = to - from + 1;
  const diff = { high: new Float64Array(n + 1), medium: new Float64Array(n + 1), low: new Float64Array(n + 1) };
  for (const s of sites) {
    const a = Math.max(s.start, from);
    const b = Math.min(s.end, to);
    if (a > b) continue;
    const band = diff[bandOf(s.severity)];
    band[a - from] += s.severity;
    band[b - from + 1] -= s.severity;
  }
  const out: LoadPoint[] = [];
  let [high, medium, low] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    high += diff.high[i];
    medium += diff.medium[i];
    low += diff.low[i];
    out.push({ day: from + i, total: high + medium + low, high, medium, low });
  }
  return out;
}

export type Conflict = {
  a: string;
  b: string;
  type: 'compound' | 'bundle';
  m: number;
  /** The lower severity of the two. */
  minSeverity: number;
  /** compound: days both run; bundle: days between them. */
  days: number;
  from: number;
  to: number;
  score: number;
};

const duration = (s: Site) => s.end - s.start + 1;

/**
 * compound: works 50 m–1 km apart that run at the same time make each other's detours worse, so spread them out.
 * bundle: works on the same stretch at different times disrupt the same residents twice, so do them together.
 */
export function findConflicts(sites: Site[], neighbours: Map<string, Neighbour[]>, from: number, to: number): Conflict[] {
  const byId = new Map(sites.map((s) => [s.id, s]));
  const out: Conflict[] = [];
  for (const a of sites) {
    if (a.end < from || a.start > to) continue;
    for (const n of neighbours.get(a.id) ?? []) {
      const b = byId.get(n.id);
      if (!b || b.id <= a.id || b.end < from || b.start > to) continue;
      if (n.m <= BUNDLE_RADIUS) {
        if (overlapDays(a.start, a.end, b.start, b.end) > 0) continue; // already together
        const [first, second] = a.start <= b.start ? [a, b] : [b, a];
        const gap = second.start - first.end - 1;
        if (gap < 1 || gap > BUNDLE_MAX_GAP || second.start <= from) continue; // nothing can move any more
        const saved = Math.min(duration(a), duration(b), 365);
        out.push({ a: a.id, b: b.id, type: 'bundle', m: n.m, minSeverity: Math.min(a.severity, b.severity), days: gap, from: first.end + 1, to: second.start - 1, score: ((a.severity + b.severity) / 2) * saved });
      } else {
        if (Math.min(a.severity, b.severity) < COMPOUND_MIN_SEVERITY) continue;
        const start = Math.max(a.start, b.start, from);
        const end = Math.min(a.end, b.end, to);
        if (start > end) continue;
        const days = end - start + 1;
        out.push({ a: a.id, b: b.id, type: 'compound', m: n.m, minSeverity: Math.min(a.severity, b.severity), days, from: start, to: end, score: a.severity * b.severity * days * (1 - n.m / NEIGHBOUR_RADIUS) });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

export type Cluster = { id: string; siteIds: string[]; conflicts: Conflict[]; score: number; from: number; to: number };

/** Groups of serious works close together at the same time, worst first. */
export function clusterConflicts(conflicts: Conflict[]): Cluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const compound = conflicts.filter((c) => c.type === 'compound' && c.m <= CLUSTER_RADIUS && c.minSeverity >= CLUSTER_MIN_SEVERITY);
  for (const c of compound) {
    for (const id of [c.a, c.b]) if (!parent.has(id)) parent.set(id, id);
    parent.set(find(c.a), find(c.b));
  }
  const groups = new Map<string, Conflict[]>();
  for (const c of compound) groups.set(find(c.a), [...(groups.get(find(c.a)) ?? []), c]);
  return [...groups.values()]
    .map((cs) => {
      const siteIds = [...new Set(cs.flatMap((c) => [c.a, c.b]))].sort();
      return {
        id: siteIds[0],
        siteIds,
        conflicts: cs,
        score: cs.reduce((sum, c) => sum + c.score, 0),
        from: Math.min(...cs.map((c) => c.from)),
        to: Math.max(...cs.map((c) => c.to)),
      };
    })
    .sort((x, y) => y.score - x.score);
}

export type WindowOption = {
  start: number;
  end: number;
  shift: number;
  /** Severity-weighted overlap days with works 50 m–1 km away. */
  overlap: number;
  /** Severity-weighted days shared with works on the same stretch. */
  together: number;
  /** In plain numbers: how many of those works 50 m–1 km away it runs alongside, and on how many days. */
  clashes: number;
  clashDays: number;
  holidayDays: number;
  afterHorizon: boolean;
  cost: number;
};
export type WindowAdvice = { current: WindowOption; options: WindowOption[] };

/**
 * The best start dates for a site that hasn't started: least overlap with works nearby, most overlap with works on the
 * same stretch, a few days in school holidays, and not too far from the published date (later works aren't known yet).
 * The first option is the smallest move that gets close to the best; the others are the next best by cost.
 */
export function bestWindows(
  site: Site, sites: Site[], neighbours: Neighbour[], holidays: DayRange[], today: number, horizon: number | null,
): WindowAdvice {
  const byId = new Map(sites.map((s) => [s.id, s]));
  const length = site.end - site.start;
  const evaluate = (start: number): WindowOption => {
    const end = start + length;
    let overlap = 0;
    let together = 0;
    const clashing: DayRange[] = [];
    for (const n of neighbours) {
      const o = byId.get(n.id);
      if (!o) continue;
      const days = overlapDays(start, end, o.start, o.end);
      if (!days) continue;
      if (n.m <= BUNDLE_RADIUS) together += site.severity * o.severity * days;
      else if (Math.min(site.severity, o.severity) >= COMPOUND_MIN_SEVERITY) {
        overlap += site.severity * o.severity * days * (1 - n.m / NEIGHBOUR_RADIUS);
        clashing.push([Math.max(start, o.start), Math.min(end, o.end)]);
      }
    }
    const holidayDays = holidays.reduce((sum, [a, b]) => sum + overlapDays(start, end, a, b), 0);
    const shift = start - site.baseStart;
    const cost = overlap - 0.5 * together + site.severity * (SHIFT_COST * Math.abs(shift) - HOLIDAY_BONUS * holidayDays);
    return {
      start, end, shift, overlap, together, clashes: clashing.length, clashDays: unionDays(clashing), holidayDays,
      afterHorizon: horizon !== null && start > horizon, cost,
    };
  };
  const current = evaluate(site.start);
  const earliest = site.hypothetical ? Math.max(today, site.baseStart) : Math.max(today + 1, site.baseStart - 30);
  const latest = site.baseStart + (site.hypothetical ? 180 : 90);
  const candidates: WindowOption[] = [];
  for (let start = earliest; start <= latest; start++) if (start !== site.start) candidates.push(evaluate(start));
  const minGain = Math.max(0.1, Math.abs(current.cost) * 0.1);
  const byCost = [...candidates].sort((x, y) => x.cost - y.cost);
  const bestGain = byCost.length ? current.cost - byCost[0].cost : 0;
  if (bestGain < minGain) return { current, options: [] };
  // Planners move works as little as they can: lead with the smallest move that gets 90 % of the best result.
  const gentlest = candidates
    .filter((c) => current.cost - c.cost >= 0.9 * bestGain)
    .sort((x, y) => Math.abs(x.shift) - Math.abs(y.shift) || x.cost - y.cost)[0];
  const options: WindowOption[] = [gentlest];
  for (const c of byCost) {
    if (options.length === 3 || current.cost - c.cost < minGain) break;
    if (options.every((o) => Math.abs(o.start - c.start) >= 7)) options.push(c);
  }
  return { current, options };
}

/** Days covered by at least one of the ranges. */
function unionDays(ranges: DayRange[]): number {
  let total = 0;
  let reach = -Infinity;
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    if (b <= reach) continue;
    total += b - Math.max(a, reach + 1) + 1;
    reach = b;
  }
  return total;
}

/** For a cluster: the one move worth asking an owner for, or else (option null) the running works to finish sooner. */
export type ClusterAdvice = { site: Site; option: WindowOption; current: WindowOption } | { site: Site; option: null };

export function adviseClusters(
  clusters: Cluster[], byId: Map<string, Site>, sites: Site[], neighbours: Map<string, Neighbour[]>,
  holidays: DayRange[], today: number, horizon: number | null,
): Map<string, ClusterAdvice | null> {
  return new Map(clusters.map((c): [string, ClusterAdvice | null] => {
    const members = c.siteIds.map((id) => byId.get(id)).filter((s): s is Site => !!s);
    let best: { advice: ClusterAdvice; gain: number } | null = null;
    for (const s of members.filter((m) => m.hypothetical || m.baseStart > today)) {
      const advice = bestWindows(s, sites, neighbours.get(s.id) ?? [], holidays, today, horizon);
      // only a move that at least halves the site's overlap is worth asking an owner for
      const option = advice.options.find((o) => o.overlap <= 0.5 * advice.current.overlap);
      const gain = option ? advice.current.cost - option.cost : 0;
      if (option && (!best || gain > best.gain)) best = { advice: { site: s, option, current: advice.current }, gain };
    }
    if (best) return [c.id, best.advice];
    // otherwise the works that keep the cluster going longest are the ones to speed up
    const longest = members.filter((s) => !s.hypothetical && s.baseStart <= today).sort((a, b) => b.end - a.end || b.severity - a.severity)[0];
    return [c.id, longest ? { site: longest, option: null } : null];
  }));
}

/** One decision for the planner, in the order the To do list shows them. */
export type Todo =
  | { kind: 'move'; site: Site; option: WindowOption; current: WindowOption }
  | { kind: 'align'; first: Site; second: Site; start: number; days: number }
  | { kind: 'finish'; site: Site; cluster: Cluster }
  | { kind: 'transit'; gap: DistrictGap };

/** Every action the views suggest, none left out: moves, works to do together, works to finish sooner, districts needing transit help. */
export function todoList(
  clusters: Cluster[], advice: Map<string, ClusterAdvice | null>, bundles: Conflict[], byId: Map<string, Site>, gaps: DistrictGap[], today: number,
): Todo[] {
  const moves: Todo[] = [];
  const finish: Todo[] = [];
  for (const c of clusters) {
    const a = advice.get(c.id);
    if (a?.option) moves.push({ kind: 'move', site: a.site, option: a.option, current: a.current });
    else if (a) finish.push({ kind: 'finish', site: a.site, cluster: c });
  }
  const aligns = bundles.flatMap((b): Todo[] => {
    const [first, second] = [byId.get(b.a), byId.get(b.b)].sort((x, y) => (x?.start ?? 0) - (y?.start ?? 0));
    return first && second ? [{ kind: 'align', first, second, start: Math.max(today + 1, first.start), days: b.days }] : [];
  });
  const transit = gaps.filter((g) => g.score > 0).map((gap): Todo => ({ kind: 'transit', gap }));
  return [...moves, ...aligns, ...finish, ...transit];
}

export type Priority = { site: Site; score: number; remaining: number; overlapping: number; freedOverlapDays: number; reasons: string[] };

/** Running works ranked by how much finishing them sooner would help. */
export function priorities(sites: Site[], neighbours: Map<string, Neighbour[]>, day: number, earlier = 14): Priority[] {
  const byId = new Map(sites.map((s) => [s.id, s]));
  return sites
    .filter((s) => isActive(s, day) && !s.hypothetical && s.severity >= COMPOUND_MIN_SEVERITY)
    .map((s) => {
      const remaining = Math.min(s.end, day + 180) - day + 1;
      let overlapping = 0;
      let freedOverlapDays = 0;
      for (const n of neighbours.get(s.id) ?? []) {
        const o = byId.get(n.id);
        if (!o || o.severity < COMPOUND_MIN_SEVERITY) continue;
        const now = overlapDays(day, s.end, o.start, o.end);
        if (!now) continue;
        overlapping++;
        freedOverlapDays += now - overlapDays(day, s.end - earlier, o.start, o.end);
      }
      const nearFire = s.fire.m <= FIRE_REACH;
      const nearHospital = s.hospital.m <= HOSPITAL_REACH;
      const noRail = s.rail.m > RAIL_REACH;
      const score = s.severity * (remaining / 30) * (1 + 0.5 * Math.min(overlapping, 6)) * (nearFire || nearHospital ? 1.5 : 1) * (noRail ? 1.5 : 1);
      const reasons = [
        `${KIND_LABEL[s.kind]} on a ${ROAD_LABEL[s.road]}${s.roadName ? ` (${s.roadName})` : ''}`,
        overlapping ? `${overlapping} overlapping ${overlapping === 1 ? 'site' : 'sites'} within 1 km` : '',
        nearFire ? `${Math.round(s.fire.m)} m from ${s.fire.name}` : '',
        nearHospital ? `${Math.round(s.hospital.m)} m from ${s.hospital.name}` : '',
        noRail ? `No Stadtbahn within ${RAIL_REACH} m` : '',
        s.openEnded ? 'No end date in the feed' : '',
        s.start < day - 365 ? `Running since ${new Date(s.start * 86_400_000).getUTCFullYear()}` : '',
      ].filter(Boolean);
      return { site: s, score, remaining, overlapping, freedOverlapDays, reasons };
    })
    .sort((x, y) => y.score - x.score);
}

export type DistrictGap = {
  district: string;
  residents: number;
  exposure: number;
  uncovered: number;
  mainRoad: number;
  /** (uncovered + half the main-road closures) per 10,000 residents */
  score: number;
  uncoveredSites: Site[];
  mainRoadSites: Site[];
};

const BUS_PROXY_KINDS = new Set(['full', 'half', 'carriageway', 'one_way']);

/**
 * Per district over the window: disruption with no Stadtbahn stop in walking distance, and closures on main roads,
 * where buses run (there's no open bus-stop data), per 10,000 residents.
 */
export function transitGaps(sites: Site[], residents: Map<string, number>, from: number, days = 30): DistrictGap[] {
  const to = from + days - 1;
  const byDistrict = new Map<string, DistrictGap>();
  for (const s of sites) {
    const d = overlapDays(s.start, s.end, from, to);
    if (!d || !s.district) continue;
    const gap = byDistrict.get(s.district) ?? {
      district: s.district, residents: residents.get(s.district) ?? 0, exposure: 0, uncovered: 0, mainRoad: 0, score: 0, uncoveredSites: [], mainRoadSites: [],
    };
    const w = (s.severity * d) / days;
    gap.exposure += w;
    if (s.rail.m > RAIL_REACH && s.severity >= COMPOUND_MIN_SEVERITY) {
      gap.uncovered += w;
      gap.uncoveredSites.push(s);
    }
    if (s.road === 'main' && s.kinds.some((k) => BUS_PROXY_KINDS.has(k))) {
      gap.mainRoad += w;
      gap.mainRoadSites.push(s);
    }
    byDistrict.set(s.district, gap);
  }
  return [...byDistrict.values()]
    .map((g) => ({
      ...g,
      score: g.residents ? (g.uncovered + 0.5 * g.mainRoad) / (g.residents / 10_000) : 0,
      uncoveredSites: g.uncoveredSites.sort((x, y) => y.severity - x.severity),
      mainRoadSites: g.mainRoadSites.sort((x, y) => y.severity - x.severity),
    }))
    .sort((x, y) => y.score - x.score);
}

export type StopPressure = { stop: Poi; sites: Site[] };

/** Stadtbahn stops with at least two serious closures within 500 m: expect people switching from the car. */
export function stopsUnderPressure(sites: Site[], stops: Poi[], from: number, days = 30): StopPressure[] {
  const to = from + days - 1;
  const serious = sites.filter((s) => s.severity >= 0.5 && overlapDays(s.start, s.end, from, to) > 0);
  return stops
    .map((stop) => {
      const xy = toXY(stop.at);
      return { stop, sites: serious.filter((s) => pointShapeDist(xy, s.shape) <= 500) };
    })
    .filter((p) => p.sites.length >= 2)
    .sort((x, y) => y.sites.length - x.sites.length);
}

export const poisNear = (pois: Poi[], sites: Site[], m: number): Poi[] =>
  pois.filter((p) => {
    const xy = toXY(p.at);
    return sites.some((s) => pointShapeDist(xy, s.shape) <= m);
  });

export type ProgrammeCell = { count: number; mainRoad: number; projects: ProgrammeProject[]; overloaded: boolean };
export type ProgrammeBalance = { rows: string[]; cells: Map<string, Record<PeriodKey, ProgrammeCell>>; medians: Record<PeriodKey, number> };

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** Tiefbauamt projects in construction ("Bau") per district and period; a cell 1.5x the period's median is overloaded. */
export function programmeBalance(projects: ProgrammeProject[], districts: string[]): ProgrammeBalance {
  const extra = [...new Set(projects.map((p) => p.district))].filter((d) => d && !districts.includes(d)).sort((a, b) =>
    a === 'Citywide' ? 1 : b === 'Citywide' ? -1 : a.localeCompare(b));
  const rows = [...districts, ...extra];
  const empty = (): Record<PeriodKey, ProgrammeCell> =>
    Object.fromEntries(PERIODS.map(([key]): [PeriodKey, ProgrammeCell] => [key, { count: 0, mainRoad: 0, projects: [], overloaded: false }])) as Record<PeriodKey, ProgrammeCell>;
  const cells = new Map(rows.map((r) => [r, empty()]));
  for (const p of projects) {
    const row = cells.get(p.district);
    if (!row) continue;
    for (const [key] of PERIODS) {
      if (p.stages[key].toLowerCase() !== 'bau') continue;
      row[key].count++;
      row[key].mainRoad += p.mainRoad ? 1 : 0;
      row[key].projects.push(p);
    }
  }
  const medians = Object.fromEntries(PERIODS.map(([key]) => [key, median(districts.map((d) => cells.get(d)![key].count))])) as Record<PeriodKey, number>;
  for (const d of districts) {
    for (const [key] of PERIODS) {
      const cell = cells.get(d)![key];
      cell.overloaded = cell.count >= 3 && cell.count >= 1.5 * medians[key];
    }
  }
  return { rows, cells, medians };
}
