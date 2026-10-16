import { MAX_LOCATION_LENGTH, type Coordinate, type Place } from './model';

// shortcut: komoot's public Photon, called directly (fair use, no cache); move behind backend/api with an edge cache if usage grows
// Photon is free, needs no key, and its OSM results may be stored; Mapbox's free geocoding may not be stored.
const PHOTON = 'https://photon.komoot.io';
const SHOWN = 5;

/** Place suggestions for the typed text, nearest to Dortmund's centre first. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  // Photon often lists one place several times (e.g. a station's sign and its stop), so ask for more than shown.
  const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&lat=51.514&lon=7.468&lang=de&limit=10`, { signal });
  if (!res.ok) throw new Error(`Place search: HTTP ${res.status}`);
  return toPlaces(await res.json());
}

/** The name of the place nearest a point on the map, or null where Photon knows none. */
export async function placeNameAt({ latitude, longitude }: Coordinate, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${PHOTON}/reverse?lat=${latitude}&lon=${longitude}&lang=de`, { signal });
  if (!res.ok) throw new Error(`Place lookup: HTTP ${res.status}`);
  return toPlaces(await res.json())[0]?.label ?? null;
}

type PhotonProperties = Partial<Record<'name' | 'street' | 'housenumber' | 'city', unknown>>;

export function toPlaces(body: unknown): Place[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const places = new Map<string, Place>();
  for (const feature of features) {
    const [longitude, latitude] = feature?.geometry?.coordinates ?? [];
    if (!isNumberIn(latitude, 90) || !isNumberIn(longitude, 180)) continue;
    const label = toLabel(feature.properties ?? {});
    if (label && !places.has(label)) places.set(label, { label, coordinate: { latitude, longitude } });
  }
  return [...places.values()].slice(0, SHOWN);
}

// "Hauptbahnhof Dortmund, Königswall, Dortmund", "Hainallee 1, Dortmund"
function toLabel({ name, street, housenumber, city }: PhotonProperties) {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const address = [text(street), text(housenumber)].filter(Boolean).join(' ');
  const parts = [text(name), address, text(city)].filter(Boolean);
  return [...new Set(parts)].join(', ').slice(0, MAX_LOCATION_LENGTH);
}

function isNumberIn(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Math.abs(value) <= limit;
}
