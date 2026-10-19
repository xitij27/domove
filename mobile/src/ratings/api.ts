import { strings } from '../i18n';
import type { TransportMode } from '../routes/model';
import { parseRouteRatings, parseSiteRatings, type RouteSiteRating, type SiteRating } from './model';

// React Native's fetch never times out on its own.
const REQUEST_TIMEOUT_MS = 15_000;

export type RatingsApi = {
  /** A site's score for a mode at a time; null when the site has left the feed. */
  site: (siteId: string, mode: TransportMode, at?: Date) => Promise<SiteRating | null>;
  /** The scores of the sites on a route's way, for its mode at its next departure. */
  route: (routeId: string) => Promise<RouteSiteRating[]>;
  /** Every number the scores use, by key, as the server has them now. */
  weights: () => Promise<Record<string, number>>;
};

/** Publishable-key REST access, as in src/sites.ts. */
export function createRatingsApi(
  url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
): RatingsApi {
  async function request(path: string, body?: object): Promise<unknown> {
    if (!url || !key) throw new Error('Impact scores need a backend connection. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new Error(controller.signal.aborted ? strings().errors.scoreSlow : strings().errors.scoreUnreachable);
    } finally {
      clearTimeout(timer);
    }
    // 404: the database doesn't have the ratings migration yet
    if (!response.ok) throw new Error(strings().errors.scoresUnavailable(response.status));
    return response.json();
  }

  return {
    async site(siteId, mode, at = new Date()) {
      const rows = parseSiteRatings(await request('rpc/site_ratings', { p_modality: mode, p_at: at.toISOString(), p_site_ids: [siteId] }));
      return rows.find((r) => r.siteId === siteId) ?? null;
    },
    async route(routeId) {
      return parseRouteRatings(await request('rpc/route_site_ratings', { p_route_id: routeId }));
    },
    async weights() {
      const rows = await request('rating_weights?select=key,value');
      if (!Array.isArray(rows)) throw new Error(strings().errors.invalidWeights);
      return Object.fromEntries(rows.flatMap((r) => (typeof r?.key === 'string' && typeof r?.value === 'number' ? [[r.key, r.value]] : [])));
    },
  };
}

export const ratingsApi = createRatingsApi();
