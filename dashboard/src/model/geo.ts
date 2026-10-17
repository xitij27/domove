// Planar metres around Dortmund (equirectangular at 51.5° N). Across the city the error stays
// under 0.5 %, plenty for the 5 m–1 km tests here, and far cheaper than geodesic maths.
import type { MultiPolygon, Polygon } from 'geojson';

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

export function shapeOf(geometry: Polygon | MultiPolygon): Shape {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const polygons = polys.map((rings) => rings.map((ring) => ring.map((p) => toXY(p as LonLat))));
  return { polygons, bbox: bboxOf(polygons.flat(2)) };
}

/** A closed ring approximating a circle. */
export function circle(center: XY, radius: number, steps = 24): XY[] {
  const ring: XY[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return ring;
}

export const circleShape = (center: XY, radius: number): Shape => {
  const ring = circle(center, radius);
  return { polygons: [[ring]], bbox: bboxOf(ring) };
};

export function segDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segSegDist(a: XY, b: XY, c: XY, d: XY): number {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  // proper crossing; touching ends come out as 0 from the point distances below
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}

/** Even-odd test over all rings, so holes count as outside. */
export function pointInPolygon(p: XY, rings: XY[][]): boolean {
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

export const pointInShape = (p: XY, s: Shape): boolean => s.polygons.some((rings) => pointInPolygon(p, rings));

function* edges(s: Shape): Generator<[XY, XY]> {
  for (const rings of s.polygons) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) yield [ring[i - 1], ring[i]];
    }
  }
}

/** 0 when the point is inside. */
export function pointShapeDist(p: XY, s: Shape): number {
  if (pointInShape(p, s)) return 0;
  let best = Infinity;
  for (const [a, b] of edges(s)) best = Math.min(best, segDist(p, a, b));
  return best;
}

/** 0 when the line enters the shape. */
export function lineShapeDist(line: XY[], s: Shape): number {
  if (line.some((p) => pointInShape(p, s))) return 0;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    for (const [a, b] of edges(s)) {
      best = Math.min(best, segSegDist(line[i - 1], line[i], a, b));
      if (best === 0) return 0;
    }
  }
  return best;
}

/** 0 when the shapes touch or overlap. */
export function shapeShapeDist(a: Shape, b: Shape): number {
  if (a.polygons.some((rings) => pointInShape(rings[0][0], b))) return 0;
  if (b.polygons.some((rings) => pointInShape(rings[0][0], a))) return 0;
  let best = Infinity;
  for (const [p, q] of edges(a)) {
    for (const [r, s] of edges(b)) {
      best = Math.min(best, segSegDist(p, q, r, s));
      if (best === 0) return 0;
    }
  }
  return best;
}
