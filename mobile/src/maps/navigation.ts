import type { Coordinate, TransportMode } from '../routes/model';

/** One move of the camera while it follows the user. */
export type FollowView = {
  center: Coordinate;
  /** Degrees from north the map turns to; null leaves its turn as it is. */
  heading: number | null;
  zoom: number;
  ms: number;
  /** An even speed, so the moves from one fix to the next join up instead of surging. */
  glide: boolean;
};

// Close enough to read the streets ahead; a car covers more ground between fixes.
export const FOLLOW_ZOOM: Record<TransportMode, number> = { pedestrian: 18, bike: 17.5, car: 17 };
/** Tilted towards the horizon, so more of the way ahead fits on screen. */
export const FOLLOW_PITCH = 45;
/** Share of the map's height kept clear above the user's centre, which puts them low on screen with the way ahead above. */
export const FOLLOW_TOP = 0.35;
/** About the time between fixes, so each glide ends as the next fix comes in. */
export const FOLLOW_MS = 1000;
/** From the route's overview down to the user. */
export const FOLLOW_START_MS = 1200;
/** From following back to a flat map, north up, before the route's overview. */
export const UNFOLLOW_MS = 450;
/** A turn of the phone on foot. */
export const TURN_MS = 300;
/** Smaller turns are the compass shaking, not worth a camera move. */
export const TURN_STEP = 5;

// Below this, in m/s, GPS has no direction of travel worth following; walking is about 1.4.
const MOVING_SPEED = 1;

/**
 * Which way the map turns while it follows the user: the way they move, once they do. Standing, on foot it is the
 * way the phone faces; on a bike or in a car the phone may lie anywhere, so the map keeps its turn, and the phone's
 * facing only sets it before the first move. Null until anything is known.
 */
export function followHeading(course: number | null, speed: number | null, compass: number | null, previous: number | null, mode: TransportMode): number | null {
  // iOS reports an unknown course or speed as -1
  if (course !== null && course >= 0 && speed !== null && speed >= MOVING_SPEED) return course;
  if (mode === 'pedestrian' || previous === null) return compass ?? previous;
  return previous;
}

/** How many degrees apart two headings are, the short way round. */
export function turnBetween(a: number, b: number) {
  const apart = Math.abs(a - b) % 360;
  return apart > 180 ? 360 - apart : apart;
}
