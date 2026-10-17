// A what-if model of how much road each district has against how many cars want to use it. It is relative, not measured:
// the city publishes no traffic volumes, so "network use today" is an assumption the planner sets, and everything else
// (population, car use, the works running on a day) scales from it.
import type { Road } from '../data/sources';
import { dist, pointInShape, toXY } from './geo';
import type { Shape } from './geo';
import { isActive } from './analysis';
import type { RoadClass, Site } from './sites';

/** Lanes (both directions) each road class offers. The register has no lane counts, so these are typical urban values. */
const CLASS_LANES: Record<string, number> = { 'Hauptverkehrstraße': 4, 'Verbindungsstrasse zu BAB,B,L,K': 4, 'Verkehrsstraße': 2 };
/** Lanes a closure on that kind of road can take away. */
const SITE_LANES: Record<RoadClass, number> = { main: 4, secondary: 2, local: 1 };
/** A work zone is taken as this long, in km. */
const SITE_KM = 0.3;
/** The share of a district's traffic that is passing through; it spreads over districts by their road capacity, not their residents. */
const THROUGH = 0.4;
/** A district never loses more than this of its capacity to works. */
const MAX_LOSS = 0.9;

/** On the map and in the bars a load of this much fills the scale, so "full" (1) sits in the top colour. */
export const LOAD_SCALE = 1.25;

export type Params = {
  /** Residents compared with today, 1 = unchanged. */
  population: number;
  /** Car trips per resident compared with today. */
  carUse: number;
  /** Citywide road use at the busy hour today, with no works: the one number to calibrate. */
  useToday: number;
};
export const DEFAULT_PARAMS: Params = { population: 1, carUse: 1, useToday: 0.7 };

/** Lane-km of the main roads in each district: every segment goes to the district its middle is in. */
export function roadCapacity(roads: Road[], districts: { name: string; shape: Shape }[]): Map<string, number> {
  const out = new Map(districts.map((d) => [d.name, 0]));
  for (const road of roads) {
    const lanes = CLASS_LANES[road.cls] ?? 2;
    const lines = road.geometry.type === 'LineString' ? [road.geometry.coordinates] : road.geometry.coordinates;
    for (const line of lines) {
      const xy = line.map((p) => toXY([p[0], p[1]]));
      for (let i = 1; i < xy.length; i++) {
        const mid: [number, number] = [(xy[i - 1][0] + xy[i][0]) / 2, (xy[i - 1][1] + xy[i][1]) / 2];
        const d = districts.find((x) => pointInShape(mid, x.shape));
        if (d) out.set(d.name, out.get(d.name)! + (dist(xy[i - 1], xy[i]) / 1000) * lanes);
      }
    }
  }
  return out;
}

export type DistrictLoad = {
  district: string;
  residents: number;
  /** Lane-km today, and what the works running that day take away. */
  capacity: number;
  lost: number;
  /** Demand over capacity at the busy hour: 1 is full. Null for a district with no main roads. */
  load: number | null;
  /** The same with no works, for comparing. */
  loadWithoutWorks: number | null;
  /** How far population and car use together could grow from today's levels before this district is full. */
  headroom: number | null;
  sites: Site[];
};
export type CapacityResult = { districts: DistrictLoad[]; citywide: number; headroom: number; firstFull: string | null; over: number };

export function simulate(sites: Site[], capacity: Map<string, number>, residents: Map<string, number>, day: number, p: Params): CapacityResult {
  const names = [...capacity.keys()];
  const totalCapacity = names.reduce((sum, n) => sum + capacity.get(n)!, 0);
  const totalResidents = names.reduce((sum, n) => sum + (residents.get(n) ?? 0), 0);
  const growth = p.population * p.carUse;
  const active = sites.filter((s) => isActive(s, day));

  const rows = names.map((district): DistrictLoad => {
    const base = capacity.get(district)!;
    const here = active.filter((s) => s.district === district);
    const lost = Math.min(MAX_LOSS * base, here.reduce((sum, s) => sum + s.severity * SITE_KM * SITE_LANES[s.road], 0));
    const res = residents.get(district) ?? 0;
    // demand as a share of the city's: part follows where people live, the through part follows where the roads are
    const demand = totalCapacity && totalResidents ? (1 - THROUGH) * (res / totalResidents) + THROUGH * (base / totalCapacity) : 0;
    const per = (cap: number) => (base > 0 && totalCapacity ? (p.useToday * demand) / (cap / totalCapacity) : null);
    const loadWithoutWorks = per(base);
    const load = per(base - lost);
    return {
      district, residents: res, capacity: base, lost,
      load: load === null ? null : load * growth, loadWithoutWorks: loadWithoutWorks === null ? null : loadWithoutWorks * growth,
      headroom: load ? 1 / load - 1 : null, sites: here,
    };
  });

  const ranked = rows.filter((r) => r.load !== null).sort((a, b) => b.load! - a.load!);
  const open = totalCapacity - rows.reduce((sum, r) => sum + r.lost, 0);
  return {
    districts: rows.sort((a, b) => (b.load ?? -1) - (a.load ?? -1)),
    // everything the city's roads carry, over everything they can carry that day
    citywide: open > 0 ? (p.useToday * growth * totalCapacity) / open : 0,
    headroom: ranked[0] ? 1 / (ranked[0].load! / growth) - 1 : 0,
    firstFull: ranked[0]?.district ?? null,
    over: ranked.filter((r) => r.load! >= 1).length,
  };
}
