import { uuid } from 'expo';
import { normalizeRoute, type RouteDraft, type SavedRoute, type SiteCount } from './model';

export type RoutesRepository = {
  list: () => Promise<SavedRoute[]>;
  create: (draft: RouteDraft) => Promise<SavedRoute>;
  /** Replaces a saved route's places, mode, stops and leaving time; it keeps its ID. */
  update: (id: string, draft: RouteDraft) => Promise<SavedRoute>;
  delete: (id: string) => Promise<void>;
  /** IDs of the construction sites the backend's job found on the way of a route; none until it has checked it. */
  obstacleSiteIds: (routeId: string) => Promise<string[]>;
  /** How many sites the job found on the way of each route, by route ID; a route it found none on is left out. */
  siteCounts: () => Promise<ReadonlyMap<string, SiteCount>>;
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
      const route = await request('rpc/create_saved_route', { method: 'POST', body: routeParams(id, clean) }) as SavedRoute | null;
      if (route?.id !== id) throw new Error('Could not confirm the saved route. Refresh the list before trying again.');
      pendingSave = null;
      return route;
    },
    async update(id, draft) {
      checkId(id);
      const route = await request('rpc/update_saved_route', { method: 'POST', body: routeParams(id, normalizeRoute(draft)) }) as SavedRoute | null;
      if (route?.id !== id) throw new Error('Could not confirm the changes. Refresh the list before trying again.');
      return route;
    },
    async delete(id) {
      checkId(id);
      await request(`routes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async obstacleSiteIds(routeId) {
      checkId(routeId);
      const rows = await request(`obstacles?route_id=eq.${encodeURIComponent(routeId)}&select=construction_site_id`);
      if (!Array.isArray(rows)) throw new Error('The server returned an invalid list of construction sites.');
      return rows.flatMap((row) => (typeof row?.construction_site_id === 'string' ? [row.construction_site_id] : []));
    },
    async siteCounts() {
      // Routes are shared, so the obstacles of every route are those of the listed ones. Keyset pages, as in list().
      const counts = new Map<string, SiteCount>();
      let after = '';
      for (;;) {
        const rows = await request(`obstacles?select=id,route_id,construction_sites(status)&order=id&limit=${PAGE_SIZE}${after}`);
        if (!Array.isArray(rows)) throw new Error('The server returned an invalid list of construction sites.');
        for (const row of rows) {
          if (typeof row?.route_id !== 'string') continue;
          const count = counts.get(row.route_id) ?? { total: 0, planned: 0 };
          count.total += 1;
          if (row.construction_sites?.status === 'planned') count.planned += 1;
          counts.set(row.route_id, count);
        }
        if (rows.length < PAGE_SIZE) return counts;
        const last = rows[rows.length - 1]?.id;
        if (typeof last !== 'string') throw new Error('The server returned an invalid list of construction sites.');
        after = `&id=gt.${encodeURIComponent(last)}`;
      }
    },
  };
}

/** The arguments create_saved_route and update_saved_route share. */
function routeParams(id: string, clean: ReturnType<typeof normalizeRoute>) {
  return JSON.stringify({
    p_id: id,
    p_start: clean.start,
    p_finish: clean.destination,
    p_modality: clean.mode,
    p_waypoints: clean.waypoints,
    p_start_time: clean.startTime,
    p_weekdays: clean.weekdays,
  });
}

function checkId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('This route has an invalid ID. Refresh the list and try again.');
  }
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
