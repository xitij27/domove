// A what-if model of how much road each district has against how many cars want to use it. It is relative, not measured:
// the city publishes no traffic volumes, so "network use today" is an assumption the planner sets, and everything else
// (population, car use, the works running on a day) scales from it.
import type { Road } from '../data/sources';
import { dist, pointInShape, toXY } from './geo';
import type { Shape } from './geo';
import { isActive } from './analysis';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './settings';
import { MAIN_CLASSES } from './sites';
import type { Site } from './sites';

// The lanes per road, the lanes and length a work zone takes, the through-traffic share and the most works can take are
// the capacity.* settings. The register has no lane counts, so their defaults are typical urban values.

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

export type RoadKm = { main: number; other: number };

/** Km of main and other through roads in each district: every segment goes to the district its middle is in. */
export function roadKm(roads: Road[], districts: { name: string; shape: Shape }[]): Map<string, RoadKm> {
  const out = new Map(districts.map((d): [string, RoadKm] => [d.name, { main: 0, other: 0 }]));
  for (const road of roads) {
    const cls = MAIN_CLASSES.has(road.cls) ? 'main' : 'other';
    const lines = road.geometry.type === 'LineString' ? [road.geometry.coordinates] : road.geometry.coordinates;
    for (const line of lines) {
      const xy = line.map((p) => toXY([p[0], p[1]]));
      for (let i = 1; i < xy.length; i++) {
        const mid: [number, number] = [(xy[i - 1][0] + xy[i][0]) / 2, (xy[i - 1][1] + xy[i][1]) / 2];
        const d = districts.find((x) => pointInShape(mid, x.shape));
        if (d) out.get(d.name)![cls] += dist(xy[i - 1], xy[i]) / 1000;
      }
    }
  }
  return out;
}

/** Lane-km in each district, by the lanes the settings give each kind of road. */
export const laneKm = (km: Map<string, RoadKm>, cfg: Settings = DEFAULT_SETTINGS): Map<string, number> =>
  new Map([...km].map(([name, k]) => [name, k.main * cfg['capacity.roadLanes.main'] + k.other * cfg['capacity.roadLanes.other']]));

export type DistrictLoad = {
  district: string;
  residents: number;
  /** Lane-km today, and what the works running that day take away. */
  capacity: number;
  lost: number;
  /** Its share of the city's busy-hour traffic. */
  demand: number;
  /** Demand over capacity at the busy hour: 1 is full. Null for a district with no main roads. */
  load: number | null;
  /** The same with no works, for comparing. */
  loadWithoutWorks: number | null;
  /** How far population and car use together could grow from today's levels before this district is full. */
  headroom: number | null;
  sites: Site[];
};
export type CapacityResult = {
  districts: DistrictLoad[]; citywide: number; headroom: number; firstFull: string | null; over: number;
  /** The city's totals the shares are taken of, and the lane-km still open that day. */
  totalCapacity: number; totalResidents: number; openCapacity: number;
};

export function simulate(sites: Site[], capacity: Map<string, number>, residents: Map<string, number>, day: number, p: Params, cfg: Settings = DEFAULT_SETTINGS): CapacityResult {
  const names = [...capacity.keys()];
  const totalCapacity = names.reduce((sum, n) => sum + capacity.get(n)!, 0);
  const totalResidents = names.reduce((sum, n) => sum + (residents.get(n) ?? 0), 0);
  const growth = p.population * p.carUse;
  const active = sites.filter((s) => isActive(s, day));

  const rows = names.map((district): DistrictLoad => {
    const base = capacity.get(district)!;
    const here = active.filter((s) => s.district === district);
    const lost = Math.min(cfg['capacity.maxLoss'] * base, here.reduce((sum, s) => sum + s.severity * cfg['capacity.siteKm'] * cfg[`capacity.siteLanes.${s.road}`], 0));
    const res = residents.get(district) ?? 0;
    // demand as a share of the city's: part follows where people live, the through part follows where the roads are
    const through = cfg['capacity.through'];
    const demand = totalCapacity && totalResidents ? (1 - through) * (res / totalResidents) + through * (base / totalCapacity) : 0;
    const per = (cap: number) => (base > 0 && totalCapacity ? (p.useToday * demand) / (cap / totalCapacity) : null);
    const loadWithoutWorks = per(base);
    const load = per(base - lost);
    return {
      district, residents: res, capacity: base, lost, demand,
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
    totalCapacity, totalResidents, openCapacity: open,
  };
}
