// Where people live: residents per 100 m square from the 2022 census (public/population.json), indexed in 500 m buckets
// so "who lives near this work" stays quick for every work on every recompute.
import { pointShapeDist, toXY } from './geo';
import type { Shape, XY } from './geo';

export type Population = { cells: { xy: XY; n: number }[]; buckets: Map<string, number[]> };
const BUCKET = 500;
const key = (x: number, y: number) => `${Math.floor(x / BUCKET)}:${Math.floor(y / BUCKET)}`;

export function preparePopulation(raw: [number, number, number][]): Population {
  const cells = raw.map(([lon, lat, n]) => ({ xy: toXY([lon, lat]), n }));
  const buckets = new Map<string, number[]>();
  cells.forEach((c, i) => {
    const k = key(c.xy[0], c.xy[1]);
    buckets.set(k, [...(buckets.get(k) ?? []), i]);
  });
  return { cells, buckets };
}

/** The squares whose centre lies within `m` metres of the shape, by index, so several works can count each square once. */
export function cellsNear(shape: Shape, m: number, pop: Population): number[] {
  const [x0, y0, x1, y1] = shape.bbox;
  const out: number[] = [];
  for (let bx = Math.floor((x0 - m) / BUCKET); bx <= Math.floor((x1 + m) / BUCKET); bx++) {
    for (let by = Math.floor((y0 - m) / BUCKET); by <= Math.floor((y1 + m) / BUCKET); by++) {
      for (const i of pop.buckets.get(`${bx}:${by}`) ?? []) if (pointShapeDist(pop.cells[i].xy, shape) <= m) out.push(i);
    }
  }
  return out;
}

export const residentsOf = (cells: Iterable<number>, pop: Population): number => {
  let n = 0;
  for (const i of cells) n += pop.cells[i].n;
  return n;
};
