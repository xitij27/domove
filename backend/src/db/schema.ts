import {
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * PostGIS `geography(Point, 4326)` column.
 *
 * drizzle-orm ships a `geometry` type but no `geography` type, so we map it
 * with a custom type. Values are EWKT strings, e.g. `"SRID=4326;POINT(13.4 52.5)"`
 * (note: POINT takes `lng lat` order). Postgres auto-casts EWKT text to
 * geography on insert, so plain strings work for writes.
 *
 * Use the helpers in `./geo.ts` (`geogPoint`, `geogPointSql`) to build values
 * instead of hand-writing EWKT. For reads, select with `ST_AsText`/`ST_AsGeoJSON`
 * (see helpers) — a bare select returns PostGIS EWKB hex, which is not
 * human-readable.
 */
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Point, 4326)";
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: unknown): string {
    return value as string;
  },
});

export const geographyMultipolygon = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(MultiPolygon, 4326)";
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: unknown): string {
    return value as string;
  },
});

export const modalityEnum = pgEnum("modality", ["pedestrian", "bike", "car"]);

export const weekdayEnum = pgEnum("weekday", [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export type Modality = (typeof modalityEnum.enumValues)[number];
export type Weekday = (typeof weekdayEnum.enumValues)[number];

export const routes = pgTable(
  "routes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`extensions.gen_random_uuid()`),
    name: text("name").notNull().default("Untitled route"),
    startLocation: geographyPoint("start_location").notNull(),
    finishLocation: geographyPoint("finish_location").notNull(),
    startLabel: text("start_label"),
    finishLabel: text("finish_label"),
    // time of day only, no date — "HH:MM:SS" string
    startTime: time("start_time"),
    startDate: date("start_date"),
    weekdays: weekdayEnum("weekdays").array().notNull().default(sql`'{}'`),
    modality: modalityEnum("modality").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "routes_schedule_complete",
      sql`cardinality(${t.weekdays}) = 0 or ${t.startTime} is not null`,
    ),
    check(
      "routes_start_date_complete",
      sql`${t.startDate} is null or (${t.startTime} is not null and cardinality(${t.weekdays}) = 0)`,
    ),
    // NOTE: the GiST indexes on start/finish_location and the GIN index on
    // weekdays live in the Supabase SQL migration (drizzle can't express
    // index methods like gist/gin). This schema intentionally doesn't
    // redeclare them — Supabase migrations remain the source of truth for DDL.
  ],
);

export const routeWaypoints = pgTable(
  "route_waypoints",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`extensions.gen_random_uuid()`),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    location: geographyPoint("location").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("route_waypoints_seq_non_negative", sql`${t.seq} >= 0`),
    uniqueIndex("route_waypoints_route_seq_uidx").on(t.routeId, t.seq),
    index("route_waypoints_route_seq_idx").on(t.routeId, t.seq),
    // NOTE: GiST index on location lives in the Supabase SQL migration.
  ],
);

export type Route = typeof routes.$inferSelect;
export type NewRoute = typeof routes.$inferInsert;
export type RouteWaypoint = typeof routeWaypoints.$inferSelect;
export type NewRouteWaypoint = typeof routeWaypoints.$inferInsert;

export const constructionSites = pgTable(
  "construction_sites",
  {
    // NOTE: this mirrors the LIVE database, which drifted from the original
    // supabase/migrations drafts: text md5-style id, status/owner/period
    // columns, lat/lon floats, centroid `location`, and polygon `geom`
    // (added by 20261016170000_site_geometries_obstacles.sql).
    id: text("id").primaryKey(),
    status: text("status"),
    title: text("title").notNull(),
    owner: text("owner"),
    period: text("period"),
    district: text("district"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    location: geographyPoint("location").notNull(),
    geom: geographyMultipolygon("geom"),
    // footprint in m², derived from geom via ST_Area (written by the sync)
    areaSqm: doublePrecision("area_sqm"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  () => [
    // NOTE: GiST indexes on location/geom live in the Supabase SQL
    // migrations (drizzle can't express gist). Supabase migrations remain
    // the source of truth for DDL.
  ],
);

export const obstacles = pgTable(
  "obstacles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`extensions.gen_random_uuid()`),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    // NOTE: construction_sites.id is text (external hash), not uuid.
    constructionSiteId: text("construction_site_id")
      .notNull()
      .references(() => constructionSites.id, { onDelete: "cascade" }),
    distanceMeters: doublePrecision("distance_meters"),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "obstacles_distance_non_negative",
      sql`${t.distanceMeters} is null or ${t.distanceMeters} >= 0`,
    ),
    uniqueIndex("obstacles_route_site_uidx").on(t.routeId, t.constructionSiteId),
    index("obstacles_route_idx").on(t.routeId),
    index("obstacles_site_idx").on(t.constructionSiteId),
  ],
);

export type ConstructionSite = typeof constructionSites.$inferSelect;
export type NewConstructionSite = typeof constructionSites.$inferInsert;
export type Obstacle = typeof obstacles.$inferSelect;
export type NewObstacle = typeof obstacles.$inferInsert;
