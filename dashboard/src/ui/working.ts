// The working behind each figure the dashboard derives, from the numbers and the settings the model used for it,
// in the dashboard's language.
import { decimal, strings, whole } from '../i18n';
import { PER_DAYS } from '../model/analysis';
import type { DistrictGap, Priority, WindowOption } from '../model/analysis';
import type { ImpactAssessment } from '../model/impact';
import type { CapacityResult, DistrictLoad, Params } from '../model/capacity';
import { formatDay, formatShort } from '../model/days';
import type { Settings } from '../model/settings';
import type { Site } from '../model/sites';
import type { Working } from './Derived';
import { dayRange, metres, num, pct, shortTitle, signed } from './format';

const pct1 = (x: number) => `${decimal(x * 100, 1)}%`;
const km = (cfg: Settings) => metres(cfg['clash.radius']);

/** "1 × 0.6 = 0.6": restriction weight × road weight. */
export const severityText = (s: Site, cfg: Settings): string => `${num(cfg[`weight.${s.kind}`])} × ${num(cfg[`road.${s.road}`])} = ${num(s.severity)}`;

export const severityWorking = (s: Site, cfg: Settings): Working => {
  const t = strings();
  return [
    [t.working.restriction, t.working.restrictionHow(t.kinds[s.kind], num(cfg[`weight.${s.kind}`]), s.kinds.length)],
    [t.working.road, t.working.roadHow(num(cfg[`road.${s.road}`]), t.roads[s.road])],
    [t.working.severity, t.working.severityHow(num(s.severity), num(cfg['band.high']), num(cfg['band.medium']))],
  ];
};

const worksRow = (d: DistrictLoad, cfg: Settings): [string, string] => {
  const w = strings().working;
  return [w.works, w.worksHow(d.sites.length, num(d.lost, 1), num(cfg['capacity.siteKm']), cfg['capacity.siteLanes.main'], cfg['capacity.siteLanes.secondary'], cfg['capacity.siteLanes.local'])];
};

/** A district's road load: its share of the traffic over its share of the open road. */
export function loadWorking(d: DistrictLoad, r: CapacityResult, p: Params, cfg: Settings): Working {
  const w = strings().working;
  const residents = d.residents / r.totalResidents;
  const roads = d.capacity / r.totalCapacity;
  const open = (d.capacity - d.lost) / r.totalCapacity;
  const through = cfg['capacity.through'];
  const rows: Working = [
    [w.residents, w.residentsHow(whole(d.residents), whole(r.totalResidents), pct1(residents))],
    [w.mainRoads, w.mainRoadsHow(whole(d.capacity), whole(r.totalCapacity), pct1(roads))],
    [w.trafficShare, w.trafficShareHow(pct(1 - through), pct1(residents), pct(through), pct1(roads), pct1(d.demand))],
  ];
  if (d.lost > 0) rows.push(worksRow(d, cfg), [w.openRoad, w.openRoadHow(num(d.capacity - d.lost, 1), pct1(open))]);
  rows.push([w.load, w.loadHow(pct(p.useToday), pct1(d.demand), pct1(open), pct((p.useToday * d.demand) / open))]);
  if (p.population * p.carUse !== 1) rows.push([w.growth, w.growthHow(num(p.population), num(p.carUse), pct(d.load!))]);
  if (d.lost > 0) rows.push([w.fromWorks, w.fromWorksHow(Math.round((d.load! - d.loadWithoutWorks!) * 100), pct(d.loadWithoutWorks!))]);
  return rows;
}

export const worksShareWorking = (d: DistrictLoad, cfg: Settings): Working => {
  const w = strings().working;
  return [worksRow(d, cfg), [w.share, w.shareHow(num(d.lost, 1), whole(d.capacity), pct(d.lost / d.capacity))]];
};

/** Room before a district is full, counted from today's levels whatever the sliders say. */
export function roomWorking(d: DistrictLoad, p: Params): Working {
  const w = strings().working;
  const growth = p.population * p.carUse;
  const today = d.load! / growth;
  return [
    [w.todayLoad, w.todayLoadHow(pct(today), growth !== 1 ? pct(d.load!) : null)],
    [w.room, w.roomHow(pct(today), signed(d.headroom!))],
  ];
}

export function citywideWorking(r: CapacityResult, p: Params): Working {
  const w = strings().working;
  const growth = p.population * p.carUse;
  return [
    [w.useToday, w.useTodayHow(pct(p.useToday))],
    [w.openRoad, w.cityRoadHow(whole(r.openCapacity), whole(r.totalCapacity), num(r.totalCapacity - r.openCapacity, 1))],
    [w.network, w.networkHow(pct(p.useToday), growth !== 1 ? num(growth) : null, whole(r.totalCapacity), whole(r.openCapacity), pct(r.citywide))],
  ];
}

export const transitWorking = (g: DistrictGap, cfg: Settings): Working => {
  const w = strings().working;
  return [
    [w.counted, w.noStopWorksHow(g.uncoveredSites.length, num(cfg['clash.minSeverity']), metres(cfg['reach.stop']), metres(cfg['reach.station']))],
    [w.residentsNear, w.residentsNearHow(whole(g.cutOff), metres(cfg['transit.near']))],
  ];
};

