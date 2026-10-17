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

export const BAND_LABELS: Record<Band, string> = {
  none: 'No effect',
  low: 'Low impact',
  medium: 'Medium impact',
  high: 'High impact',
  severe: 'Severe impact',
};

/** "for cars": who the score is for. */
export const MODE_NOUNS: Record<TransportMode, string> = { car: 'cars', bike: 'bikes', pedestrian: 'people on foot' };

const CLOSURE_NAMES: Record<ClosureKind, string> = {
  full: 'Full closure',
  carriageway: 'One carriageway closed',
  half: 'Half closure',
  narrowing: 'Lane narrowing',
  signal: 'Temporary traffic lights',
  one_way: 'One-way rule',
  sidewalk: 'Sidewalk closed',
  moving: 'Moving works',
  parking: 'Parking lane closed',
  unknown: 'Works without a named restriction',
};

const ROAD_NAMES = { main: 'main road', through: 'through road', other: 'smaller street' } as const;

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
    throw new Error('The server returned an invalid impact score.');
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
  if (!Array.isArray(rows)) throw new Error('The server returned an invalid list of impact scores.');
  return rows.map(parseOne);
}

export function parseRouteRatings(rows: unknown): RouteSiteRating[] {
  if (!Array.isArray(rows)) throw new Error('The server returned an invalid list of impact scores.');
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
  if (points > 0) return `+${points.toFixed(1)}`;
  if (points < 0) return `−${Math.abs(points).toFixed(1)}`;
  return '0';
}

const factorText = (n: number) => String(Math.round(n * 100) / 100);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const at = (name: string | null | undefined, m: number | undefined) => [name, m != null ? `${m} m away` : null].filter(Boolean).join(', ');

function delay(seconds: number): string {
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

function notCountedText(reason: Reason): string {
  const named = reason.free_day ? ` (${reason.free_day})` : '';
  switch (reason.not_counted) {
    case 'weekend': return 'weekend';
    case 'school_holiday': return `school holidays${named}`;
    case 'public_holiday': return `public holiday${named}`;
    case 'outside_school_hours': return 'outside school hours';
    case 'not_rush_hour': return 'not rush hour';
    case 'not_same_day': return 'not running on the same day';
    default: return 'not at this time';
  }
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
  const who = MODE_NOUNS[mode];
  const counted = !reason.not_counted;
  const why = (text: string | null) => (counted ? text : `Not counted: ${notCountedText(reason)}`);
  const line = (label: string, detail: string | null, note = false): ReasonText =>
    ({ label, detail: why(detail), points: reason.points, counted, note });

  switch (reason.factor) {
    case 'closure': {
      const names = (reason.closures ?? ['unknown']).map((k, i) => (i === 0 ? CLOSURE_NAMES[k] ?? k : (CLOSURE_NAMES[k] ?? k).toLowerCase()));
      const kinds = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      const road = reason.road_class ?? 'other';
      const where = reason.road_name ? `${reason.road_name} (${ROAD_NAMES[road]})` : `a ${ROAD_NAMES[road]}`;
      const effect = reason.impact === 'blocked' ? `Blocks ${who}`
        : reason.impact === 'slowed' ? `Slows ${who} by about ${delay(reason.penalty_s ?? 0)}`
          : `Doesn't restrict ${who}`;
      const sum = reason.impact !== 'none' && reason.closure_factor != null && reason.road_factor != null
        ? ` · ${factorText(reason.max ?? 6)} × ${factorText(reason.closure_factor)} × ${factorText(reason.road_factor)}`
        : '';
      return line(`${kinds} on ${where}`, `${effect}${sum}`);
    }
    case 'rush_hour':
      return line(counted ? `Rush hour (×${reason.multiplier ?? 1.3})` : 'Rush hour', counted ? 'Slow traffic queues longer' : null);
    case 'daytime_only':
      return line(`Works only ${reason.from_h ?? 6}:00–${reason.to_h ?? 22}:00`,
        reason.running === false ? 'Not running at this time' : 'Running at this time', true);
    case 'surroundings_unknown':
      return line('Surroundings not checked yet', 'New sites are checked within the hour', true);
    case 'no_effect':
      return line(`Changes nothing for ${who}`, 'So what is around it doesn\'t count', true);
    case 'school':
      return line(at(reason.name, reason.m) || 'A school nearby',
        reason.primary ? 'Primary or special school, on school days' : `School${reason.type ? ` (${reason.type})` : ''}, on school days`);
    case 'school_route_crossings':
      return line(plural(reason.count ?? 0, 'crossing on a school route', 'crossings on a school route'),
        'Near a primary or special school, on school days');
    case 'crossings':
      return line(plural(reason.count ?? 0, 'crossing with lights or markings', 'crossings with lights or markings'),
        'At or next to the site');
    case 'care':
      return line(at(reason.name, reason.m) || 'Care nearby',
        reason.kind === 'kindergarten' ? 'Kindergarten, on working days' : 'Care home');
    case 'emergency':
      return line(at(reason.name, reason.m) || 'Emergency services nearby',
        reason.kind === 'hospital' ? 'Hospital: ambulances may need another way' : 'Fire and rescue station: fire engines may need another way');
    case 'transit':
      return line(at(reason.name, reason.m) || 'A stop nearby', reason.kind === 'rail_stop' ? 'Stadtbahn stop' : 'Bus stop');
    case 'nearby_works':
      return line(plural(reason.count ?? 0, 'other site close by', 'other sites close by'),
        reason.nearest_m != null ? `Nearest ${reason.nearest_m} m away: detours run into each other` : 'Detours run into each other');
    case 'surroundings_cap':
      return line(`Surroundings count ${reason.max ?? 4} points at most`, null);
    default:
      return line(reason.factor, null);
  }
}

/** "for cars · Mon 2 Nov, 08:00" */
export function ratedFor(mode: TransportMode, ratedAt: string): string {
  const date = new Date(ratedAt);
  if (Number.isNaN(date.getTime())) return `for ${MODE_NOUNS[mode]}`;
  const pad = (n: number) => String(n).padStart(2, '0');
  const when = `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `for ${MODE_NOUNS[mode]} · ${when}`;
}

/** How much of a site's score counts for the route, and why. */
export function routeUseText(r: RouteSiteRating): string {
  switch (r.routeUse) {
    case 'uses':
      return `Your route runs ${r.alongM ?? '?'} m through it, so all of it counts`;
    case 'crosses':
      return r.weight === 0
        ? 'Your route only crosses it and the junction stays open, so it doesn\'t count'
        : `Your route only crosses it, so ${Math.round(r.weight * 100)} % counts: ${r.effectiveScore.toFixed(1)}`;
    case 'passes':
      return 'Your route only passes it, so it doesn\'t count';
    case 'avoids':
      return 'The way shown goes around it, so it doesn\'t count';
    default:
      return 'Not measured against your route yet, so all of it counts';
  }
}

/** How many of a route's sites count as high or severe for it. */
export const highOnRoute = (ratings: Iterable<RouteSiteRating>) =>
  [...ratings].filter((r) => r.active && r.effectiveRating >= 7).length;

export const bandOf = (rating: number): Band =>
  rating <= 0 ? 'none' : rating <= 3 ? 'low' : rating <= 6 ? 'medium' : rating <= 8 ? 'high' : 'severe';
