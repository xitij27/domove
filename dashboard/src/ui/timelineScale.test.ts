import { describe, expect, it } from 'vitest';
import type { LoadPoint } from '../model/analysis';
import { busiest, chartRange, countMax, dayTicks, weekRows } from './timelineScale';

// Day 102 is a Monday (5 Jan 1970 is day 4).
const point = (day: number, sites: number): LoadPoint => ({
  day, total: sites / 2, high: sites / 2, medium: 0, low: 0, count: { high: sites, medium: 0, low: 0, total: sites },
});
const base = { today: 100, date: 100, horizon: 120, moved: [], min: 70, max: 465 };

describe('chartRange', () => {
  it('runs from today to four weeks after the last published start', () => {
    expect(chartRange(base)).toEqual({ from: 100, to: 148 });
  });

  it('reaches back to a chosen day before today', () => {
    expect(chartRange({ ...base, date: 90 }).from).toBe(90);
  });

  it('reaches forward to a chosen day after the plans end', () => {
    expect(chartRange({ ...base, date: 200 }).to).toBe(200);
  });

  it('shows two weeks past the start of a work the scenario moved', () => {
    expect(chartRange({ ...base, moved: [300] }).to).toBe(314);
  });

  it('shows eight weeks when no works are planned', () => {
    expect(chartRange({ ...base, horizon: null }).to).toBe(156);
  });

  it('counts four weeks from today when every planned start has passed', () => {
    expect(chartRange({ ...base, horizon: 95 }).to).toBe(128);
  });

  it('stays within the days the dashboard covers', () => {
    expect(chartRange({ ...base, moved: [600], date: 60 })).toEqual({ from: 70, to: 465 });
  });
});

describe('dayTicks', () => {
  it('labels every Monday when the weeks are wide', () => {
    expect(dayTicks(100, 148, 20)).toEqual([102, 109, 116, 123, 130, 137, 144].map((day) => ({ day, kind: 'week' })));
  });

  it('labels every other Monday when the weeks are narrow', () => {
    expect(dayTicks(100, 148, 5).map((t) => t.day)).toEqual([102, 116, 130, 144]);
  });

  it('labels quarters for a long range on a narrow chart', () => {
    // 1 Jul, 1 Oct 1970, 1 Jan and 1 Apr 1971
    expect(dayTicks(100, 465, 0.8)).toEqual([181, 273, 365, 455].map((day) => ({ day, kind: 'month' })));
  });
});

describe('busiest', () => {
  it('finds the day with the most sites, the earliest of a tie', () => {
    expect(busiest([point(100, 3), point(101, 5), point(102, 5), point(103, 1)]).day).toBe(101);
  });
});

describe('weekRows', () => {
  it('splits the days into Monday-to-Sunday weeks, each with its busiest day', () => {
    const points = [point(100, 1), point(101, 2), ...[3, 9, 4, 4, 4, 4, 4].map((n, i) => point(102 + i, n)), point(109, 7), point(110, 8)];
    expect(weekRows(points).map((w) => [w.from, w.to, w.peak.day])).toEqual([[100, 101, 101], [102, 108, 103], [109, 110, 110]]);
  });
});

describe('countMax', () => {
  it('rounds up to a top whose half is a whole number of sites', () => {
    expect([0, 1, 3, 4.5, 7, 45, 168].map(countMax)).toEqual([2, 2, 4, 6, 10, 60, 200]);
  });
});
