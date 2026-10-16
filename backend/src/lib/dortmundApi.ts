import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index";

/**
 * Dortmund open-data construction sites (Opendatasoft v2.1, no auth).
 *
 * - fb66-baustellen-tagesaktuell-flachen → status 'current' (~158 areas)
 * - fb66-baustellen-geplant-flachen     → status 'planned' (~54 areas)
 *
 * Each record carries a MultiPolygon/Polygon area (`geo_shape`) plus a
 * centroid (`geografische_koordinate` / `geo_point_2d`, field name differs
 * per dataset). Volumes are tiny, so each pass fetches both datasets fully
 * (paged, limit=100) and matches routes locally in PostGIS instead of
 * querying per route coordinate.
 */

export const ODS_BASE =
  process.env.DORTMUND_ODS_BASE ?? "https://open-data.dortmund.de";

const PAGE_SIZE = 100;

interface OdsDataset {
  datasetId: string;
  status: "current" | "planned";
  centroidField: "geografische_koordinate" | "geo_point_2d";
  districtField: "stadtbezirk" | "stadtbezirk_bezeichnung";
}

export const ODS_DATASETS: OdsDataset[] = [
  {
    datasetId: "fb66-baustellen-tagesaktuell-flachen",
    status: "current",
    centroidField: "geografische_koordinate",
    districtField: "stadtbezirk",
  },
  {
    datasetId: "fb66-baustellen-geplant-flachen",
    status: "planned",
    centroidField: "geo_point_2d",
    districtField: "stadtbezirk_bezeichnung",
  },
];

export interface NormalizedSite {
  /** Deterministic id for NEW rows (md5). Existing rows keep their DB id. */
  stableId: string;
  status: "current" | "planned";
  title: string;
  owner: string | null;
  period: string | null;
  district: string | null;
  startsOn: string | null; // YYYY-MM-DD
  endsOn: string | null; // YYYY-MM-DD
  longitude: number;
  latitude: number;
  /** MultiPolygon geometry object (for ST_GeomFromGeoJSON). Null if unusable. */
  geom: { type: "MultiPolygon"; coordinates: number[][][][] } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRecord = Record<string, any>;

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function asIsoDate(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  return v.slice(0, 10);
}

/** Extract the geometry object from an ODS geo_shape Feature wrapper. */
function extractGeometry(
  geoShape: unknown,
): { type: string; coordinates: unknown } | null {
  if (!geoShape || typeof geoShape !== "object") return null;
  const shape = geoShape as Record<string, unknown>;
  // ODS wraps as { type: 'Feature', geometry: {...} }; accept bare too.
  const inner =
    shape.geometry && typeof shape.geometry === "object"
      ? (shape.geometry as Record<string, unknown>)
      : shape;
  if (typeof inner.type !== "string" || inner.coordinates == null) return null;
  return { type: inner.type, coordinates: inner.coordinates };
}

function bboxCenter(
  coords: number[][][][],
): { lng: number; lat: number } | null {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const poly of coords)
    for (const ring of poly)
      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const [lng, lat] = pt;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
  if (!Number.isFinite(minLng)) return null;
  return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
}

/** Pure normalizer — unit-testable with a raw ODS record. */
export function normalizeRecord(
  dataset: OdsDataset,
  raw: RawRecord,
): NormalizedSite | null {
  const title =
    asNonEmptyString(raw.art_der_baumassnahme) ?? "Unnamed Baustelle";
  const owner = asNonEmptyString(raw.auftraggeber);
  const period = asNonEmptyString(raw.zeitraum);
  const district = asNonEmptyString(raw[dataset.districtField]);
  const startsOn = asIsoDate(raw.von);
  const endsOn = asIsoDate(raw.bis);

  const geomRaw = extractGeometry(raw.geo_shape);
  let geom: NormalizedSite["geom"] = null;
  if (geomRaw?.type === "MultiPolygon" && Array.isArray(geomRaw.coordinates)) {
    geom = {
      type: "MultiPolygon",
      coordinates: geomRaw.coordinates as number[][][][],
    };
  } else if (geomRaw?.type === "Polygon" && Array.isArray(geomRaw.coordinates)) {
    geom = {
      type: "MultiPolygon",
      coordinates: [geomRaw.coordinates as number[][][]],
    };
  }

  // Centroid preferred; fall back to polygon bbox center.
  const centroid = raw[dataset.centroidField] as
    | { lon?: unknown; lat?: unknown }
    | undefined;
  let longitude =
    typeof centroid?.lon === "number" ? centroid.lon : Number.NaN;
  let latitude =
    typeof centroid?.lat === "number" ? centroid.lat : Number.NaN;
  if ((!Number.isFinite(longitude) || !Number.isFinite(latitude)) && geom) {
    const c = bboxCenter(geom.coordinates);
    if (c) {
      longitude = c.lng;
      latitude = c.lat;
    }
  }
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  const stableId = createHash("md5")
    .update(
      [
        dataset.status,
        title,
        startsOn ?? "",
        endsOn ?? "",
        longitude.toFixed(6),
        latitude.toFixed(6),
      ].join("|"),
      "utf8",
    )
    .digest("hex");

  return {
    stableId,
    status: dataset.status,
    title,
    owner,
    period,
    district,
    startsOn,
    endsOn,
    longitude,
    latitude,
    geom,
  };
}

