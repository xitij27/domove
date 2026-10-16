import { type NotificationRoute, isRoute } from './model';

/** Read-only adapter for the Issue #1 saved_routes view. No route creation or deletion here. */
export async function listNotificationRoutes(
  url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
): Promise<NotificationRoute[]> {
  if (!url || !key) throw new Error('Set the Supabase URL and publishable key in mobile/.env.local.');
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/saved_routes?select=route&order=created_at.desc`, {
      headers: { apikey: key },
    });
  } catch {
    throw new Error('Could not reach saved routes. Check your connection.');
  }
  if (!response.ok) throw new Error('Saved routes are unavailable. Apply the Issue #1 route migration.');
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.some((row) => !isRoute(row?.route))) throw new Error('Saved routes returned invalid data.');
  return rows.map((row) => row.route as NotificationRoute);
}
