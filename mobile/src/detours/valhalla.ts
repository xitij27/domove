import type { TransportMode } from '../routes/model';
import type { LonLat } from './geo';

// FOSSGIS's public Valhalla server, as the dashboard uses it (dashboard/src/routing/valhalla.ts). It needs no key and,
// unlike the OSRM servers, can route around areas (exclude_polygons). Switching to openrouteservice (#12) only changes this file.
const BASE = 'https://valhalla1.openstreetmap.de';
// React Native's fetch never times out on its own.
const REQUEST_TIMEOUT_MS = 20_000;
const COSTINGS: Record<TransportMode, string> = { car: 'auto', bike: 'bicycle', pedestrian: 'pedestrian' };

/** Valhalla's error codes for "no way with these areas left out": unconnected places, no road to start on, no path. */
export const NO_WAY = new Set([170, 171, 442]);

/** The router's error, with Valhalla's error code when it gave one. */
export type RouterError = Error & { code: number | null };
const routerError = (message: string, code: number | null = null): RouterError => Object.assign(new Error(message), { code });
export const errorCode = (e: unknown): number | null =>
  e instanceof Error && typeof (e as RouterError).code === 'number' ? (e as RouterError).code : null;

export type Leg = { line: LonLat[]; seconds: number; meters: number };
/** A trip through the places in order, leaving out the areas given as closed rings of [lon, lat]. */
export type Router = (places: LonLat[], cuts: LonLat[][], signal?: AbortSignal) => Promise<Leg>;

type Answer = {
  trip?: { legs?: { shape?: unknown }[]; summary?: { time?: unknown; length?: unknown } };
  error?: unknown;
  error_code?: unknown;
};

/**
 * Routers for each mode that share one queue: FOSSGIS runs the server on donations, so the whole app asks at most
 * once a second, as the dashboard and the obstacles job do, and never asks the same thing twice.
 */
export function createRouters(fetchImpl: typeof fetch = fetch, gapMs = 1000): (mode: TransportMode) => Router {
  let queue: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  const cache = new Map<string, Promise<Leg>>();

  return (mode) => (places, cuts, signal) => {
    const body = JSON.stringify({
      locations: places.map(([lon, lat]) => ({ lon, lat })),
      costing: COSTINGS[mode],
      directions_type: 'none',
      units: 'kilometers',
      ...(cuts.length ? { exclude_polygons: cuts } : {}),
    });
    const cached = cache.get(body);
    if (cached) return cached;
    const run = queue.then(async () => {
      const wait = lastAt + gapMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      // a route closed while this waited needs no answer
      if (signal?.aborted) throw routerError('Stopped.');
      lastAt = Date.now();
      return ask(fetchImpl, body, signal);
    });
    queue = run.catch(() => undefined);
    cache.set(body, run);
    run.catch(() => cache.delete(body));
    return run;
  };
}

export const valhallaRouter = createRouters();

async function ask(fetchImpl: typeof fetch, body: string, signal?: AbortSignal): Promise<Leg> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop);
  let response: Response;
  let answer: Answer | null;
  try {
    response = await fetchImpl(`${BASE}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    answer = (await response.json().catch(() => null)) as Answer | null;
  } catch {
    throw routerError(signal?.aborted ? 'Stopped.'
      : controller.signal.aborted ? 'The routing server took too long to answer.' : 'Could not reach the routing server.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
  if (!response.ok) {
    const code = typeof answer?.error_code === 'number' ? answer.error_code : null;
    throw routerError(typeof answer?.error === 'string' ? `Routing server: ${answer.error}` : `Routing server: HTTP ${response.status}`, code);
  }
  return readTrip(answer);
}

/** One line through all legs; each leg starts where the one before it ended. */
function readTrip(answer: Answer | null): Leg {
  const legs = answer?.trip?.legs;
  const { time, length } = answer?.trip?.summary ?? {};
  if (!Array.isArray(legs) || !legs.length || typeof time !== 'number' || typeof length !== 'number') {
    throw routerError('Unexpected answer from the routing server.');
  }
  let line: LonLat[] = [];
  for (const leg of legs) {
    if (typeof leg?.shape !== 'string') throw routerError('Unexpected answer from the routing server.');
    const points = decodePolyline(leg.shape);
    line = line.concat(line.length ? points.slice(1) : points);
  }
  if (line.length < 2) throw routerError('Unexpected answer from the routing server.');
  return { line, seconds: time, meters: length * 1000 };
}

/** Decodes an encoded polyline into [lon, lat] pairs; Valhalla encodes with 6 decimals. */
export function decodePolyline(text: string, precision = 6): LonLat[] {
  const factor = 10 ** precision;
  const out: LonLat[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    // arithmetic instead of bit shifts, which overflow 32 bits for long first values
    let result = 0;
    let scale = 1;
    let byte: number;
    do {
      byte = text.charCodeAt(index++) - 63;
      result += (byte & 0x1f) * scale;
      scale *= 32;
    } while (byte >= 0x20);
    return result % 2 ? -(result + 1) / 2 : result / 2;
  };
  while (index < text.length) {
    lat += next();
    lon += next();
    out.push([lon / factor, lat / factor]);
  }
  return out;
}
