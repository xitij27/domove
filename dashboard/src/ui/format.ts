import { formatDay, formatShort } from '../model/days';

export const metres = (m: number): string => (!Number.isFinite(m) ? '–' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
export const minutes = (s: number): string => `${(s / 60).toFixed(1)} min`;
export const one = (x: number): string => x.toFixed(1);
export const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`;
const year = (day: number) => new Date(day * 86_400_000).getUTCFullYear();
/** "4 – 20 Nov 2026", or both years when the range crosses one. */
export const dayRange = (a: number, b: number): string =>
  a === b ? formatDay(a) : `${year(a) === year(b) ? formatShort(a) : formatDay(a)} – ${formatDay(b)}`;
/** The street part of a feed title: "Stettiner Straße - Errichtung … // Vollsperrung" → "Stettiner Straße". */
export const shortTitle = (title: string): string => title.split(/ - | \/\/ /)[0].trim() || title;
/** "47 days later", "12 days earlier". */
export const shiftText = (days: number): string =>
  days === 0 ? 'on the published dates' : `${plural(Math.abs(days), 'day')} ${days > 0 ? 'later' : 'earlier'}`;
/** Clashes in plain numbers: "3 sites on 40 days", or "none". */
export const clashText = (o: { clashes: number; clashDays: number }): string =>
  o.clashes ? `${plural(o.clashes, 'site')} on ${plural(o.clashDays, 'day')}` : 'none';
