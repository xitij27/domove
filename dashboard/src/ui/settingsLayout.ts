// How each Settings group is drawn: settings in the same unit share one ruler, so the panel shows a few scales with
// markers on them rather than a slider per number. Counts are steppers, the impact score's shares one bar.
import type { SettingGroup, SettingKey } from '../model/settings';
import type { RulerKind } from './rulerScale';

export type Control =
  | { type: 'table' }
  | { type: 'ruler'; kind: RulerKind; title: RulerTitle; keys: SettingKey[] }
  | { type: 'shares'; keys: SettingKey[] }
  | { type: 'steppers'; keys: SettingKey[] };
export type RulerTitle = 'distances' | 'durations' | 'severityFrom' | 'bands' | 'costs' | 'credit' | 'boosts' | 'perOverlap' | 'factor' | 'shares' | 'zone' | 'severityBands' | 'weight';

export const LAYOUT: Record<SettingGroup, Control[]> = {
  severity: [{ type: 'table' }],
  clashes: [
    { type: 'ruler', kind: 'm', title: 'distances', keys: ['together.radius', 'cluster.radius', 'clash.radius'] },
    { type: 'ruler', kind: 'severity', title: 'severityFrom', keys: ['clash.minSeverity', 'cluster.minSeverity'] },
    { type: 'ruler', kind: 'days', title: 'durations', keys: ['together.maxGap'] },
  ],
  dates: [
    { type: 'ruler', kind: 'plain', title: 'costs', keys: ['window.shiftCost', 'window.holidayBonus'] },
    { type: 'ruler', kind: 'plain', title: 'credit', keys: ['window.togetherCredit'] },
  ],
  access: [
    { type: 'ruler', kind: 'm', title: 'distances', keys: ['reach.hospital', 'reach.stop', 'reach.fire', 'reach.station'] },
  ],
  priorities: [
    { type: 'ruler', kind: 'days', title: 'durations', keys: ['priority.sooner', 'priority.horizon'] },
    { type: 'ruler', kind: 'plain', title: 'boosts', keys: ['priority.emergency', 'priority.noStop'] },
    { type: 'ruler', kind: 'plain', title: 'perOverlap', keys: ['priority.perOverlap'] },
    { type: 'steppers', keys: ['priority.severityPower', 'priority.maxOverlaps'] },
  ],
  transit: [
    { type: 'ruler', kind: 'm', title: 'distances', keys: ['transit.near', 'stop.radius'] },
    { type: 'ruler', kind: 'severity', title: 'severityFrom', keys: ['stop.minSeverity'] },
    { type: 'ruler', kind: 'days', title: 'durations', keys: ['transit.days'] },
  ],
  programme: [
    { type: 'steppers', keys: ['overload.min'] },
    { type: 'ruler', kind: 'plain', title: 'factor', keys: ['overload.factor'] },
  ],
  capacity: [
    { type: 'steppers', keys: ['capacity.roadLanes.main', 'capacity.roadLanes.other', 'capacity.siteLanes.main', 'capacity.siteLanes.secondary', 'capacity.siteLanes.local'] },
    { type: 'ruler', kind: 'plain', title: 'shares', keys: ['capacity.through', 'capacity.maxLoss'] },
    { type: 'ruler', kind: 'plain', title: 'zone', keys: ['capacity.siteKm'] },
  ],
  impact: [
    { type: 'shares', keys: ['impact.S', 'impact.E', 'impact.C', 'impact.D'] },
    { type: 'ruler', kind: 'm', title: 'distances', keys: ['impact.near', 'impact.radius', 'impact.mid', 'impact.far'] },
    { type: 'ruler', kind: 'days', title: 'durations', keys: ['impact.short', 'impact.medium', 'impact.long'] },
    { type: 'ruler', kind: 'points', title: 'bands', keys: ['impact.band.medium', 'impact.band.high', 'impact.band.veryHigh'] },
  ],
};

/** The settings a group's controls show; Severity's table shows the whole group. */
export const keysOf = (c: Control): SettingKey[] => ('keys' in c ? c.keys : []);
