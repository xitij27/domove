import { sql, type SQL } from "drizzle-orm";

/**
 * Helpers for the PostGIS `geography(Point, 4326)` columns.
 *
 * POINT coordinate order is (lng, lat) — e.g. Vienna: lng 16.37, lat 48.21.
 */

/** Build an EWKT value for insert/update, e.g. `"SRID=4326;POINT(16.37 48.21)"`. */
export function geogPoint(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/**
 * SQL fragment `ST_GeogFromText(...)` for use inside insert/update values
 * when you prefer the DB to parse the point (equivalent to `geogPoint`).
 */
export function geogPointSql(lng: number, lat: number): SQL {
  return sql`ST_GeogFromText(${`SRID=4326;POINT(${lng} ${lat})`})`;
}

/** `ST_AsText(location)` — select the point as human-readable WKT. */
export function asWkt(column: SQL | string): SQL {
  return sql`ST_AsText(${typeof column === "string" ? sql.raw(column) : column})`;
}

/** `ST_AsGeoJSON(location)::json` — select the point as a GeoJSON object. */
export function asGeoJson(column: SQL | string): SQL {
  return sql`ST_AsGeoJSON(${typeof column === "string" ? sql.raw(column) : column})::json`;
}

/** Parse `"POINT(lng lat)"` WKT into `{ lng, lat }`. Returns null if unparsable. */
export function parsePointWkt(wkt: string): { lng: number; lat: number } | null {
  const m = /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/.exec(wkt);
  if (!m) return null;
  return { lng: Number(m[1]), lat: Number(m[2]) };
}
