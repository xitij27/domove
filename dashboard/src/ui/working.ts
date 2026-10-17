// The working behind each figure the dashboard derives, from the numbers and the settings the model used for it.
import { PER_DAYS, PER_RESIDENTS } from '../model/analysis';
import type { DistrictGap, Priority, WindowOption } from '../model/analysis';
import type { ImpactAssessment } from '../model/impact';
import type { CapacityResult, DistrictLoad, Params } from '../model/capacity';
import { KIND_LABEL } from '../model/closures';
import { formatDay, formatShort } from '../model/days';
import type { Settings } from '../model/settings';
import { ROAD_LABEL } from '../model/sites';
import type { Site } from '../model/sites';
import type { Working } from './Derived';
import { dayRange, metres, num, pct, plural, shortTitle, signed } from './format';

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const whole = (x: number) => Math.round(x).toLocaleString('en-GB');
const km = (cfg: Settings) => metres(cfg['clash.radius']);

/** "1 × 0.6 = 0.6": restriction weight × road weight. */
export const severityText = (s: Site, cfg: Settings): string => `${num(cfg[`weight.${s.kind}`])} × ${num(cfg[`road.${s.road}`])} = ${num(s.severity)}`;

export const severityWorking = (s: Site, cfg: Settings): Working => [
  ['Restriction', `${KIND_LABEL[s.kind]}: ${num(cfg[`weight.${s.kind}`])}${s.kinds.length > 1 ? `, the heaviest of ${s.kinds.length} named` : ''} (full closure = 1)`],
  ['Road', `× ${num(cfg[`road.${s.road}`])} on a ${ROAD_LABEL[s.road]} (main road = 1)`],
  ['Severity', `${num(s.severity)}: high from ${num(cfg['band.high'])}, medium from ${num(cfg['band.medium'])}`],
];

const worksRow = (d: DistrictLoad, cfg: Settings): [string, string] =>
  ['Works', `${plural(d.sites.length, 'site')} close ${num(d.lost, 1)} lane-km: severity × ${num(cfg['capacity.siteKm'])} km × ${cfg['capacity.siteLanes.main']}, ${cfg['capacity.siteLanes.secondary']} or ${cfg['capacity.siteLanes.local']} lanes by road`];

/** A district's road load: its share of the traffic over its share of the open road. */
export function loadWorking(d: DistrictLoad, r: CapacityResult, p: Params, cfg: Settings): Working {
  const residents = d.residents / r.totalResidents;
  const roads = d.capacity / r.totalCapacity;
  const open = (d.capacity - d.lost) / r.totalCapacity;
  const through = cfg['capacity.through'];
  const rows: Working = [
    ['Residents', `${whole(d.residents)} of ${whole(r.totalResidents)}: ${pct1(residents)}`],
    ['Main roads', `${whole(d.capacity)} of ${whole(r.totalCapacity)} lane-km: ${pct1(roads)}`],
    ['Traffic share', `${pct(1 - through)} × ${pct1(residents)} + ${pct(through)} through traffic × ${pct1(roads)} = ${pct1(d.demand)}`],
  ];
  if (d.lost > 0) rows.push(worksRow(d, cfg), ['Open road', `${num(d.capacity - d.lost, 1)} lane-km: ${pct1(open)} of the city's`]);
  rows.push(['Load', `${pct(p.useToday)} road use today × ${pct1(d.demand)} ÷ ${pct1(open)} = ${pct((p.useToday * d.demand) / open)}`]);
  if (p.population * p.carUse !== 1) rows.push(['Growth', `× ${num(p.population)} residents × ${num(p.carUse)} car trips = ${pct(d.load!)}`]);
  if (d.lost > 0) rows.push(['From works', `+${Math.round((d.load! - d.loadWithoutWorks!) * 100)}: ${pct(d.loadWithoutWorks!)} without them`]);
  return rows;
}

export const worksShareWorking = (d: DistrictLoad, cfg: Settings): Working => [
  worksRow(d, cfg),
  ['Share', `${num(d.lost, 1)} ÷ ${whole(d.capacity)} lane-km = ${pct(d.lost / d.capacity)}`],
];

/** Room before a district is full, counted from today's levels whatever the sliders say. */
export function roomWorking(d: DistrictLoad, p: Params): Working {
  const growth = p.population * p.carUse;
  const today = d.load! / growth;
  return [
    ['Load at today\'s levels', `${pct(today)}${growth !== 1 ? ` (${pct(d.load!)} with your changes)` : ''}`],
    ['Room', `100% ÷ ${pct(today)} − 1 = ${signed(d.headroom!)}`],
  ];
}

export function citywideWorking(r: CapacityResult, p: Params): Working {
  const growth = p.population * p.carUse;
  return [
    ['Road use today', `${pct(p.useToday)} with no works: your assumption`],
    ['Open road', `${whole(r.openCapacity)} of ${whole(r.totalCapacity)} lane-km; works close ${num(r.totalCapacity - r.openCapacity, 1)} lane-km`],
    ['Network', `${pct(p.useToday)}${growth !== 1 ? ` × ${num(growth)} growth` : ''} × ${whole(r.totalCapacity)} ÷ ${whole(r.openCapacity)} = ${pct(r.citywide)}`],
  ];
}

