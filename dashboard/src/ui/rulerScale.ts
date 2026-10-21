// The scale a ruler in Settings draws its settings on: where a value sits, which values get a tick, and how a drag or
// an arrow key turns back into a value the setting allows. Distances and durations that span a lot are drawn on a log
// scale, so 50 m and 2 km, or 2 days and a year, both get room.
import { SETTINGS } from '../model/settings';
import type { SettingKey } from '../model/settings';

export type RulerKind = 'm' | 'days' | 'severity' | 'points' | 'plain';
export type Scale = { lo: number; hi: number; log: boolean };

const TICKS: Record<RulerKind, number[]> = {
  m: [10, 25, 50, 100, 250, 500, 1000, 2000, 3000],
  days: [1, 7, 14, 30, 90, 180, 365],
  severity: [0, 0.25, 0.5, 0.75, 1],
  points: [0, 25, 50, 75, 100],
  plain: [],
};

/** From the lowest any of the settings allows to the highest; severity and points always span their whole range. */
export function scaleFor(kind: RulerKind, keys: SettingKey[]): Scale {
  if (kind === 'severity') return { lo: 0, hi: 1, log: false };
  if (kind === 'points') return { lo: 0, hi: 100, log: false };
  const lo = Math.min(...keys.map((k) => SETTINGS[k].min));
  const hi = Math.max(...keys.map((k) => SETTINGS[k].max));
  return { lo, hi, log: (kind === 'm' || kind === 'days') && lo > 0 && hi / lo > 8 };
}

/** Where a value sits along the ruler, from 0 to 1. */
export function position(v: number, s: Scale): number {
  if (s.hi === s.lo) return 0;
  const f = s.log ? (Math.log(v) - Math.log(s.lo)) / (Math.log(s.hi) - Math.log(s.lo)) : (v - s.lo) / (s.hi - s.lo);
  return Math.min(1, Math.max(0, f));
}

/** The value at a place along the ruler. */
export function valueAt(f: number, s: Scale): number {
  return s.log ? Math.exp(Math.log(s.lo) + f * (Math.log(s.hi) - Math.log(s.lo))) : s.lo + f * (s.hi - s.lo);
}

/** The nearest value the setting allows: on its step, within its limits. */
export function snap(key: SettingKey, v: number): number {
  const { min, max, step } = SETTINGS[key];
  const stepped = min + Math.round((v - min) / step) * step;
  return +Math.min(max, Math.max(min, stepped)).toFixed(6);
}

export function ticks(kind: RulerKind, s: Scale): number[] {
  const inside = TICKS[kind].filter((t) => t >= s.lo && t <= s.hi);
  return inside.length >= 2 ? inside : [s.lo, s.hi];
}

/** Steps a keyboard press moves: the setting's own step, or ten of them with Shift. */
export const nudge = (key: SettingKey, v: number, direction: 1 | -1, big: boolean): number =>
  snap(key, v + direction * SETTINGS[key].step * (big ? 10 : 1));
