import { sql } from "drizzle-orm";
import { getDb } from "../db/index";
import { parsePointWkt } from "../db/geo";
import type { Modality } from "../db/schema";
import {
  fetchAllSites,
  syncConstructionSites,
  type SyncSummary,
} from "./dortmundApi";
import { fetchRouteLine, routeLineEwkt, type LngLat } from "./routing";

/**
 * Backend event loop: construction sites vs. user routes → obstacles.
 *
 * One pass:
 *   1. Sync both Dortmund ODS feeds into public.construction_sites
 *      (areas in `geom`, centroids in `location`).
 *   2. Iterate over all routes (+ ordered waypoints).
 *   3. Resolve each route to a full polyline via the routing engine
 *      (start → waypoints → finish, modality-aware).
 *   4. Match sites whose area (or, while geom is null, whose centroid
 *      buffered by the area-equivalent radius, else SITE_FALLBACK_RADIUS_M)
 *      intersects the route line buffered by ROUTE_BUFFER_M.
 *   5. Upsert one obstacles row per (route, site) hit, refresh
 *      distance_meters/detected_at on re-hits, delete rows that no
 *      longer intersect.
 */

const ROUTE_BUFFER_M = Number(process.env.ROUTE_BUFFER_M ?? 30);
const SITE_FALLBACK_RADIUS_M = Number(
  process.env.SITE_FALLBACK_RADIUS_M ?? 25,
);

export interface RouteHit {
  siteId: string;
  distanceMeters: number | null;
}

export interface PassSummary {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  routesChecked: number;
  sites: SyncSummary | null;
  obstaclesWritten: number;
  obstaclesPruned: number;
  errors: { routeId?: string; message: string }[];
}

function errMessage(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  // Drizzle wraps the Postgres error in `cause` — surface it first, since
  // the wrapper text is long and the cause carries the actual reason.
  const cause =
    err instanceof Error && (err as { cause?: unknown }).cause instanceof Error
      ? `${(err as { cause: Error }).cause.message} | `
      : "";
  return `${cause}${base}`.slice(0, 800);
}

let running = false;
let lastRun: PassSummary | null = null;

export function isDetectionRunning(): boolean {
  return running;
}

export function getLastRun(): PassSummary | null {
  return lastRun;
}

interface RouteRow {
  [key: string]: unknown;
  id: string;
  modality: Modality;
  startWkt: string;
  finishWkt: string;
}

interface WaypointRow {
  [key: string]: unknown;
  routeId: string;
  wkt: string;
  seq: number;
}

function mustParse(wkt: string, what: string): LngLat {
  const pt = parsePointWkt(wkt);
  if (!pt) throw new Error(`unparsable ${what} WKT: ${wkt}`);
  return pt;
}

async function findHits(
  routeLine: LngLat[],
): Promise<RouteHit[]> {
  const db = getDb();
  const ewkt = routeLineEwkt(routeLine);
  // Sites match on their stored polygon area. While geom is null (e.g. a
  // site whose feed polygon was unusable), fall back to buffering the
  // centroid by the area-equivalent radius sqrt(area/pi) — or the global
  // SITE_FALLBACK_RADIUS_M when no area is known either.
  const rows = await db.execute<{ site_id: string; dist: number | null }>(sql`
    select
      cs.id as site_id,
      ST_Distance(${ewkt}::geography, cs.location)::float8 as dist
    from public.construction_sites cs
    where ST_Intersects(
      coalesce(
        cs.geom,
        ST_Buffer(
          cs.location,
          coalesce(sqrt(cs.area_sqm / pi()), ${SITE_FALLBACK_RADIUS_M})
        )
      ),
      ST_Buffer(${ewkt}::geography, ${ROUTE_BUFFER_M})
    )
  `);
  return rows.map((r) => ({ siteId: r.site_id, distanceMeters: r.dist }));
}

async function reconcileObstacles(
  routeId: string,
  hits: RouteHit[],
): Promise<{ written: number; pruned: number }> {
  const db = getDb();
  let written = 0;
  for (const hit of hits) {
    await db.execute(sql`
      insert into public.obstacles (route_id, construction_site_id, distance_meters, detected_at)
      values (${routeId}, ${hit.siteId}, ${hit.distanceMeters}, now())
      on conflict (route_id, construction_site_id) do update set
        distance_meters = excluded.distance_meters,
        detected_at = now()
    `);
    written++;
  }
  const ids = hits.map((h) => h.siteId);
  let pruned = 0;
  if (ids.length > 0) {
    const res = await db.execute<{ n: string }>(sql`
      with deleted as (
        delete from public.obstacles
        where route_id = ${routeId}
          and construction_site_id not in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        returning id
      )
      select count(*)::text as n from deleted
    `);
    pruned = Number(res[0]?.n ?? 0);
  } else {
    const res = await db.execute<{ n: string }>(sql`
      with deleted as (
        delete from public.obstacles where route_id = ${routeId} returning id
      )
      select count(*)::text as n from deleted
    `);
    pruned = Number(res[0]?.n ?? 0);
  }
  return { written, pruned };
}

export async function runDetectionPass(): Promise<PassSummary> {
  if (running) {
    throw new Error("detection pass already running");
  }
  running = true;
  const startedAt = new Date();
  const errors: PassSummary["errors"] = [];
  let routesChecked = 0;
  let sites: SyncSummary | null = null;
  let obstaclesWritten = 0;
  let obstaclesPruned = 0;

  try {
    // Step 1: sync construction-site areas from Dortmund open data.
    try {
      const normalized = await fetchAllSites();
      sites = await syncConstructionSites(normalized);
    } catch (err) {
      errors.push({ message: `site sync failed: ${errMessage(err)}` });
    }

    // Step 2: iterate over all routes in the database.
    const db = getDb();
    const routes = await db.execute<RouteRow>(sql`
      select
        id,
        modality,
        ST_AsText(start_location) as "startWkt",
        ST_AsText(finish_location) as "finishWkt"
      from public.routes
      order by created_at asc
    `);
    const waypoints = await db.execute<WaypointRow>(sql`
      select
        route_id as "routeId",
        ST_AsText(location) as wkt,
        seq
      from public.route_waypoints
      order by route_id, seq asc
    `);
    const byRoute = new Map<string, LngLat[]>();
    for (const w of waypoints) {
      const pt = parsePointWkt(w.wkt);
      if (!pt) {
        errors.push({
          routeId: w.routeId,
          message: `skipping unparsable waypoint seq=${w.seq}`,
        });
        continue;
      }
      const list = byRoute.get(w.routeId) ?? [];
      list.push(pt);
      byRoute.set(w.routeId, list);
    }

    // Steps 3–5: per route — polyline, match, write obstacles.
    for (const route of routes) {
      try {
        const stops: LngLat[] = [
          mustParse(route.startWkt, "start"),
          ...(byRoute.get(route.id) ?? []),
          mustParse(route.finishWkt, "finish"),
        ];
        const line = await fetchRouteLine(stops, route.modality);
        const hits = await findHits(line);
        const { written, pruned } = await reconcileObstacles(route.id, hits);
        obstaclesWritten += written;
        obstaclesPruned += pruned;
        routesChecked++;
      } catch (err) {
        errors.push({ routeId: route.id, message: errMessage(err) });
      }
    }
  } finally {
    running = false;
  }

  const finishedAt = new Date();
  lastRun = {
    ok: errors.length === 0,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    routesChecked,
    sites,
    obstaclesWritten,
    obstaclesPruned,
    errors,
  };
  return lastRun;
}
