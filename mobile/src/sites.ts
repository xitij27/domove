import type { LatLng } from 'react-native-maps';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type Status = 'current' | 'planned';

export const COLORS: Record<Status, string> = { current: '#d32f2f', planned: '#f9a825' };

export type Site = {
  id: string;
  status: Status;
  coordinate: LatLng;
  title: string;
  owner: string;
  period: string;
  district: string;
};

export type SiteRow = {
  id: string;
  status: string;
  title: string;
  owner: string | null;
  period: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
};

export function toSites(rows: SiteRow[]): Site[] {
  return rows.flatMap((r) => {
    if (r.status !== 'current' && r.status !== 'planned') return [];
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return [];
    return [{
      id: r.id,
      status: r.status,
      coordinate: { latitude: r.latitude, longitude: r.longitude },
      title: r.title,
      owner: r.owner ?? '',
      period: r.period ?? '',
      district: r.district ?? '',
    }];
  });
}

export async function fetchSites(): Promise<Site[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in mobile/.env');
  }
  // shortcut: no pagination, Supabase returns at most 1000 rows; fine for ~200 sites, page with Range headers if that grows
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/construction_sites?select=id,status,title,owner,period,district,latitude,longitude`,
    { headers: { apikey: SUPABASE_KEY } },
  );
  if (!res.ok) throw new Error(`Backend: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Backend: unexpected response');
  return toSites(rows);
}
