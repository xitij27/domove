import { describe, expect, it } from 'vitest';
import { bandCounts, GRID_KINDS, GRID_ROADS, severityGrid } from './severityGrid';
import { DEFAULT_SETTINGS } from './settings';
import type { ClosureKind } from './closures';
import type { RoadClass } from './sites';

const site = (kinds: ClosureKind[], road: RoadClass) => ({ kinds, road });
const sites = [site(['full'], 'main'), site(['full'], 'main'), site(['half'], 'secondary'), site(['sidewalk', 'half'], 'local'), site(['parking'], 'local')];

describe('severity grid', () => {
  it('shows every restriction on every road, with its band and its sites', () => {
    const grid = severityGrid(DEFAULT_SETTINGS, sites);
    expect(grid).toHaveLength(GRID_KINDS.length);
    expect(grid.every((row) => row.length === GRID_ROADS.length)).toBe(true);
    expect(grid[0][0]).toEqual({ kind: 'full', road: 'main', severity: 1, band: 'high', sites: 2 });
    const half = grid[GRID_KINDS.indexOf('half')];
    expect(half[1]).toMatchObject({ severity: 0.3, band: 'medium', sites: 1 });
    // a site with two restrictions sits under the heavier one
    expect(half[2]).toMatchObject({ sites: 1, band: 'low' });
    expect(grid[GRID_KINDS.indexOf('sidewalk')][2].sites).toBe(0);
  });

  it('follows the weights and the bands', () => {
    const heavier = { ...DEFAULT_SETTINGS, 'weight.half': 1, 'band.high': 0.55 };
    const half = severityGrid(heavier, sites)[GRID_KINDS.indexOf('half')];
    expect(half.map((c) => c.band)).toEqual(['high', 'high', 'medium']);
    expect(bandCounts(DEFAULT_SETTINGS, sites)).toEqual({ high: 2, medium: 1, low: 2 });
    expect(bandCounts(heavier, sites)).toEqual({ high: 3, medium: 1, low: 1 });
  });
});
