import type { SiteRating } from '../ratings/model';
import type { SavedRoute, TransportMode } from '../routes/model';
import { routePlaces } from '../routes/routePath';
import { detourApi, type DetourApi } from './api';
import { bboxGap, bboxOf, toXY, type LonLat } from './geo';
import { planRoute, type Plan } from './planner';
import { valhallaRouter, type Router } from './valhalla';

// Sites this far from the box around the trip's places are left out. A detour rarely strays that far in a city,
// and rating every site in Dortmund for each trip would be a big download.
const NEAR_M = 2000;

export type TripPlan = { plan: Plan; scores: ReadonlyMap<string, SiteRating> };

/** A saved route's way around the construction sites that run when it is next taken. */
export async function planTrip(
  route: SavedRoute,
  signal?: AbortSignal,
  api: DetourApi = detourApi,
  routerFor: (mode: TransportMode) => Router = valhallaRouter,
): Promise<TripPlan> {
  const places = routePlaces(route).map((place): LonLat => [place.coordinate.longitude, place.coordinate.latitude]);
  const [areas, at] = await Promise.all([api.areas(), api.departure(route)]);
  const box = bboxOf(places.map(toXY));
  const sites = areas.filter((site) => bboxGap(site.shape.bbox, box) <= NEAR_M);
  const ratings = await api.scores(route.mode, at, sites.map((site) => site.id));
  const scores = new Map(ratings.map((rating) => [rating.siteId, rating]));
  const plan = await planRoute({ places, sites, scores, router: routerFor(route.mode), signal });
  return { plan, scores };
}
