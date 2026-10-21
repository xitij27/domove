// A setting's value in words, and a plain hint beside it: how long a distance takes on foot, a duration in weeks or
// months, the band a severity falls in.
import { decimal } from '../i18n';
import type { Strings } from '../i18n';
import { bandOf, SETTINGS } from '../model/settings';
import type { SettingKey, Settings } from '../model/settings';
import { num } from './format';
import type { RulerKind } from './rulerScale';

const WALK_M_PER_MIN = 80;

export const settingText = (t: Strings['settings'], key: SettingKey, v: number): string => {
  const unit = SETTINGS[key].unit;
  return `${num(v)}${unit ? ` ${t.units[unit]}` : ''}`;
};

export function hintFor(kind: RulerKind, v: number, t: Strings, s: Settings): string {
  const c = t.settings.controls;
  if (kind === 'm') return v <= 3000 ? c.walk(Math.max(1, Math.round(v / WALK_M_PER_MIN))) : '';
  if (kind === 'days') return v >= 60 ? c.months(Math.round(v / 30)) : v >= 14 ? c.weeks(Math.round(v / 7)) : '';
  if (kind === 'severity') return t.bands[bandOf(v, s)];
  return '';
}

export function tickText(kind: RulerKind, v: number, t: Strings): string {
  if (kind === 'm') return v >= 1000 ? `${decimal(v / 1000, v % 1000 ? 1 : 0)} km` : `${v} m`;
  if (kind === 'days') return t.settings.controls.ticksDays[v] ?? String(v);
  return num(v);
}
