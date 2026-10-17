import { formatDay, formatShort } from '../model/days';

export const metres = (m: number): string => (!Number.isFinite(m) ? '–' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
export const minutes = (s: number): string => `${(s / 60).toFixed(1)} min`;
export const signedDays = (n: number): string => (n === 0 ? '±0 days' : `${n > 0 ? '+' : '−'}${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'}`);
export const signedPct = (x: number): string => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(Math.round(x * 100))}\u00a0%`;
export const one = (x: number): string => x.toFixed(1);
export const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`;
const year = (day: number) => new Date(day * 86_400_000).getUTCFullYear();
/** "4 – 20 Nov 2026", or both years when the range crosses one. */
export const dayRange = (a: number, b: number): string =>
  a === b ? formatDay(a) : `${year(a) === year(b) ? formatShort(a) : formatDay(a)} – ${formatDay(b)}`;
