// Dates as whole days since 1970-01-01 (UTC), so ranges are integer arithmetic.
export const DAY_MS = 86_400_000;

export const toDay = (iso: string): number => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
export const isoDay = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);
export const localToday = (now = new Date()): number =>
  Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);

const LONG = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
export const formatDay = (day: number): string => LONG.format(day * DAY_MS);
export const formatShort = (day: number): string => SHORT.format(day * DAY_MS);
export const formatMonth = (day: number): string => MONTH.format(day * DAY_MS);
export const monthStart = (day: number): number => {
  const d = new Date(day * DAY_MS);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY_MS);
};
export const nextMonth = (day: number): number => {
  const d = new Date(day * DAY_MS);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS);
};

/** Days that two inclusive ranges share. */
export const overlapDays = (aStart: number, aEnd: number, bStart: number, bEnd: number): number =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart) + 1);
