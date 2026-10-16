import { uuid } from 'expo';
import { normalizeRoute, type RouteDraft, type SavedRoute } from './model';
import { toSites, type Site } from '../sites';

export type RoutesRepository = {
  list: () => Promise<SavedRoute[]>;
  create: (draft: RouteDraft) => Promise<SavedRoute>;
  delete: (id: string) => Promise<void>;
  /** Construction sites on the way of a route, detected by the backend job. */
  listObstacles: (routeId: string) => Promise<RouteObstacle[]>;
};

export type RouteObstacle = {
  siteId: string;
  distanceMeters: number | null;
  detectedAt: string;
  site: Site | null;
};

// React Native's fetch never times out on its own, and the route screens stay
// locked while a request is pending.
const REQUEST_TIMEOUT_MS = 15_000;
// Must stay below the backend's row cap (Supabase max_rows, 1,000 by default),
// or a full page would look like the last one.
const PAGE_SIZE = 100;

/** Uses the same publishable-key REST access as src/sites.ts. No service key. */
export function createRoutesRepository(
  url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  newId: () => string = uuid.v4,
): RoutesRepository {
  // A draft keeps its ID until it is saved, so retrying after a lost response
  // returns the route the server already saved instead of a duplicate.
  let pendingSave: { draft: string; id: string } | null = null;

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    if (!url || !key) {
      throw new Error('Routes need a backend connection. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
        ...init,
        signal: controller.signal,
        headers: { apikey: key, 'Content-Type': 'application/json', ...init?.headers },
      });
      text = await response.text();
    } catch {
      throw new Error(controller.signal.aborted
        ? 'The server took too long to respond. Check your connection and try again.'
        : 'Could not reach the server. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }
    const body = parseJson(text);
    if (!response.ok) throw new Error(failureMessage(response.status, body));
    return body;
  }

  return {
    async list() {
      // Keyset pages stay consistent while routes are added or deleted elsewhere.
      const routes: SavedRoute[] = [];
      let after = '';
      for (;;) {
        const rows = await request(`saved_routes?select=route&order=created_at.desc,id.desc&limit=${PAGE_SIZE}${after}`);
        if (!Array.isArray(rows) || rows.some((row) => !row?.route?.id)) throw new Error('The server returned an invalid route list.');
        routes.push(...rows.map((row: { route: SavedRoute }) => row.route));
        if (rows.length < PAGE_SIZE) return routes;
        const { createdAt, id } = routes[routes.length - 1];
        after = `&or=${encodeURIComponent(`(created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id}))`)}`;
      }
    },
    async create(draft) {
      const clean = normalizeRoute(draft);
      const fingerprint = JSON.stringify(clean);
      if (pendingSave?.draft !== fingerprint) pendingSave = { draft: fingerprint, id: newId() };
      const { id } = pendingSave;
      const route = await request('rpc/create_saved_route', {
        method: 'POST',
        body: JSON.stringify({
          p_id: id,
          p_start: clean.start,
          p_finish: clean.destination,
          p_modality: clean.mode,
          p_waypoints: clean.waypoints,
          p_start_time: clean.startTime,
          p_weekdays: clean.weekdays,
        }),
      }) as SavedRoute | null;
      if (route?.id !== id) throw new Error('Could not confirm the saved route. Refresh the list before trying again.');
      pendingSave = null;
      return route;
    },
    async delete(id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('This route has an invalid ID. Refresh the list and try again.');
      }
      await request(`routes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async listObstacles(routeId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routeId)) {
        throw new Error('This route has an invalid ID. Refresh the list and try again.');
      }
      const rows = await request(
        `obstacles?route_id=eq.${encodeURIComponent(routeId)}&select=construction_site_id,distance_meters,detected_at&order=detected_at.desc`,
      );
      if (!Array.isArray(rows)) throw new Error('The server returned an invalid obstacle list.');
      const obstacles: RouteObstacle[] = rows.flatMap((row): RouteObstacle[] => {
        if (typeof row?.construction_site_id !== 'string' || typeof row?.detected_at !== 'string') return [];
        return [{
          siteId: row.construction_site_id,
          distanceMeters: typeof row.distance_meters === 'number' ? row.distance_meters : null,
          detectedAt: row.detected_at,
          site: null,
        }];
      });
      if (obstacles.length === 0) return obstacles;
      const ids = [...new Set(obstacles.map((o) => o.siteId))];
      const siteRows = await request(
        `construction_sites?select=id,status,title,owner,period,district,latitude,longitude&id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})`,
      );
      if (!Array.isArray(siteRows)) throw new Error('The server returned an invalid obstacle list.');
      const byId = new Map(toSites(siteRows as Parameters<typeof toSites>[0]).map((site) => [site.id, site]));
      return obstacles.map((obstacle) => ({ ...obstacle, site: byId.get(obstacle.siteId) ?? null }));
    },
  };
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function failureMessage(status: number, body: unknown): string {
  // The create RPC raises its validation messages with SQLSTATE 22023.
  const error = body as { code?: unknown; message?: unknown } | null | undefined;
  if (error?.code === '22023' && typeof error.message === 'string') return error.message;
  if (status === 404) return 'Saved routes are not available right now. Please try again later.';
  return `Could not complete the request (HTTP ${status}). Please try again.`;
}

export const routesRepository = createRoutesRepository();
