import { parseSiteRatings, type SiteRating } from '../ratings/model';
import type { SavedRoute, TransportMode } from '../routes/model';
import { circleShape, shapeOf, toXY, type LonLat } from './geo';
import type { PlanSite } from './planner';

// React Native's fetch never times out on its own.
const REQUEST_TIMEOUT_MS = 15_000;
// The sites change with the hourly sync; their areas are the biggest download here, so they are kept a while.
const AREAS_FOR_MS = 10 * 60_000;
// A site without an area counts as a circle this big, as in the dashboard.
const POINT_RADIUS_M = 25;

export type DetourApi = {
  /** Every construction site's area. */
  areas: () => Promise<PlanSite[]>;
  /** When the route is next taken, as the server works it out for the scores on a route (route_departure). */
  departure: (route: SavedRoute) => Promise<string>;
  /** The sites' scores for a mode at a time. */
  scores: (mode: TransportMode, at: string, siteIds: string[]) => Promise<SiteRating[]>;
};

/** Publishable-key REST access, as in src/sites.ts. */
export function createDetourApi(
  url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  now: () => number = Date.now,
): DetourApi {
  let areas: { at: number; value: Promise<PlanSite[]> } | null = null;

  async function request(path: string, body?: object, accept = 'application/json'): Promise<unknown> {
    if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { apikey: key, 'Content-Type': 'application/json', Accept: accept },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new Error(controller.signal.aborted ? 'The server took too long to answer.' : 'Could not reach the server.');
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`The server could not help right now (HTTP ${response.status}).`);
    return response.json();
  }

  return {
    areas() {
      if (areas && now() - areas.at < AREAS_FOR_MS) return areas.value;
      // PostgREST then answers with a FeatureCollection whose geometry is the site's area
      const value = request('construction_sites?select=id,latitude,longitude,geom', undefined, 'application/geo+json').then(parseAreas);
      const entry = { at: now(), value };
      areas = entry;
      value.catch(() => { if (areas === entry) areas = null; });
      return value;
    },
    async departure(route) {
      const at = await request('rpc/route_departure', {
        p_start_time: route.startTime,
        p_weekdays: route.weekdays,
        p_start_date: route.startDate ?? null,
      });
      if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) throw new Error('The server returned an invalid leaving time.');
      return at;
    },
    async scores(mode, at, siteIds) {
      if (!siteIds.length) return [];
      return parseSiteRatings(await request('rpc/site_ratings', { p_modality: mode, p_at: at, p_site_ids: siteIds }));
    },
  };
}

export const detourApi = createDetourApi();

type Feature = { geometry?: { type?: unknown; coordinates?: unknown } | null; properties?: Record<string, unknown> | null };

export function parseAreas(body: unknown): PlanSite[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) throw new Error('The server returned invalid construction site areas.');
  return features.flatMap((f: Feature | null): PlanSite[] => {
    const id = f?.properties?.id;
    if (typeof id !== 'string') return [];
    const type = f?.geometry?.type;
    const coordinates = f?.geometry?.coordinates;
    if (Array.isArray(coordinates) && (type === 'Polygon' || type === 'MultiPolygon')) {
      return [{ id, shape: shapeOf(type === 'Polygon' ? [coordinates] : coordinates) }];
    }
    const longitude = f?.properties?.longitude;
    const latitude = f?.properties?.latitude;
    if (typeof longitude !== 'number' || typeof latitude !== 'number') return [];
    return [{ id, shape: circleShape(toXY([longitude, latitude] as LonLat), POINT_RADIUS_M) }];
  });
}
