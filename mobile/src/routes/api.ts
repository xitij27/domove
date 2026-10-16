import { normalizeRoute, type RouteDraft, type SavedRoute } from './model';

export type RoutesRepository = {
  list: () => Promise<SavedRoute[]>;
  create: (draft: RouteDraft) => Promise<SavedRoute>;
  delete: (id: string) => Promise<void>;
};

/** Uses the same publishable-key REST access as src/sites.ts. No service key. */
export function createRoutesRepository(
  url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
): RoutesRepository {
  async function request(path: string, init?: RequestInit): Promise<Response> {
    if (!url || !key) {
      throw new Error('Routes need a backend connection. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env.');
    }
    let response: Response;
    try {
      response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: key, 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (!response.ok) {
      if (response.status === 404) throw new Error('Routes are not configured yet. Apply the Issue #1 database migration.');
      throw new Error(`Could not complete the request (HTTP ${response.status}). Please try again.`);
    }
    return response;
  }

  return {
    async list() {
      // Small pages also work when the backend has its default 1,000-row cap.
      const routes: SavedRoute[] = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const response = await request(`saved_routes?select=route&order=created_at.desc,id.desc&limit=${pageSize}&offset=${offset}`);
        const rows: { route: SavedRoute }[] = await response.json();
        if (!Array.isArray(rows) || rows.some((row) => !row.route?.id)) throw new Error('The server returned an invalid route list.');
        routes.push(...rows.map((row) => row.route));
        if (rows.length < pageSize) return routes;
      }
    },
    async create(draft) {
      const clean = normalizeRoute(draft);
      const response = await request('rpc/create_saved_route', {
        method: 'POST',
        body: JSON.stringify({
          p_start_label: clean.start,
          p_finish_label: clean.destination,
          p_modality: clean.mode,
          p_waypoints: clean.waypoints,
        }),
      });
      const route: SavedRoute = await response.json();
      if (!route?.id) throw new Error('Could not confirm the saved route. Refresh the list before trying again.');
      return route;
    },
    async delete(id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('This route has an invalid ID. Refresh the list and try again.');
      }
      await request(`routes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

export const routesRepository = createRoutesRepository();
