// Planar metres around Dortmund (equirectangular at 51.5° N), as the dashboard measures (dashboard/src/model/geo.ts).
// Across the city the error stays under 0.5 %, plenty for the 5–30 m tests here, and far cheaper than geodesic maths.

const KX = 111_320 * Math.cos((51.5 * Math.PI) / 180);
const KY = 110_574;

export type LonLat = [number, number];
export type XY = [number, number];
export type BBox = [number, number, number, number];
/** Polygons (outer ring first, then holes) in planar metres. */
export type Shape = { polygons: XY[][][]; bbox: BBox };

export const toXY = ([lon, lat]: LonLat): XY => [lon * KX, lat * KY];
export const toLonLat = ([x, y]: XY): LonLat => [x / KX, y / KY];
export const dist = (a: XY, b: XY): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function bboxOf(points: XY[]): BBox {
  const box: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x > box[2]) box[2] = x;
    if (y > box[3]) box[3] = y;
  }
  return box;
}

/** Lower bound of the distance between anything inside the two boxes. */
export const bboxGap = (a: BBox, b: BBox): number =>
  Math.max(0, a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);

/** Polygons as GeoJSON has them: rings of [lon, lat], outer ring first. */
export function shapeOf(polygons: LonLat[][][]): Shape {
  const xy = polygons.map((rings) => rings.map((ring) => ring.map(toXY)));
  return { polygons: xy, bbox: bboxOf(xy.flat(2)) };
}

export function circleShape(center: XY, radius: number, steps = 24): Shape {
  const ring: XY[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return { polygons: [[ring]], bbox: bboxOf(ring) };
}

function segDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Even-odd test over all rings, so holes count as outside. */
function pointInPolygon(p: XY, rings: XY[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** 0 when the point is inside. */
export function pointShapeDist(p: XY, s: Shape): number {
  if (s.polygons.some((rings) => pointInPolygon(p, rings))) return 0;
  let best = Infinity;
  for (const rings of s.polygons) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) best = Math.min(best, segDist(p, ring[i - 1], ring[i]));
    }
  }
  return best;
}

export type Sample = { p: XY; at: number; len: number };

/** Points about every `step` metres along a line: where each lies, how far along, and how much of the line it stands for. */
export function samplesAlong(line: XY[], step: number): Sample[] {
  const out: Sample[] = [];
  let travelled = 0;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const len = dist(a, b);
    // rounding noise in a 2000 m segment shouldn't make it 401 steps of 5 m
    const n = Math.max(1, Math.ceil(len / step - 1e-9));
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      out.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], at: travelled + len * f, len: len / n });
    }
    travelled += len;
  }
  return out;
}

/** The point `d` metres along the line. */
export function pointAt(line: XY[], d: number): XY {
  let travelled = 0;
  for (let i = 1; i < line.length; i++) {
    const len = dist(line[i - 1], line[i]);
    if (travelled + len >= d && len > 0) {
      const t = (d - travelled) / len;
      return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
    }
    travelled += len;
  }
  return line[line.length - 1];
}

const GRID_M = 8;

/** Share of line a's length that runs along line b: within 8 m of it for sure, and never further than about 20 m. */
export function sharedShare(a: LonLat[], b: LonLat[]): number {
  const cell = ([x, y]: XY) => [Math.floor(x / GRID_M), Math.floor(y / GRID_M)];
  const cells = new Set<string>();
  for (const { p } of samplesAlong(b.map(toXY), GRID_M / 2)) {
    const [i, j] = cell(p);
    cells.add(`${i},${j}`);
  }
  let shared = 0;
  let total = 0;
  for (const { p, len } of samplesAlong(a.map(toXY), GRID_M / 2)) {
    const [i, j] = cell(p);
    total += len;
    if ([-1, 0, 1].some((di) => [-1, 0, 1].some((dj) => cells.has(`${i + di},${j + dj}`)))) shared += len;
  }
  return total > 0 ? shared / total : 1;
}