export function priorityWorking(p: Priority, rank: number, of: number, cfg: Settings): Working {
  const t = strings();
  const w = t.working;
  const { site: s, factors: f } = p;
  const near = s.fire.m <= cfg['reach.fire'] || s.hospital.m <= cfg['reach.hospital'];
  // the stop that keeps a work off the "no stop" list: the bus or tram stop, else the station
  const by = s.stop && s.stop.m <= cfg['reach.stop'] ? s.stop : s.station && s.station.m <= cfg['reach.station'] ? s.station : null;
  return [
    [w.severity, w.severityOn(t.kinds[s.kind], t.roads[s.road], severityText(s, cfg))],
    [w.severityCounted, w.severityPowerHow(num(s.severity), num(cfg['priority.severityPower']), num(f.severity))],
    [w.timeLeft, w.timeLeftHow(num(f.time), p.remaining, cfg['priority.horizon'], PER_DAYS)],
    [w.overlaps, w.overlapsHow(num(f.overlap), num(cfg['priority.perOverlap']), km(cfg), p.overlapping, cfg['priority.maxOverlaps'])],
    [w.fireHospital, f.emergency > 1 ? w.fireHospitalApplies(num(f.emergency), metres(cfg['reach.fire']), metres(cfg['reach.hospital']))
      : near ? w.fireHospitalPassable(num(f.emergency)) : w.fireHospitalFar(num(f.emergency), metres(cfg['reach.fire']), metres(cfg['reach.hospital']))],
    [w.stopNear, f.stop > 1 || !by ? w.noStop(num(f.stop), metres(cfg['reach.stop']), metres(cfg['reach.station'])) : w.stop(num(f.stop), by.name || '–', metres(by.m))],
    [w.score, w.scoreHow(num(p.score, 1), rank, of)],
  ];
}

export const freedWorking = (p: Priority, cfg: Settings): Working => {
  const w = strings().working;
  return [
    [w.overlapNow, w.overlapNowHow(p.overlapDays, p.overlapping, km(cfg))],
    [w.ending(cfg['priority.sooner']), w.endingHow(p.overlapDays - p.freedOverlapDays, p.freedOverlapDays)],
  ];
};

const clashList = (o: WindowOption): string => {
  const w = strings().working;
  return o.clashing.length
    ? w.clashTotal(o.clashing.map((c) => w.clashItem(shortTitle(c.site.title), c.to - c.from + 1)).join(' · '), o.clashDays)
    : w.none;
};
const countedRow = (cfg: Settings): [string, string] => {
  const w = strings().working;
  return [w.counted, w.countedHow(num(cfg['clash.minSeverity']), metres(cfg['together.radius']), km(cfg))];
};

/** "Clashes 3 sites on 40 days": which works, and for how many days each. */
export const clashWorking = (o: WindowOption, cfg: Settings): Working => [countedRow(cfg), [strings().working.clashes, clashList(o)]];

const cost = (o: WindowOption, severity: number, cfg: Settings) =>
  `${num(o.overlap)}${o.together ? ` − ${num(cfg['window.togetherCredit'])} × ${num(o.together)}` : ''} + ${num(severity)} × (${num(cfg['window.shiftCost'])} × ${Math.abs(o.shift)} − ${num(cfg['window.holidayBonus'])} × ${o.holidayDays}) = ${num(o.cost)}`;

/** A suggested move: the clashes and the cost the dates are chosen by, now and moved. */
export const moveWorking = (site: Site, now: WindowOption, moved: WindowOption, cfg: Settings): Working => {
  const w = strings().working;
  return [
    countedRow(cfg),
    [w.clashesNow, clashList(now)],
    [w.moved, clashList(moved)],
    [w.overlap, w.overlapHow(km(cfg))],
    [w.cost, w.costHow(num(cfg['window.togetherCredit']), num(cfg['window.shiftCost']), num(cfg['window.holidayBonus']))],
    [w.costNow, cost(now, site.severity, cfg)],
    [w.costMoved, cost(moved, site.severity, cfg)],
  ];
};

export const alignWorking = (first: Site, second: Site, start: number, cfg: Settings): Working => {
  const w = strings().working;
  return [
    [w.first, `${shortTitle(first.title)}, ${dayRange(first.start, first.end)}`],
    [w.second, `${shortTitle(second.title)}, ${dayRange(second.start, second.end)}`],
    [w.sameStretch, w.sameStretchHow(metres(cfg['together.radius']))],
    [w.start, w.startHow(formatShort(start))],
  ];
};

export const finishWorking = (site: Site, others: Site[]): Working => {
  const w = strings().working;
  return [
    [w.clashesWith, others.map((s) => shortTitle(s.title)).join(' · ')],
    [w.noMove, w.noMoveHow],
    [w.thisOne, w.thisOneHow(site.openEnded ? null : formatDay(site.end))],
  ];
};

/** The Construction Impact Score: each factor's 0–1 value × its share of the 100 points. */
export const impactWorking = (a: ImpactAssessment, cfg: Settings): Working => {
  const w = strings().working;
  return [
    ...a.factors.map((f): [string, string] => [f.label, f.value === null ? w.unknownShare(num(f.weight)) : `${num(f.value)} × ${num(f.weight)} = ${num(f.contribution!)}`]),
    [w.total, a.total === null ? w.notWorkedOut(a.missing.join(', ')) : w.outOf100(num(a.total))],
    [w.priority, w.priorityHow(cfg['impact.band.medium'], cfg['impact.band.high'], cfg['impact.band.veryHigh'])],
  ];
};
