import { decimal, number, shortDate, strings } from '../i18n';
import type { TransportMode } from '../routes/model';

// Impact scores as public.site_ratings() and public.route_site_ratings() return them
// (backend/supabase/migrations/20261017120000_site_ratings.sql, docs/site-rating-and-detours.md).
// The server works the score out; this file only reads it and puts every point into words.

export type Band = 'none' | 'low' | 'medium' | 'high' | 'severe';
export type Impact = 'none' | 'slowed' | 'blocked';
export type ClosureKind =
  | 'full' | 'carriageway' | 'half' | 'narrowing' | 'signal'
  | 'one_way' | 'sidewalk' | 'moving' | 'parking' | 'unknown';
export type NotCounted = 'weekend' | 'school_holiday' | 'public_holiday' | 'outside_school_hours' | 'not_rush_hour' | 'not_same_day';

/** One line of a score's breakdown. `points` of all lines add up to the score. */
export type Reason = {
  factor: string;
  points: number;
  /** Set when the factor applies to the site but doesn't count at this time. */
  not_counted?: NotCounted;
  /** The holiday's name, when that is why. */
  free_day?: string;
  impact?: Impact;
  penalty_s?: number;
  closures?: ClosureKind[];
  road_class?: 'main' | 'through' | 'other';
  road_name?: string | null;
  max?: number;
  closure_factor?: number;
  road_factor?: number;
  multiplier?: number;
  name?: string | null;
  type?: string | null;
  primary?: boolean;
  kind?: string;
  m?: number;
  count?: number;
  nearest_m?: number;
  running?: boolean;
  from_h?: number;
  to_h?: number;
};

export type SiteRating = {
  siteId: string;
  /** 0–10, the score rounded half up. */
  rating: number;
  score: number;
  band: Band;
  impact: Impact;
  /** Whether the site runs at `ratedAt`: its dates, and the hours of daytime-only works. */
  active: boolean;
  startsOn: string | null;
  endsOn: string | null;
  disruption: number;
  surroundings: number;
  ratedAt: string;
  reasons: Reason[];
};

/** How a route meets a site: along its street, across it, or only past it; or, on the app's own way around, not at all. */
export type RouteUse = 'uses' | 'crosses' | 'passes' | 'avoids' | 'unknown';

export type RouteSiteRating = SiteRating & {
  alongM: number | null;
  routeUse: RouteUse;
  /** Share of the score that counts for the route. */
  weight: number;
  effectiveScore: number;
  effectiveRating: number;
};

const BANDS: readonly Band[] = ['none', 'low', 'medium', 'high', 'severe'];
const USES: readonly RouteUse[] = ['uses', 'crosses', 'passes', 'unknown'];

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const day = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

function parseOne(row: unknown): SiteRating {
  const r = row as Record<string, unknown> | null;
  const rating = num(r?.rating);
  const score = num(r?.score);
  if (!r || typeof r.site_id !== 'string' || rating === null || score === null || !BANDS.includes(r.band as Band)
    || !Array.isArray(r.reasons) || typeof r.rated_at !== 'string') {
    throw new Error(strings().errors.invalidScore);
  }
  return {
    siteId: r.site_id,
    rating,
    score,
    band: r.band as Band,
    impact: r.impact === 'blocked' || r.impact === 'slowed' ? r.impact : 'none',
    active: r.active !== false,
    startsOn: day(r.starts_on),
    endsOn: day(r.ends_on),
    disruption: num(r.disruption) ?? 0,
    surroundings: num(r.surroundings) ?? 0,
    ratedAt: r.rated_at,
    reasons: r.reasons.flatMap((reason) => {
      const x = reason as Reason | null;
      return x && typeof x.factor === 'string' ? [{ ...x, points: num(x.points) ?? 0 }] : [];
    }),
  };
}

export function parseSiteRatings(rows: unknown): SiteRating[] {
  if (!Array.isArray(rows)) throw new Error(strings().errors.invalidScores);
  return rows.map(parseOne);
}

export function parseRouteRatings(rows: unknown): RouteSiteRating[] {
  if (!Array.isArray(rows)) throw new Error(strings().errors.invalidScores);
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const base = parseOne(row);
    return {
      ...base,
      alongM: num(r.along_m),
      routeUse: USES.includes(r.route_use as RouteUse) ? (r.route_use as RouteUse) : 'unknown',
      weight: num(r.weight) ?? 1,
      effectiveScore: num(r.effective_score) ?? base.score,
      effectiveRating: num(r.effective_rating) ?? base.rating,
    };
  });
}

/** "+1.5", "−1.0" or "0". */
export function formatPoints(points: number): string {
  if (points > 0) return `+${decimal(points, 1)}`;
  if (points < 0) return `−${decimal(Math.abs(points), 1)}`;
  return '0';
}

const factorText = (n: number) => number(Math.round(n * 100) / 100);
const at = (name: string | null | undefined, m: number | undefined) => [name, m != null ? strings().ratings.away(m) : null].filter(Boolean).join(', ');

