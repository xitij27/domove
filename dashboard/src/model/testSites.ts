// Small hand-made sites for the model tests: squares on a planar grid around Dortmund's centre.
import { KIND_WEIGHT } from './closures';
import type { ClosureKind } from './closures';
import { shapeOf, toLonLat, toXY } from './geo';
import type { LonLat } from './geo';
import { ROAD_WEIGHT } from './sites';
import type { RoadClass, Site } from './sites';

const ORIGIN = toXY([7.4653, 51.5136]);

/** A 20 m square whose south-west corner is `x`, `y` metres from the centre. */
export function testSite(id: string, x: number, y: number, start: number, end: number, opts: Partial<Site> & { kind?: ClosureKind; road?: RoadClass } = {}): Site {
  const corner = (dx: number, dy: number): LonLat => toLonLat([ORIGIN[0] + x + dx, ORIGIN[1] + y + dy]);
  const geometry = { type: 'Polygon' as const, coordinates: [[corner(0, 0), corner(20, 0), corner(20, 20), corner(0, 20), corner(0, 0)]] };
  const kind = opts.kind ?? 'full';
  const road = opts.road ?? 'main';
  const far = { name: '', detail: '', m: Infinity };
  return {
    id, status: 'planned', title: id, owner: 'Stadt Dortmund', district: 'Innenstadt-West',
    kinds: [kind], kind, daytimeOnly: false, road, roadName: '', severity: KIND_WEIGHT[kind] * ROAD_WEIGHT[road],
    baseStart: start, baseEnd: end, start, end, openEnded: false,
    center: corner(10, 10), geometry, shape: shapeOf(geometry),
    rail: far, fire: far, hospital: far, hypothetical: false,
    ...opts,
  };
}
