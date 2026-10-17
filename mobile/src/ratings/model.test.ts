import { describeReason, formatPoints, highOnRoute, parseRouteRatings, parseSiteRatings, routeUseText } from './model';
import { crossingRouteRow, holidayRow, schoolDayRow } from './testRatings';

test('reads the server\'s rows, numbers sent as text included', () => {
  const [rating] = parseSiteRatings([{ ...schoolDayRow, score: '8.7', disruption: '4.7' }]);
  expect(rating).toMatchObject({ siteId: 's1', rating: 9, score: 8.7, band: 'severe', impact: 'slowed', active: true, disruption: 4.7, startsOn: '2026-10-14' });
  expect(rating.reasons).toHaveLength(6);
  expect(() => parseSiteRatings([{ ...schoolDayRow, band: 'awful' }])).toThrow('invalid impact score');
  expect(() => parseSiteRatings({})).toThrow('invalid list');
});

test('every point is put into words', () => {
  const [rating] = parseSiteRatings([schoolDayRow]);
  expect(rating.reasons.map((r) => describeReason(r, 'car'))).toEqual([
    { label: 'Half closure and lane narrowing on Kaiserstraße (main road)', detail: 'Slows cars by about 2 min · 6 × 0.6 × 1', points: 3.6, counted: true, note: false },
    { label: 'Rush hour (×1.3)', detail: 'Slow traffic queues longer', points: 1.1, counted: true, note: false },
    { label: 'Berswordt-Europa-Grundschule, 83 m away', detail: 'Primary or special school, on school days', points: 1.5, counted: true, note: false },
    { label: '4 crossings on a school route', detail: 'Near a primary or special school, on school days', points: 1.5, counted: true, note: false },
    { label: 'Ev. Kiga Melanchthon, 79 m away', detail: 'Kindergarten, on working days', points: 0.5, counted: true, note: false },
    { label: 'Von-der-Tann-Straße, 14 m away', detail: 'Stadtbahn stop', points: 0.5, counted: true, note: false },
  ]);
});

test('a factor that doesn\'t count at this time says why', () => {
  const [rating] = parseSiteRatings([holidayRow]);
  const school = describeReason(rating.reasons[2], 'car');
  expect(school).toMatchObject({ points: 0, counted: false, detail: 'Not counted: school holidays (Herbstferien)' });
  expect(describeReason({ factor: 'rush_hour', points: 0, not_counted: 'not_rush_hour' }, 'car'))
    .toMatchObject({ label: 'Rush hour', detail: 'Not counted: not rush hour', counted: false });
  expect(describeReason({ factor: 'nearby_works', points: 0, count: 2, not_counted: 'not_same_day' }, 'bike').detail)
    .toBe('Not counted: not running on the same day');
});

test('the closure is described for the mode', () => {
  const blocked = { factor: 'closure', points: 1.8, impact: 'blocked' as const, closures: ['full' as const], road_class: 'other' as const, road_name: null, max: 6, closure_factor: 1, road_factor: 0.3 };
  expect(describeReason(blocked, 'bike')).toMatchObject({ label: 'Full closure on a smaller street', detail: 'Blocks bikes · 6 × 1 × 0.3' });
  const none = { factor: 'closure', points: 0, impact: 'none' as const, closures: ['half' as const], road_class: 'main' as const, road_name: 'Kaiserstraße' };
  expect(describeReason(none, 'pedestrian').detail).toBe('Doesn\'t restrict people on foot');
  expect(describeReason({ factor: 'no_effect', points: 0 }, 'car')).toMatchObject({ label: 'Changes nothing for cars', note: true });
  expect(describeReason({ factor: 'surroundings_cap', points: -1, max: 4 }, 'pedestrian'))
    .toMatchObject({ label: 'Surroundings count 4 points at most', points: -1 });
});

test('points read as gains, caps as losses', () => {
  expect(formatPoints(1.5)).toBe('+1.5');
  expect(formatPoints(-1)).toBe('−1.0');
  expect(formatPoints(0)).toBe('0');
});

test('a route says how much of each site counts for it', () => {
  const [crossing] = parseRouteRatings([crossingRouteRow]);
  expect(crossing).toMatchObject({ routeUse: 'crosses', weight: 0.3, effectiveScore: 2.6, effectiveRating: 3, alongM: 12 });
  expect(routeUseText(crossing)).toBe('Your route only crosses it, so 30 % counts: 2.6');
  expect(routeUseText({ ...crossing, weight: 0 })).toBe('Your route only crosses it and the junction stays open, so it doesn\'t count');
  expect(routeUseText({ ...crossing, routeUse: 'uses', alongM: 150 })).toBe('Your route runs 150 m through it, so all of it counts');
  expect(routeUseText({ ...crossing, routeUse: 'passes' })).toBe('Your route only passes it, so it doesn\'t count');
  expect(highOnRoute([crossing, { ...crossing, effectiveRating: 9 }, { ...crossing, effectiveRating: 9, active: false }])).toBe(1);
});