export const transitWorking = (g: DistrictGap, cfg: Settings): Working => [
  ['Each closure', `counts its severity × the share of the ${cfg['transit.days']} days it runs`],
  ['Far from rail', `${plural(g.uncoveredSites.length, 'closure')} of severity ${num(cfg['clash.minSeverity'])}+ over ${metres(cfg['reach.rail'])} from a Stadtbahn stop: ${num(g.uncovered)}`],
  ['Main roads', `${plural(g.mainRoadSites.length, 'full, half or one-way closure')} where buses run: ${num(g.mainRoad)}, counted × ${num(cfg['transit.mainRoadShare'])}`],
  ['Need', `(${num(g.uncovered)} + ${num(cfg['transit.mainRoadShare'])} × ${num(g.mainRoad)}) ÷ ${num(g.residents / PER_RESIDENTS, 1)} (per ${whole(PER_RESIDENTS)} of ${whole(g.residents)} residents) = ${num(g.score)}`],
];

export function priorityWorking(p: Priority, rank: number, of: number, cfg: Settings): Working {
  const { site: s, factors: f } = p;
  return [
    ['Severity', `${KIND_LABEL[s.kind]} on a ${ROAD_LABEL[s.road]}: ${severityText(s, cfg)}`],
    ['Time left', `× ${num(f.time)}: ${plural(p.remaining, 'day')} left, today included and counted up to ${cfg['priority.horizon']} days ahead, ÷ ${PER_DAYS}`],
    ['Overlaps', `× ${num(f.overlap)}: 1 + ${num(cfg['priority.perOverlap'])} per site within ${km(cfg)} running too (${p.overlapping}), up to ${cfg['priority.maxOverlaps']} count`],
    ['Fire, hospital', `× ${num(f.emergency)}: ${f.emergency > 1 ? 'within' : 'none within'} ${metres(cfg['reach.fire'])} of a station or ${metres(cfg['reach.hospital'])} of a hospital`],
    ['Stadtbahn', `× ${num(f.rail)}: ${s.rail.m > cfg['reach.rail'] ? `no stop within ${metres(cfg['reach.rail'])}` : `${s.rail.name}, ${metres(s.rail.m)}`}`],
    ['Score', `${num(p.score, 1)}: #${rank} of ${of} running`],
  ];
}

export const freedWorking = (p: Priority, cfg: Settings): Working => [
  ['Overlap now', `${plural(p.overlapDays, 'day')}, added up over ${plural(p.overlapping, 'site')} within ${km(cfg)}`],
  [`Ending ${cfg['priority.sooner']} days sooner`, `${plural(p.overlapDays - p.freedOverlapDays, 'day')}: ${p.freedOverlapDays} fewer`],
];

const clashList = (o: WindowOption): string =>
  o.clashing.length
    ? `${o.clashing.map((c) => `${shortTitle(c.site.title)} ${plural(c.to - c.from + 1, 'day')}`).join(' · ')}; ${plural(o.clashDays, 'day')} with any`
    : 'none';
const countedRow = (cfg: Settings): [string, string] =>
  ['Counted', `works of severity ${num(cfg['clash.minSeverity'])}+ ${metres(cfg['together.radius'])} – ${km(cfg)} away, on the same days`];

/** "Clashes 3 sites on 40 days": which works, and for how many days each. */
export const clashWorking = (o: WindowOption, cfg: Settings): Working => [countedRow(cfg), ['Clashes', clashList(o)]];

const cost = (o: WindowOption, severity: number, cfg: Settings) =>
  `${num(o.overlap)}${o.together ? ` − ${num(cfg['window.togetherCredit'])} × ${num(o.together)}` : ''} + ${num(severity)} × (${num(cfg['window.shiftCost'])} × ${Math.abs(o.shift)} − ${num(cfg['window.holidayBonus'])} × ${o.holidayDays}) = ${num(o.cost)}`;

/** A suggested move: the clashes and the cost the dates are chosen by, now and moved. */
export const moveWorking = (site: Site, now: WindowOption, moved: WindowOption, cfg: Settings): Working => [
  countedRow(cfg),
  ['Clashes now', clashList(now)],
  ['Moved', clashList(moved)],
  ['Overlap', `severity × severity × days × (1 − distance ÷ ${km(cfg)}), added up over the clashes`],
  ['Cost', `overlap − ${num(cfg['window.togetherCredit'])} × overlap with works on the same stretch + severity × (${num(cfg['window.shiftCost'])} × days moved − ${num(cfg['window.holidayBonus'])} × school-holiday days); lowest wins`],
  ['Cost now', cost(now, site.severity, cfg)],
  ['Cost moved', cost(moved, site.severity, cfg)],
];

export const alignWorking = (first: Site, second: Site, start: number, cfg: Settings): Working => [
  ['First', `${shortTitle(first.title)}, ${dayRange(first.start, first.end)}`],
  ['Second', `${shortTitle(second.title)}, ${dayRange(second.start, second.end)}`],
  ['Same stretch', `within ${metres(cfg['together.radius'])} of each other`],
  ['Start', `${formatShort(start)}: while the first runs, from tomorrow at the earliest`],
];

export const finishWorking = (site: Site, others: Site[]): Working => [
  ['Clashes with', others.map((s) => shortTitle(s.title)).join(' · ')],
  ['No move', 'no planned works in the group can move to at least halve their overlap'],
  ['This one', `runs longest of the started works: ${site.openEnded ? 'no end date' : `until ${formatDay(site.end)}`}`],
];

/** The Construction Impact Score: each factor's 0–1 value × its share of the 100 points. */
export const impactWorking = (a: ImpactAssessment, cfg: Settings): Working => [
  ...a.factors.map((f): [string, string] => [f.label, f.value === null ? `unknown; share ${num(f.weight)} of 100` : `${num(f.value)} × ${num(f.weight)} = ${num(f.contribution!)}`]),
  ['Total', a.total === null ? `not worked out: ${a.missing.join(', ')} unknown` : `${num(a.total)} of 100`],
  ['Priority', `low up to ${cfg['impact.band.medium']}, medium up to ${cfg['impact.band.high']}, high up to ${cfg['impact.band.veryHigh']}, very high above`],
];
