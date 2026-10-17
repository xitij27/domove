import { shapeOf, toLonLat, toXY, type LonLat } from './geo';
import type { PlanSite, SiteScore } from './planner';
import type { Leg } from './valhalla';

// A flat little world for the planner's tests: x east and y north in metres, from a point in Dortmund.

const [X0, Y0] = toXY([7.46, 51.51]);

/** The point x m east and y m north of the origin. */
export const at = (x: number, y: number): LonLat => toLonLat([X0 + x, Y0 + y]);

/** A path through the points given in metres. */
export const leg = (seconds: number, ...points: [number, number][]): Leg => ({
  line: points.map(([x, y]) => at(x, y)),
  seconds,
  meters: seconds * 10,
});

/** A square site centred at (x, y), `half` m from its middle to each side. */
export const square = (id: string, x: number, y: number, half = 15): PlanSite => ({
  id,
  shape: shapeOf([[[at(x - half, y - half), at(x + half, y - half), at(x + half, y + half), at(x - half, y + half), at(x - half, y - half)]]]),
});

export const blocking = (rating = 6): SiteScore => ({ impact: 'blocked', score: rating, rating, active: true });
export const slowing = (score: number): SiteScore => ({ impact: 'slowed', score, rating: Math.floor(score + 0.5), active: true });
