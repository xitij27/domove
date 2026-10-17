import { toXY, type LonLat } from './geo';
import { planRoute, type PlanSite, type SiteScore } from './planner';
import { at, blocking, leg, slowing, square } from './testPlan';
import type { Leg } from './valhalla';

const trip = [at(0, 0), at(2000, 0)];
const straight: [number, number][] = [[0, 0], [2000, 0]];
const north: [number, number][] = [[0, 0], [0, 300], [2000, 300], [2000, 0]];

/** Answers with the first leg without areas left out, the second with one left out, and so on. */
const routerBy = (...legs: Leg[]) =>
  jest.fn(async (_places: LonLat[], cuts: LonLat[][]) => legs[Math.min(cuts.length, legs.length - 1)]);

const plan = (sites: PlanSite[], scores: Record<string, SiteScore>, router: ReturnType<typeof routerBy>) =>
  planRoute({ places: trip, sites, scores: new Map(Object.entries(scores)), router });

const noWay = () => Object.assign(new Error('Routing server: No path could be found for input'), { code: 442 });

test('a trip with nothing on the way keeps the router\'s path and asks once', async () => {
  const router = routerBy(leg(200, ...straight));
  const result = await plan([], {}, router);
  expect(result.searched).toBe(false);
  expect(result.options.map((o) => o.kind)).toEqual(['direct']);
  expect(router).toHaveBeenCalledTimes(1);
  expect(router).toHaveBeenCalledWith(trip, [], undefined);
});

test('a low-rated site on the way isn\'t worth a detour', async () => {
  const router = routerBy(leg(200, ...straight));
  const result = await plan([square('low', 1000, 0)], { low: slowing(2) }, router);
  expect(result.searched).toBe(false);
  expect(result.direct.sites).toEqual([expect.objectContaining({ siteId: 'low', use: 'uses', alongM: 40, effectiveRating: 2 })]);
  expect(router).toHaveBeenCalledTimes(1);
});

test('goes around a site that blocks the mode, leaving out a square where the path ran through it', async () => {
  const router = routerBy(leg(200, ...straight), leg(260, ...north));
  const result = await plan([square('x', 1000, 0)], { x: blocking() }, router);
  expect(result.direct.blockedBy).toEqual(['x']);
  // the direct path is out, however fast
  expect(result.options.map((o) => o.kind)).toEqual(['blocked']);
  expect(router).toHaveBeenCalledTimes(2);
  const [cut] = router.mock.calls[1][1];
  const corners = cut.slice(0, 4).map(toXY);
  const [cx, cy] = toXY(at(1000, 0));
  expect(Math.abs(corners.reduce((sum, p) => sum + p[0], 0) / 4 - cx)).toBeLessThan(1);
  expect(Math.abs(corners.reduce((sum, p) => sum + p[1], 0) / 4 - cy)).toBeLessThan(1);
});

// The doc's example: 14 min along Kaiserstraße, or 18 min around it.
test('a severe site on a school morning is worth 4 more minutes, and the direct path stays as the other option', async () => {
  const router = routerBy(leg(840, ...straight), leg(1080, ...north));
  const result = await plan([square('k', 1000, 0)], { k: slowing(8.7) }, router);
  expect(result.searched).toBe(true);
  expect(result.options.map((o) => o.kind)).toEqual(['high', 'direct']);
  expect(result.options[1].penaltyS).toBeCloseTo(756.9);
});

test('the same site on a Saturday isn\'t: the direct path is recommended, the way around offered', async () => {
  const router = routerBy(leg(840, ...straight), leg(1080, ...north));
  const result = await plan([square('k', 1000, 0)], { k: slowing(4.6) }, router);
  expect(result.options.map((o) => o.kind)).toEqual(['direct', 'medium']);
});

test('a way around more than 50 % slower is dropped while the direct path is open', async () => {
  const router = routerBy(leg(840, ...straight), leg(1800, ...north));
  const result = await plan([square('k', 1000, 0)], { k: slowing(8.7) }, router);
  expect(result.searched).toBe(true);
  expect(result.options.map((o) => o.kind)).toEqual(['direct']);
});

