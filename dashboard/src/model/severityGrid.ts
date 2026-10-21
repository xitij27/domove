// Severity as the settings make it: every restriction on every kind of road, the band that puts it in, and how many
// sites sit there. Shown as the Settings panel's table, so a weight's effect is seen rather than worked out.
import type { ClosureKind } from './closures';
import { worstKind } from './closures';
import { bandOf, DEFAULT_SETTINGS } from './settings';
import type { Band, Settings } from './settings';
import type { RoadClass, Site } from './sites';

export const GRID_KINDS: ClosureKind[] = ['full', 'carriageway', 'one_way', 'half', 'narrowing', 'signal', 'moving', 'sidewalk', 'unknown', 'parking'];
export const GRID_ROADS: RoadClass[] = ['main', 'secondary', 'local'];

export type Cell = { kind: ClosureKind; road: RoadClass; severity: number; band: Band; sites: number };
export type BandCounts = Record<Band, number>;

const severityOf = (kind: ClosureKind, road: RoadClass, s: Settings) => s[`weight.${kind}`] * s[`road.${road}`];

/** A site counts under the restriction that weighs most by these settings, as its severity does. */
const cellOf = (site: Pick<Site, 'kinds' | 'road'>, s: Settings) => `${worstKind(site.kinds, s)}|${site.road}`;

export function severityGrid(s: Settings, sites: Pick<Site, 'kinds' | 'road'>[]): Cell[][] {
  const counts = new Map<string, number>();
  for (const site of sites) counts.set(cellOf(site, s), (counts.get(cellOf(site, s)) ?? 0) + 1);
  return GRID_KINDS.map((kind) => GRID_ROADS.map((road) => {
    const severity = severityOf(kind, road, s);
    return { kind, road, severity, band: bandOf(severity, s), sites: counts.get(`${kind}|${road}`) ?? 0 };
  }));
}

/** How many of the sites are high, medium and low by these settings. */
export function bandCounts(s: Settings, sites: Pick<Site, 'kinds' | 'road'>[]): BandCounts {
  const out: BandCounts = { high: 0, medium: 0, low: 0 };
  for (const site of sites) out[bandOf(severityOf(worstKind(site.kinds, s), site.road, s), s)]++;
  return out;
}

export const defaultBandCounts = (sites: Pick<Site, 'kinds' | 'road'>[]): BandCounts => bandCounts(DEFAULT_SETTINGS, sites);
