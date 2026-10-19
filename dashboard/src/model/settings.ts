// Every weight and threshold the planner can change, with the limits that keep the formulas meaningful.
// The defaults are the judgement calls documented in docs/planner-dashboard.md.
import type { ClosureKind } from './closures';
import type { RoadClass } from './sites';

export type SettingGroup = 'severity' | 'clashes' | 'dates' | 'access' | 'priorities' | 'transit' | 'programme' | 'capacity' | 'impact';
export type SettingUnit =
  | 'lanes' | 'outOf100' | 'm' | 'km' | 'days' | 'sites' | 'projects' | 'points'
  | 'times' | 'timesSeverity' | 'timesOverlap' | 'timesExtra' | 'timesMiddle' | 'timesAll' | 'timesRoad';

/**
 * A weight or threshold and the limits that keep its formula meaningful. Its name, its unit and, where a formula sets
 * the limits, why they are there, are in the i18n strings under its key.
 */
export type Setting = {
  group: SettingGroup;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: SettingUnit;
};

// at most 1: no restriction or road weighs more than a full closure on a main road, which is 1 point
const weight = (value: number): Setting => ({ group: 'severity', value, min: 0, max: 1, step: 0.05 });
const lanes = (value: number, max: number): Setting => ({ group: 'capacity', value, min: 1, max, step: 1, unit: 'lanes' });
// the four shares are scaled to add up to 100
const share = (value: number): Setting => ({ group: 'impact', value, min: 0, max: 100, step: 5, unit: 'outOf100' });
const metres = (group: SettingGroup, value: number, min: number, max: number): Setting => ({ group, value, min, max, step: 10, unit: 'm' });

