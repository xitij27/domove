import { parseSiteRatings } from '../ratings/model';
import { schoolDayRow } from '../ratings/testRatings';
import type { LonLat } from './geo';
import { planRoute, type PlanSite, type SiteScore } from './planner';
import { at, blocking, leg, slowing, square } from './testPlan';
import { describeWay, formatDistance, formatDuration, planSiteIds, siteName, wayRating } from './text';
import type { Leg } from './valhalla';

const trip = [at(0, 0), at(2000, 0)];
const straight: [number, number][] = [[0, 0], [2000, 0]];
const north: [number, number][] = [[0, 0], [0, 300], [2000, 300], [2000, 0]];
const names: Record<string, string> = { k: 'Kaiserstraße', x: 'Im Karrenberg', s1: 'Kaiserstraße' };
const nameOf = (id: string) => names[id] ?? id;

const plan = (sites: PlanSite[], scores: Record<string, SiteScore>, ...legs: Leg[]) => planRoute({
  places: trip,
  sites,
  scores: new Map(Object.entries(scores)),
  router: async (_places: LonLat[], cuts: LonLat[][]) => legs[Math.min(cuts.length, legs.length - 1)],
});

test('durations, distances and site names read as on a route card', () => {
  expect(formatDuration(20)).toBe('1 min');
  expect(formatDuration(1080)).toBe('18 min');
  expect(formatDuration(3900)).toBe('1 h 05 min');
  expect(formatDistance(843)).toBe('840 m');
  expect(formatDistance(6240)).toBe('6.2 km');
  expect(siteName('Im Karrenberg - Fahrbahnsanierung // Vollsperrung')).toBe('Im Karrenberg');
  expect(siteName('Hülshof / Oberfeldstraße // Einengung')).toBe('Hülshof / Oberfeldstraße');
  expect(siteName('Asselner Hellweg, Donnerstraße, Am Hagedorn und Umgebung - Glasfaser')).toBe('Asselner Hellweg, Donnerstraße,…');
  expect(siteName(undefined)).toBe('a construction site');
});

test('a way around says what it avoids and what it costs; the direct way what is still on it', async () => {
  const result = await plan([square('k', 1000, 0)], { k: slowing(8.7) }, leg(840, ...straight), leg(1080, ...north));
  expect(describeWay(result, 0, nameOf)).toEqual({
    headline: 'Recommended · 18 min (+4 min) · 10.8 km',
    avoids: 'Avoids Kaiserstraße (9/10)',
    warning: null,
    spoken: 'Recommended way, 18 minutes, 10.8 km, 4 minutes longer than the direct way, avoids 1 construction site',
  });
  expect(describeWay(result, 1, nameOf)).toMatchObject({
    headline: 'Direct · 14 min · 8.4 km',
    avoids: null,
    warning: 'Still on the way: Kaiserstraße (9/10)',
  });
  expect([...planSiteIds(result)]).toEqual(['k']);
});

test('a trip with nothing worth avoiding needs no detour', async () => {
  const result = await plan([], {}, leg(200, ...straight));
  expect(describeWay(result, 0, nameOf)).toEqual({ headline: '3 min · 2.0 km', avoids: 'No detour needed', warning: null, spoken: 'The way, 3 minutes, 2.0 km' });
});

test('a closure without a way around is named', async () => {
  const result = await planRoute({
    places: trip,
    sites: [square('x', 1000, 0)],
    scores: new Map([['x', blocking()]]),
    router: async (_places: LonLat[], cuts: LonLat[][]) => {
      if (cuts.length) throw Object.assign(new Error('Routing server: No path could be found for input'), { code: 442 });
      return leg(200, ...straight);
    },
  });
  expect(describeWay(result, 0, nameOf)).toMatchObject({
    headline: 'Least obstructed · 3 min · 2.0 km',
    warning: 'No way around Im Karrenberg: this is the way through the fewest closures.',
  });
});

test('a site\'s score on a route counts for the way shown', async () => {
  const [rating] = parseSiteRatings([schoolDayRow]);
  const result = await plan([square('s1', 1000, 0)], { s1: rating }, leg(840, ...straight), leg(1080, ...north));
  expect(wayRating(result, 0, rating)).toMatchObject({ siteId: 's1', routeUse: 'avoids', weight: 0, effectiveRating: 0 });
  expect(wayRating(result, 1, rating)).toMatchObject({ routeUse: 'uses', alongM: 40, weight: 1, effectiveScore: 8.7, effectiveRating: 9 });
  expect(wayRating(result, 1, { ...rating, active: false })).toBeNull();
});
