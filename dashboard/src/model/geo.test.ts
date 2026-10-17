import { describe, expect, it } from 'vitest';
import { bboxGap, circleShape, lineShapeDist, pointInShape, pointShapeDist, shapeOf, shapeShapeDist, toLonLat, toXY } from './geo';
import type { XY } from './geo';

// A 100 m square with a 20 m hole in the middle, in planar metres.
const square = (x: number, y: number, size: number): XY[] => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
const donut = { polygons: [[square(0, 0, 100), square(40, 40, 20)]], bbox: [0, 0, 100, 100] as [number, number, number, number] };

describe('planar geometry', () => {
  it('round-trips coordinates', () => {
    const [lon, lat] = toLonLat(toXY([7.4653, 51.5136]));
    expect(lon).toBeCloseTo(7.4653, 9);
    expect(lat).toBeCloseTo(51.5136, 9);
  });

  it('measures about 100 m for 0.0009 degrees of latitude', () => {
    const a = toXY([7.46, 51.51]);
    const b = toXY([7.46, 51.5109]);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(99.5, 0);
  });

  it('treats holes as outside', () => {
    expect(pointInShape([10, 10], donut)).toBe(true);
    expect(pointInShape([50, 50], donut)).toBe(false);
    expect(pointShapeDist([50, 50], donut)).toBe(10);
    expect(pointShapeDist([130, 50], donut)).toBe(30);
  });

  it('finds a line crossing a shape without a vertex inside', () => {
    expect(lineShapeDist([[-50, 20], [150, 20]], donut)).toBe(0);
    expect(lineShapeDist([[-50, 130], [150, 130]], donut)).toBe(30);
  });

  it('measures the gap between shapes and the bound between boxes', () => {
    const other = { polygons: [[square(160, 0, 50)]], bbox: [160, 0, 210, 50] as [number, number, number, number] };
    expect(shapeShapeDist(donut, other)).toBe(60);
    expect(bboxGap(donut.bbox, other.bbox)).toBe(60);
    expect(shapeShapeDist(donut, circleShape([50, 50], 5))).toBe(5);
    expect(shapeShapeDist(donut, circleShape([10, 10], 5))).toBe(0);
  });

  it('reads GeoJSON polygons and multipolygons', () => {
    const shape = shapeOf({ type: 'MultiPolygon', coordinates: [[[[7.46, 51.51], [7.461, 51.51], [7.461, 51.511], [7.46, 51.51]]]] });
    expect(shape.polygons).toHaveLength(1);
    expect(shape.bbox[2]).toBeGreaterThan(shape.bbox[0]);
  });
});
