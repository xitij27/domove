import type { LatLng } from 'react-native-maps';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type Status = 'current' | 'planned';

// What a site does to traffic, named as in issue #12's closure kinds. Each has its own sign on the map (docs/map-signs.md).
export type Closure = 'full' | 'one_way' | 'cycle_path' | 'sidewalk' | 'signal' | 'half' | 'narrowing' | 'other';

// Most restrictive first: a title that names several gets the first one that matches.
const ROAD_CLOSURES: [Closure, RegExp][] = [
  ['full', /vollsperrung|\bvsp\b/i],
  ['one_way', /einbahn/i],
  ['signal', /\blsa\b|ampel/i],
  ['half', /halbs|halb\.\s*sp|wechselseitig/i],
  ['narrowing', /einengung|spureinzug/i],
];
// "Vollsperrung Fußweg" closes the footpath, not the road.
const FOOTPATH_CLOSED = /vollsperrung\s+fu(?:ß|ss)weg/i;
const SIDEWALK_CLOSED = /geh\w*sp|sp\.?-gehweg|vollsperrung\s+fu(?:ß|ss)weg/i;
const CYCLE_PATH = /rade?weg/i;

const roadClosure = (text: string) => ROAD_CLOSURES.find(([, pattern]) => pattern.test(text.replace(FOOTPATH_CLOSED, '')))?.[0];

/**
 * The feed's restriction field is empty, so this reads the title, e.g. "Im Karrenberg - Fahrbahnsanierung // Vollsperrung".
 * shortcut: move to the `closures` column once #12's classify_closures() fills it in the database.
 */
export function closureOf(title: string): Closure {
  // The place comes first; a closed cycle path such as "Emscherradweg zw. … - Ausbau Radweg /// Vollsperrung" isn't a road.
  if (CYCLE_PATH.test(title.split(/ - |\//)[0])) return 'cycle_path';
  // The restriction usually follows "//". The work before it may name traffic lights being replaced ("Austausch LSA // Einengung").
  const slashes = title.indexOf('//');
  const restriction = slashes < 0 ? title : title.slice(slashes + 2);
  return roadClosure(restriction) ?? roadClosure(title) ?? (SIDEWALK_CLOSED.test(title) ? 'sidewalk' : 'other');
}

export type Site = {
  id: string;
  status: Status;
  closure: Closure;
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
      closure: closureOf(r.title),
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
