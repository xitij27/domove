// Which days the timeline shows, and where its axis is labelled.
import type { LoadPoint } from '../model/analysis';
import { monthStart, nextMonth } from '../model/days';

/** Days shown after the last published start: what is already announced runs on, nothing new is known. */
const AFTER_PLANS = 28;
/** Days shown after a work the scenario moved or added starts. */
const AFTER_MOVED = 14;
/** Days shown when no works are planned at all. */
const NOTHING_PLANNED = 56;
/** The least room between two axis labels, in px. */
const LABEL_GAP = 56;

type RangeInput = {
  today: number;
  /** The day shown on the map. */
  date: number;
  /** The last start of a published planned work, if any. */
  horizon: number | null;
  /** Starts of the works the scenario moved or added. */
  moved: number[];
  /** The days the dashboard covers. */
  min: number;
  max: number;
};

/**
 * From today, or the chosen day if it lies before; to four weeks after the last published start, far enough to
 * show the chosen day and the works the scenario moved. Days before today miss the works that have ended,
 * and later days miss the works not yet announced, so neither is shown unless asked for.
 */
export function chartRange({ today, date, horizon, moved, min, max }: RangeInput): { from: number; to: number } {
  const end = horizon === null ? today + NOTHING_PLANNED : Math.max(horizon, today) + AFTER_PLANS;
  return {
    from: Math.max(min, Math.min(today, date)),
    to: Math.min(max, Math.max(end, date, ...moved.map((day) => day + AFTER_MOVED))),
  };
}

export type Tick = { day: number; kind: 'week' | 'month' };

// Day 4 (5 Jan 1970) was a Monday.
const isMonday = (day: number) => (day - 4) % 7 === 0;
const weekIndex = (day: number) => Math.floor((day - 4) / 7);
const MONTH_STEPS = [1, 2, 3, 4, 6, 12];

/**
 * Mondays, every week or every few, while that keeps the labels apart; month starts for longer ranges. The steps
 * count from a fixed day, so a label stays on its day as the range grows.
 */
export function dayTicks(from: number, to: number, pxPerDay: number): Tick[] {
  const weeks = Math.ceil(LABEL_GAP / (7 * pxPerDay));
  if (weeks <= 4) {
    const out: Tick[] = [];
    for (let day = from; day <= to; day++) if (isMonday(day) && weekIndex(day) % weeks === 0) out.push({ day, kind: 'week' });
    return out;
  }
  const months = MONTH_STEPS.find((m) => m >= LABEL_GAP / (30.4 * pxPerDay)) ?? 12;
  const out: Tick[] = [];
  for (let day = monthStart(from) < from ? nextMonth(from) : from; day <= to; day = nextMonth(day)) {
    if (new Date(day * 86_400_000).getUTCMonth() % months === 0) out.push({ day, kind: 'month' });
  }
  return out;
}

/** The day with the most sites; the earliest of a tie. */
export const busiest = (points: LoadPoint[]): LoadPoint =>
  points.reduce((a, b) => (b.count.total > a.count.total ? b : a));

/** The days in Monday-to-Sunday weeks, each with its busiest day. */
export function weekRows(points: LoadPoint[]): { from: number; to: number; peak: LoadPoint }[] {
  const weeks: LoadPoint[][] = [];
  for (const p of points) {
    if (!weeks.length || isMonday(p.day)) weeks.push([]);
    weeks[weeks.length - 1].push(p);
  }
  return weeks.map((days) => ({ from: days[0].day, to: days[days.length - 1].day, peak: busiest(days) }));
}

/** The axis top for a count: 2, 4, 6 or 10 times a power of ten, at least 2, so its half is a whole number too. */
export function countMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return ([2, 4, 6, 10].find((m) => m * p >= v) ?? 10) * p;
}
