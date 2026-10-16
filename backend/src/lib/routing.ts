import type { Modality } from "../db/schema";

/**
 * Route geometry via OSRM (keyless, good for the hackathon).
 *
 * Maps our modality enum to OSRM profiles (car→driving, bike→bike,
 * pedestrian→foot) and returns the full polyline as [lng, lat] pairs from
 * start, through waypoints, to finish. Any failure (network, bad status,
 * empty geometry) falls back to the straight-line input points so one bad
 * route never kills the detection pass.
 */

export interface LngLat {
  lng: number;
  lat: number;
}

export const ROUTING_BASE =
  process.env.ROUTING_BASE_URL ?? "https://router.project-osrm.org";

const PROFILE: Record<Modality, string> = {
  car: "driving",
  bike: "bike",
  pedestrian: "foot",
};

/** Cap polyline length so downstream PostGIS work stays cheap. */
const MAX_VERTICES = 500;

function thin(line: LngLat[]): LngLat[] {
  if (line.length <= MAX_VERTICES) return line;
  const step = Math.ceil(line.length / MAX_VERTICES);
  const out: LngLat[] = [];
  for (let i = 0; i < line.length; i += step) out.push(line[i]);
  const last = line[line.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function isValidCoord(pair: unknown): pair is [number, number] {
  return (
    Array.isArray(pair) &&
    pair.length >= 2 &&
    typeof pair[0] === "number" &&
    typeof pair[1] === "number" &&
    Number.isFinite(pair[0]) &&
    Number.isFinite(pair[1])
  );
}

export async function fetchRouteLine(
  points: LngLat[],
  modality: Modality,
  fetchFn: typeof fetch = fetch,
): Promise<LngLat[]> {
  if (points.length === 0) return [];
  if (points.length === 1) return [...points];
  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url =
      `${ROUTING_BASE}/route/v1/${PROFILE[modality]}/${coords}` +
      `?overview=full&geometries=geojson`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    let res: Response;
    try {
      res = await fetchFn(url, {
        headers: { accept: "application/json" },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return [...points];
    const body = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: unknown } }[];
    };
    if (body.code !== "Ok") return [...points];
    const raw = body.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(raw)) return [...points];
    const line: LngLat[] = [];
    for (const pair of raw) {
      if (isValidCoord(pair)) line.push({ lng: pair[0], lat: pair[1] });
    }
    if (line.length === 0) return [...points];
    return thin(line);
  } catch {
    return [...points];
  }
}

/** Build an EWKT LINESTRING for use as a PostGIS geography param. */
export function routeLineEwkt(line: LngLat[]): string {
  const pts = line.map((p) => `${p.lng} ${p.lat}`).join(",");
  return `SRID=4326;LINESTRING(${pts})`;
}