test('with no way around a closure, the least obstructed path is the only one, and names it', async () => {
  const router = jest.fn(async (_places: LonLat[], cuts: LonLat[][]) => {
    if (cuts.length) throw noWay();
    return leg(200, ...straight);
  });
  const result = await planRoute({ places: trip, sites: [square('x', 1000, 0)], scores: new Map([['x', blocking()]]), router });
  expect(result.options.map((o) => o.kind)).toEqual(['direct']);
  expect(result.options[0].blockedBy).toEqual(['x']);
  expect(router).toHaveBeenCalledTimes(2);
});

test('other router failures aren\'t taken for "no way around"', async () => {
  const router = jest.fn(async (_places: LonLat[], cuts: LonLat[][]) => {
    if (cuts.length) throw new Error('Could not reach the routing server.');
    return leg(200, ...straight);
  });
  await expect(planRoute({ places: trip, sites: [square('x', 1000, 0)], scores: new Map([['x', blocking()]]), router }))
    .rejects.toThrow('Could not reach the routing server.');
});

test('a closure at the destination is on every path, so it neither blocks nor sends the planner looking', async () => {
  const router = routerBy(leg(200, ...straight));
  const result = await plan([square('end', 1990, 0, 30)], { end: blocking() }, router);
  expect(result.direct.sites).toEqual([expect.objectContaining({ siteId: 'end', blocked: true, atPlace: true })]);
  expect(result.direct.blockedBy).toEqual([]);
  expect(result.searched).toBe(false);
  expect(router).toHaveBeenCalledTimes(1);
});

test('a site not running at the travel time is ignored', async () => {
  const router = routerBy(leg(200, ...straight));
  const result = await plan([square('later', 1000, 0)], { later: { ...blocking(), active: false } }, router);
  expect(result.direct.sites).toEqual([]);
  expect(result.searched).toBe(false);
});

test('crossing a slowed site counts 30 %; crossing a closed side street counts nothing, the junction stays open', async () => {
  const router = routerBy(leg(200, ...straight));
  const result = await plan([square('slow', 700, 0, 2), square('closed', 1300, 0, 2)], { slow: slowing(6), closed: blocking() }, router);
  expect(result.direct.sites).toEqual([
    expect.objectContaining({ siteId: 'slow', use: 'crosses', weight: 0.3, effectiveScore: 1.8, effectiveRating: 2, blocked: false }),
    expect.objectContaining({ siteId: 'closed', use: 'crosses', weight: 0, effectiveScore: 0, blocked: false }),
  ]);
  expect(result.direct.cost).toBeCloseTo(200 + 10 * 1.8 ** 2);
  expect(result.searched).toBe(false);
});

test('a way that mostly repeats a cheaper one is dropped', async () => {
  // around the closure on the direct path, but along a severe site; then around that too, with a small jog
  const aroundClosure = leg(260, ...north);
  const aroundBoth = leg(270, [0, 0], [0, 300], [950, 300], [950, 350], [1050, 350], [1050, 300], [2000, 300], [2000, 0]);
  const router = routerBy(leg(200, ...straight), aroundClosure, aroundBoth);
  const result = await plan([square('x', 1000, 0), square('y', 1000, 300)], { x: blocking(), y: slowing(8) }, router);
  expect(result.options.map((o) => o.kind)).toEqual(['high']);
  expect(router).toHaveBeenCalledTimes(3);
});

test('leaves out at most 19 areas, as the public router takes no more, and says so', async () => {
  const sites = Array.from({ length: 20 }, (_, i) => square(`s${i}`, 50 + i * 100, 0));
  const router = routerBy(leg(200, ...straight));
  const result = await plan(sites, Object.fromEntries(sites.map((s) => [s.id, blocking()])), router);
  expect(result.limitReached).toBe(true);
  expect(router.mock.calls[1][1]).toHaveLength(19);
  expect(result.options).toHaveLength(1);
});
