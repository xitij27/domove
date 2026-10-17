import { parseSiteRatings } from '../ratings/model';
import { schoolDayRow } from '../ratings/testRatings';
import type { SavedRoute } from '../routes/model';
import type { DetourApi } from './api';
import type { LonLat } from './geo';
import { at, leg, square } from './testPlan';
import { planTrip } from './trip';

const place = ([longitude, latitude]: LonLat) => ({ label: null, coordinate: { latitude, longitude } });
const route: SavedRoute = {
  id: '12345678-1234-1234-1234-123456789abc',
  name: 'Home → Work',
  start: place(at(0, 0)),
  destination: place(at(2000, 0)),
  mode: 'car',
  startTime: '07:15',
  weekdays: ['monday'],
  waypoints: [
    { id: 'w2', sequence: 2, ...place(at(1500, 0)) },
    { id: 'w1', sequence: 1, ...place(at(500, 0)) },
  ],
  createdAt: '2026-10-16T12:00:00Z',
};

test('rates the sites near the trip for its mode and leaving time, then plans through start, stops in order and destination', async () => {
  const api: DetourApi = {
    areas: jest.fn(async () => [square('s1', 1000, 0), square('far', 1000, 5000)]),
    departure: jest.fn(async () => '2026-11-02T06:15:00+00:00'),
    scores: jest.fn(async () => parseSiteRatings([schoolDayRow])),
  };
  const router = jest.fn(async () => leg(840, [0, 0], [500, 0], [1500, 0], [2000, 0]));
  const { plan, scores } = await planTrip(route, undefined, api, () => router);
  expect(api.departure).toHaveBeenCalledWith(route);
  expect(api.scores).toHaveBeenCalledWith('car', '2026-11-02T06:15:00+00:00', ['s1']);
  const places = (router.mock.calls[0] as unknown as [LonLat[]])[0];
  expect(places.map(([lon]) => lon)).toEqual([at(0, 0), at(500, 0), at(1500, 0), at(2000, 0)].map(([lon]) => lon));
  expect(plan.direct.sites).toEqual([expect.objectContaining({ siteId: 's1', effectiveRating: 9 })]);
  expect(scores.get('s1')).toMatchObject({ rating: 9 });
});