const TABLE = {
  // fixed: they define 1 disruption point
  'weight.full': { ...weight(1), min: 1, max: 1 },
  'weight.carriageway': weight(0.7),
  'weight.one_way': weight(0.6),
  'weight.half': weight(0.5),
  'weight.narrowing': weight(0.3),
  'weight.signal': weight(0.3),
  'weight.moving': weight(0.25),
  'weight.sidewalk': weight(0.2),
  'weight.unknown': weight(0.1),
  'weight.parking': weight(0.05),
  'road.main': { ...weight(1), min: 1, max: 1 },
  'road.secondary': weight(0.6),
  'road.local': weight(0.3),
  'band.high': { group: 'severity', value: 0.6, min: 0.5, max: 1, step: 0.05 },
  'band.medium': { group: 'severity', value: 0.3, min: 0.05, max: 0.45, step: 0.05 },

  'clash.radius': metres('clashes', 1000, 500, 2000),
  'clash.minSeverity': { group: 'clashes', value: 0.15, min: 0, max: 0.5, step: 0.05 },
  // Clash groups link only serious works close together: with every 1 km link the city centre chains into one group of 40+
  // sites that nobody can act on.
  'cluster.radius': metres('clashes', 400, 100, 500),
  'cluster.minSeverity': { group: 'clashes', value: 0.3, min: 0.1, max: 1, step: 0.05 },
  'together.radius': metres('clashes', 50, 10, 150),
  'together.maxGap': { group: 'clashes', value: 180, min: 7, max: 365, step: 1, unit: 'days' },

  'window.shiftCost': { group: 'dates', value: 0.03, min: 0, max: 0.2, step: 0.01, unit: 'timesSeverity' },
  'window.holidayBonus': { group: 'dates', value: 0.1, min: 0, max: 0.5, step: 0.01, unit: 'timesSeverity' },
  'window.togetherCredit': { group: 'dates', value: 0.5, min: 0, max: 1, step: 0.05, unit: 'timesOverlap' },

  'reach.rail': metres('access', 600, 200, 1500),
  'reach.fire': metres('access', 500, 100, 2000),
  'reach.hospital': metres('access', 300, 100, 2000),

  'priority.horizon': { group: 'priorities', value: 180, min: 30, max: 365, step: 5, unit: 'days' },
  'priority.perOverlap': { group: 'priorities', value: 0.5, min: 0, max: 2, step: 0.1, unit: 'timesExtra' },
  'priority.maxOverlaps': { group: 'priorities', value: 6, min: 1, max: 20, step: 1, unit: 'sites' },
  'priority.emergency': { group: 'priorities', value: 1.5, min: 1, max: 3, step: 0.1, unit: 'times' },
  'priority.noRail': { group: 'priorities', value: 1.5, min: 1, max: 3, step: 0.1, unit: 'times' },
  'priority.sooner': { group: 'priorities', value: 14, min: 1, max: 60, step: 1, unit: 'days' },

  'transit.days': { group: 'transit', value: 30, min: 7, max: 90, step: 1, unit: 'days' },
  'transit.mainRoadShare': { group: 'transit', value: 0.5, min: 0, max: 1, step: 0.05, unit: 'times' },
  'stop.minSeverity': { group: 'transit', value: 0.5, min: 0.1, max: 1, step: 0.05 },
  'stop.radius': metres('transit', 500, 100, 1500),

  'overload.min': { group: 'programme', value: 3, min: 1, max: 10, step: 1, unit: 'projects' },
  'overload.factor': { group: 'programme', value: 1.5, min: 1, max: 3, step: 0.1, unit: 'timesMiddle' },

  'capacity.through': { group: 'capacity', value: 0.4, min: 0, max: 0.9, step: 0.05, unit: 'timesAll' },
  'capacity.roadLanes.main': lanes(4, 8),
  'capacity.roadLanes.other': lanes(2, 6),
  'capacity.siteKm': { group: 'capacity', value: 0.3, min: 0.05, max: 2, step: 0.05, unit: 'km' },
  'capacity.siteLanes.main': lanes(4, 8),
  'capacity.siteLanes.secondary': lanes(2, 6),
  'capacity.siteLanes.local': lanes(1, 4),
  'capacity.maxLoss': { group: 'capacity', value: 0.9, min: 0.5, max: 0.95, step: 0.05, unit: 'timesRoad' },

  // The Construction Impact Score: four shares scaled to add up to 100, and the steps each factor's 0–1 value moves at.
  'impact.S': share(35),
  'impact.E': share(30),
  'impact.C': share(20),
  'impact.D': share(15),
  'impact.radius': metres('impact', 250, 100, 500),
  'impact.near': metres('impact', 100, 50, 150),
  'impact.mid': metres('impact', 250, 160, 300),
  'impact.far': metres('impact', 500, 310, 1000),
  'impact.short': { group: 'impact', value: 2, min: 1, max: 7, step: 1, unit: 'days' },
  'impact.medium': { group: 'impact', value: 14, min: 8, max: 21, step: 1, unit: 'days' },
  'impact.long': { group: 'impact', value: 30, min: 22, max: 90, step: 1, unit: 'days' },
  'impact.band.medium': { group: 'impact', value: 30, min: 10, max: 45, step: 5, unit: 'points' },
  'impact.band.high': { group: 'impact', value: 60, min: 50, max: 75, step: 5, unit: 'points' },
  'impact.band.veryHigh': { group: 'impact', value: 80, min: 80, max: 95, step: 5, unit: 'points' },
} satisfies Record<string, Setting> & Record<`weight.${ClosureKind}` | `road.${RoadClass}` | `capacity.siteLanes.${RoadClass}`, Setting>;

export type SettingKey = keyof typeof TABLE;
export const SETTINGS: Record<SettingKey, Setting> = TABLE;
export type Settings = Record<SettingKey, number>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export const DEFAULT_SETTINGS = Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTINGS[k].value])) as Settings;

/** The planner's changes over the defaults, from a shared link: unknown keys and values outside the limits are dropped. */
export function validSettings(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) =>
    Object.hasOwn(SETTINGS, k) && typeof v === 'number' && v >= SETTINGS[k as SettingKey].min && v <= SETTINGS[k as SettingKey].max));
}

export type Band = 'high' | 'medium' | 'low';
export const bandOf = (severity: number, s: Settings = DEFAULT_SETTINGS): Band =>
  severity >= s['band.high'] ? 'high' : severity >= s['band.medium'] ? 'medium' : 'low';