async function fetchDatasetRecords(
  datasetId: string,
  fetchFn: typeof fetch = fetch,
): Promise<RawRecord[]> {
  const out: RawRecord[] = [];
  let offset = 0;
  for (;;) {
    const url =
      `${ODS_BASE}/api/explore/v2.1/catalog/datasets/${datasetId}` +
      `/records?limit=${PAGE_SIZE}&offset=${offset}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetchFn(url, {
        headers: { accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(
          `ODS request failed: ${datasetId} offset=${offset} → HTTP ${res.status}`,
        );
      }
      const body = (await res.json()) as {
        total_count?: number;
        results?: RawRecord[];
      };
      const results = Array.isArray(body.results) ? body.results : [];
      out.push(...results);
      const total = body.total_count ?? results.length;
      offset += results.length;
      if (results.length === 0 || offset >= total) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/** Fetch + normalize both Dortmund feeds. No DB involved. */
export async function fetchAllSites(
  fetchFn: typeof fetch = fetch,
): Promise<NormalizedSite[]> {
  const sites: NormalizedSite[] = [];
  for (const dataset of ODS_DATASETS) {
    const records = await fetchDatasetRecords(dataset.datasetId, fetchFn);
    for (const raw of records) {
      try {
        const site = normalizeRecord(dataset, raw);
        if (site) sites.push(site);
      } catch {
        // Skip malformed records — one bad polygon must not kill the pass.
      }
    }
  }
  return sites;
}

export interface SyncSummary {
  fetched: number;
  upserted: number;
  inserted: number;
  pruned: number;
}

/**
 * Upsert normalized sites into public.construction_sites.
 *
 * Existing rows are matched on their natural key (title + dates + centroid)
 * so the pre-existing md5-style ids (whose hash scheme is unknown) are
 * preserved; only genuinely new sites get `stableId`. Rows not seen in this
 * pass (stale, removed from the feed) are deleted.
 */
export async function syncConstructionSites(
  sites: NormalizedSite[],
): Promise<SyncSummary> {
  const db = getDb();
  let upserted = 0;
  let inserted = 0;

  // Never prune on an empty feed result — that signals an API outage, not
  // that all construction sites vanished.
  if (sites.length === 0) {
    return { fetched: 0, upserted: 0, inserted: 0, pruned: 0 };
  }

  for (const site of sites) {
    const geomJson =
      site.geom !== null ? JSON.stringify(site.geom) : null;
    // Natural-key lookup first (preserves pre-existing row ids).
    const existing = await db.execute<{ id: string }>(sql`
      select id from public.construction_sites
      where title = ${site.title}
        and starts_on is not distinct from ${site.startsOn}::date
        and ends_on is not distinct from ${site.endsOn}::date
        and abs(longitude - ${site.longitude}) < 1e-9
        and abs(latitude - ${site.latitude}) < 1e-9
      limit 1
    `);
    if (existing.length > 0) {
      // NOTE: `location` is GENERATED ALWAYS from (longitude, latitude) —
      // never write it; updating lat/lon refreshes it automatically.
      // ST_GeomFromGeoJSON is strict, so a NULL param yields NULL geom/area.
      // area_sqm is re-derived from the polygon on every upsert so it can
      // never drift out of sync with geom.
      await db.execute(sql`
        update public.construction_sites set
          status = ${site.status},
          owner = ${site.owner},
          period = ${site.period},
          district = ${site.district},
          latitude = ${site.latitude},
          longitude = ${site.longitude},
          geom = ST_GeomFromGeoJSON(${geomJson})::geography,
          area_sqm = ST_Area(ST_GeomFromGeoJSON(${geomJson})::geography),
          last_seen_at = now()
        where id = ${existing[0].id}
      `);
      upserted++;
    } else {
      await db.execute(sql`
        insert into public.construction_sites
          (id, status, title, owner, period, district, starts_on, ends_on,
           latitude, longitude, geom, area_sqm, last_seen_at)
        values (
          ${site.stableId}, ${site.status}, ${site.title}, ${site.owner},
          ${site.period}, ${site.district},
          ${site.startsOn}::date, ${site.endsOn}::date,
          ${site.latitude}, ${site.longitude},
          ST_GeomFromGeoJSON(${geomJson})::geography,
          ST_Area(ST_GeomFromGeoJSON(${geomJson})::geography),
          now()
        )
        on conflict (id) do update set
          status = excluded.status,
          title = excluded.title,
          owner = excluded.owner,
          period = excluded.period,
          district = excluded.district,
          starts_on = excluded.starts_on,
          ends_on = excluded.ends_on,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          geom = excluded.geom,
          area_sqm = excluded.area_sqm,
          last_seen_at = now()
      `);
      // Same ST_GeomFromGeoJSON NULL note as above: no special-casing.
      inserted++;
    }
  }

  // Prune sites that vanished from the feed (not seen for >1h grace).
  const pruned = await db.execute<{ n: string }>(sql`
    with deleted as (
      delete from public.construction_sites
      where last_seen_at < now() - interval '1 hour'
      returning id
    )
    select count(*)::text as n from deleted
  `);

  return {
    fetched: sites.length,
    upserted,
    inserted,
    pruned: Number(pruned[0]?.n ?? 0),
  };
}