function delay(seconds: number): string {
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

function notCountedText(reason: Reason): string {
  const t = strings().ratings;
  const why = reason.not_counted && Object.hasOwn(t.why, reason.not_counted) ? t.why[reason.not_counted] : t.notNow;
  const holiday = reason.not_counted === 'school_holiday' || reason.not_counted === 'public_holiday';
  return holiday && reason.free_day ? `${why} (${reason.free_day})` : why;
}

export type ReasonText = {
  label: string;
  detail: string | null;
  points: number;
  /** False for a factor that applies but doesn't count right now. */
  counted: boolean;
  /** A note that never carries points, such as "works only during the day". */
  note: boolean;
};

/** One line of the breakdown in words, for the way the score is for. */
export function describeReason(reason: Reason, mode: TransportMode): ReasonText {
  const t = strings().ratings;
  const who = t.who[mode];
  const counted = !reason.not_counted;
  const why = (text: string | null) => (counted ? text : t.notCounted(notCountedText(reason)));
  const line = (label: string, detail: string | null, note = false): ReasonText =>
    ({ label, detail: why(detail), points: reason.points, counted, note });

  switch (reason.factor) {
    case 'closure': {
      const kinds = t.kinds((reason.closures ?? ['unknown']).map((k) => t.closures[k] ?? k));
      const road = t.roads[reason.road_class ?? 'other'];
      const effect = reason.impact === 'blocked' ? t.blocks(who)
        : reason.impact === 'slowed' ? t.slows(who, delay(reason.penalty_s ?? 0))
          : t.noRestriction(who);
      const sum = reason.impact !== 'none' && reason.closure_factor != null && reason.road_factor != null
        ? ` · ${factorText(reason.max ?? 6)} × ${factorText(reason.closure_factor)} × ${factorText(reason.road_factor)}`
        : '';
      return line(t.on(kinds, reason.road_name ?? null, road), `${effect}${sum}`);
    }
    case 'rush_hour':
      return line(counted ? t.rushHourTimes(number(reason.multiplier ?? 1.3)) : t.rushHour, counted ? t.rushHourDetail : null);
    case 'daytime_only':
      return line(t.daytimeOnly(reason.from_h ?? 6, reason.to_h ?? 22), reason.running === false ? t.notRunningNow : t.runningNow, true);
    case 'surroundings_unknown':
      return line(t.surroundingsUnknown, t.surroundingsUnknownDetail, true);
    case 'no_effect':
      return line(t.noEffect(who), t.noEffectDetail, true);
    case 'school':
      return line(at(reason.name, reason.m) || t.schoolNearby, reason.primary ? t.primarySchool : t.school(reason.type ?? null));
    case 'school_route_crossings':
      return line(t.schoolCrossings(reason.count ?? 0), t.schoolCrossingsDetail);
    case 'crossings':
      return line(t.crossings(reason.count ?? 0), t.crossingsDetail);
    case 'care':
      return line(at(reason.name, reason.m) || t.careNearby, reason.kind === 'kindergarten' ? t.kindergarten : t.careHome);
    case 'emergency':
      return line(at(reason.name, reason.m) || t.emergencyNearby, reason.kind === 'hospital' ? t.hospital : t.fireStation);
    case 'transit':
      return line(at(reason.name, reason.m) || t.stopNearby, reason.kind === 'rail_stop' ? t.railStop : t.busStop);
    case 'nearby_works':
      return line(t.nearbyWorks(reason.count ?? 0), reason.nearest_m != null ? t.nearestWorks(reason.nearest_m) : t.detoursMeet);
    case 'surroundings_cap':
      return line(t.surroundingsCap(reason.max ?? 4), null);
    default:
      return line(reason.factor, null);
  }
}

/** "for cars · Mon 2 Nov, 08:00" */
export function ratedFor(mode: TransportMode, ratedAt: string): string {
  const t = strings().ratings;
  const date = new Date(ratedAt);
  if (Number.isNaN(date.getTime())) return t.ratedFor(t.who[mode], null);
  const pad = (n: number) => String(n).padStart(2, '0');
  return t.ratedFor(t.who[mode], `${shortDate(date)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`);
}

/** How much of a site's score counts for the route, and why. */
export function routeUseText(r: RouteSiteRating): string {
  const t = strings().ratings;
  switch (r.routeUse) {
    case 'uses':
      return t.uses(r.alongM ?? '?');
    case 'crosses':
      return r.weight === 0 ? t.crossesFree : t.crosses(Math.round(r.weight * 100), decimal(r.effectiveScore, 1));
    case 'passes':
      return t.passes;
    case 'avoids':
      return t.avoids;
    default:
      return t.unmeasured;
  }
}

/** How many of a route's sites count as high or severe for it. */
export const highOnRoute = (ratings: Iterable<RouteSiteRating>) =>
  [...ratings].filter((r) => r.active && r.effectiveRating >= 7).length;

export const bandOf = (rating: number): Band =>
  rating <= 0 ? 'none' : rating <= 3 ? 'low' : rating <= 6 ? 'medium' : rating <= 8 ? 'high' : 'severe';
