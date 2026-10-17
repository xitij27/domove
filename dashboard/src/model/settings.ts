// Every weight and threshold the planner can change, with the limits that keep the formulas meaningful.
// The defaults are the judgement calls documented in docs/planner-dashboard.md.
import type { ClosureKind } from './closures';
import type { RoadClass } from './sites';

export type Setting = {
  group: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Why the range stops where it does, when a formula depends on it. */
  why?: string;
};

// at most 1: no restriction or road weighs more than a full closure on a main road, which is 1 point
const weight = (label: string, value: number): Setting => ({ group: 'Severity', label, value, min: 0, max: 1, step: 0.05 });
const lanes = (group: string, label: string, value: number, max: number): Setting => ({ group, label, value, min: 1, max, step: 1, unit: 'lanes' });
const metres = (group: string, label: string, value: number, min: number, max: number, why?: string): Setting => ({ group, label, value, min, max, step: 10, unit: 'm', why });

const TABLE = {
  'weight.full': { ...weight('Full closure', 1), min: 1, max: 1, why: 'fixed: it defines 1 disruption point' },
  'weight.carriageway': weight('One carriageway closed', 0.7),
  'weight.one_way': weight('One-way rule', 0.6),
  'weight.half': weight('Half closure', 0.5),
  'weight.narrowing': weight('Lane narrowing', 0.3),
  'weight.signal': weight('Temporary lights', 0.3),
  'weight.moving': weight('Moving works', 0.25),
  'weight.sidewalk': weight('Sidewalk closed', 0.2),
  'weight.unknown': weight('No restriction named', 0.1),
  'weight.parking': weight('Parking lane closed', 0.05),
  'road.main': { ...weight('Main road', 1), min: 1, max: 1, why: 'fixed: it defines 1 disruption point' },
  'road.secondary': weight('Through road', 0.6),
  'road.local': weight('Local street', 0.3),
  'band.high': { group: 'Severity', label: 'High disruption from', value: 0.6, min: 0.5, max: 1, step: 0.05, why: 'stays above where medium can start' },
  'band.medium': { group: 'Severity', label: 'Medium disruption from', value: 0.3, min: 0.05, max: 0.45, step: 0.05, why: 'stays below where high can start' },

  'clash.radius': metres('Clashes', 'Works clash within', 1000, 500, 2000, 'stays well above "same stretch", so the two never mix'),
  'clash.minSeverity': { group: 'Clashes', label: 'Works clash from severity', value: 0.15, min: 0, max: 0.5, step: 0.05 },
  // Clash groups link only serious works close together: with every 1 km link the city centre chains into one group of 40+
  // sites that nobody can act on.
  'cluster.radius': metres('Clashes', 'Clash groups link works within', 400, 100, 500, 'at most the clash distance'),
  'cluster.minSeverity': { group: 'Clashes', label: 'Clash groups link works from severity', value: 0.3, min: 0.1, max: 1, step: 0.05 },
  'together.radius': metres('Clashes', 'Same stretch within', 50, 10, 150, 'stays well below the clash distance'),
  'together.maxGap': { group: 'Clashes', label: 'Do together when at most this far apart', value: 180, min: 7, max: 365, step: 1, unit: 'days' },

  'window.shiftCost': { group: 'Best dates', label: 'Cost per day moved', value: 0.03, min: 0, max: 0.2, step: 0.01, unit: '× severity' },
  'window.holidayBonus': { group: 'Best dates', label: 'Credit per school-holiday day', value: 0.1, min: 0, max: 0.5, step: 0.01, unit: '× severity' },
  'window.togetherCredit': { group: 'Best dates', label: 'Credit for days shared on the same stretch', value: 0.5, min: 0, max: 1, step: 0.05, unit: '× overlap', why: 'at most the overlap itself' },

  'reach.rail': metres('Access', 'Stadtbahn in walking distance', 600, 200, 1500),
  'reach.fire': metres('Access', 'Near a fire and rescue station', 500, 100, 2000),
  'reach.hospital': metres('Access', 'Near a hospital', 300, 100, 2000),

  'priority.horizon': { group: 'Priorities', label: 'Days left count up to', value: 180, min: 30, max: 365, step: 5, unit: 'days' },
  'priority.perOverlap': { group: 'Priorities', label: 'Per overlapping site', value: 0.5, min: 0, max: 2, step: 0.1, unit: '× extra' },
  'priority.maxOverlaps': { group: 'Priorities', label: 'Overlapping sites count up to', value: 6, min: 1, max: 20, step: 1, unit: 'sites' },
  'priority.emergency': { group: 'Priorities', label: 'Near a fire station or hospital', value: 1.5, min: 1, max: 3, step: 0.1, unit: '×', why: 'from 1, so being near never lowers a rank' },
  'priority.noRail': { group: 'Priorities', label: 'No Stadtbahn in walking distance', value: 1.5, min: 1, max: 3, step: 0.1, unit: '×', why: 'from 1, so having no rail never lowers a rank' },
  'priority.sooner': { group: 'Priorities', label: 'Overlap saved by finishing sooner by', value: 14, min: 1, max: 60, step: 1, unit: 'days' },

  'transit.days': { group: 'Transit', label: 'Look ahead', value: 30, min: 7, max: 90, step: 1, unit: 'days' },
  'transit.mainRoadShare': { group: 'Transit', label: 'Main-road closures count', value: 0.5, min: 0, max: 1, step: 0.05, unit: '×' },
  'stop.minSeverity': { group: 'Transit', label: 'Stop under pressure: closures from severity', value: 0.5, min: 0.1, max: 1, step: 0.05 },
  'stop.radius': metres('Transit', 'Stop under pressure: closures within', 500, 100, 1500),

  'overload.min': { group: 'Works programme', label: 'Overloaded from', value: 3, min: 1, max: 10, step: 1, unit: 'projects' },
  'overload.factor': { group: 'Works programme', label: 'and from', value: 1.5, min: 1, max: 3, step: 0.1, unit: '× the middle district', why: 'from 1, so the middle district itself is never overloaded' },

  'capacity.through': { group: 'Road capacity', label: 'Through traffic', value: 0.4, min: 0, max: 0.9, step: 0.05, unit: '× of all', why: 'below 1, so where people live always counts' },
  'capacity.roadLanes.main': lanes('Road capacity', 'Lanes on a main road', 4, 8),
  'capacity.roadLanes.other': lanes('Road capacity', 'Lanes on another through street', 2, 6),
  'capacity.siteKm': { group: 'Road capacity', label: 'A work zone is this long', value: 0.3, min: 0.05, max: 2, step: 0.05, unit: 'km' },
  'capacity.siteLanes.main': lanes('Road capacity', 'Lanes works take on a main road', 4, 8),
  'capacity.siteLanes.secondary': lanes('Road capacity', 'Lanes works take on a through road', 2, 6),
  'capacity.siteLanes.local': lanes('Road capacity', 'Lanes works take on a local street', 1, 4),
  'capacity.maxLoss': { group: 'Road capacity', label: 'Works take at most', value: 0.9, min: 0.5, max: 0.95, step: 0.05, unit: '× of a district\'s road', why: 'below 1: a district with no road left would divide by zero' },
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
