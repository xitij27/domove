import { decimal, getLanguage, strings } from '../i18n';
import { formatDay, formatShort } from '../model/days';

export const metres = (m: number): string => (!Number.isFinite(m) ? '–' : m >= 1000 ? `${decimal(m / 1000, 1)} km` : `${Math.round(m / 10) * 10} m`);
export const minutes = (s: number): string => `${decimal(s / 60, 1)} min`;
export const one = (x: number): string => decimal(x, 1);
/** Up to two decimals, no trailing zeros: 0.18, 1, 22.5 (0,18, 1, 22,5 in German). */
export const num = (x: number, digits = 2): string => {
  const text = String(+x.toFixed(digits)).replace('-', '−');
  return getLanguage() === 'de' ? text.replace('.', ',') : text;
};
export const pct = (x: number): string => `${Math.round(x * 100)}%`;
export const signed = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;
const year = (day: number) => new Date(day * 86_400_000).getUTCFullYear();
/** "4 – 20 Nov 2026", or both years when the range crosses one. */
export const dayRange = (a: number, b: number): string =>
  a === b ? formatDay(a) : `${year(a) === year(b) ? formatShort(a) : formatDay(a)} – ${formatDay(b)}`;
/** The street part of a feed title: "Stettiner Straße - Errichtung … // Vollsperrung" → "Stettiner Straße". */
export const shortTitle = (title: string): string => title.split(/ - | \/\/ /)[0].trim() || title;
/** "47 days later", "12 days earlier". */
export const shiftText = (days: number): string => (days === 0 ? strings().format.publishedDates : strings().format.shift(days));
/** Clashes in plain numbers: "3 sites on 40 days", or "none". */
export const clashText = (o: { clashes: number; clashDays: number }): string =>
  o.clashes ? strings().format.clashes(o.clashes, o.clashDays) : strings().format.none;
