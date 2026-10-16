import { type RouteObstacle, isObstacle } from './model';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type ObstacleRow = {
  route_id: string;
  construction_site_id: string;
  routes: { finish_label: string | null } | null;
  construction_sites: { title: string; starts_on: string | null; ends_on: string | null } | null;
};

/** Rows the backend returns half-filled are skipped, so one bad row can't stop every alert. */
export function toObstacles(rows: unknown[]): RouteObstacle[] {
  return rows.flatMap((value) => {
    const row = value as Partial<ObstacleRow> | null;
    const obstacle = {
      routeId: row?.route_id,
      siteId: row?.construction_site_id,
      siteTitle: row?.construction_sites?.title,
      destination: row?.routes?.finish_label ?? null,
      startsOn: row?.construction_sites?.starts_on ?? null,
      endsOn: row?.construction_sites?.ends_on ?? null,
    };
    return isObstacle(obstacle) ? [obstacle] : [];
  });
}

export async function fetchObstacles(): Promise<RouteObstacle[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env');
  }
  // shortcut: no pagination, Supabase returns at most 1000 rows; fine for a team's routes, page with Range headers if that grows
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/obstacles?select=route_id,construction_site_id,routes(finish_label),construction_sites(title,starts_on,ends_on)`,
    { headers: { apikey: SUPABASE_KEY } },
  );
  if (!res.ok) throw new Error(`Backend: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Backend: unexpected response');
  return toObstacles(rows);
}
