import { decimal, strings, type Strings } from '../i18n';
import type { RouteSiteRating, SiteRating } from '../ratings/model';
import type { Candidate, Plan, SiteOnPath } from './planner';

// What the route card says about the way shown: how long it takes, what it goes around and what is still in the way.

/** "18 min", "1 h 05 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** "850 m", "6.2 km". */
export function formatDistance(meters: number): string {
  const rounded = Math.round(meters / 10) * 10;
  return rounded < 1000 ? `${rounded} m` : `${decimal(meters / 1000, 1)} km`;
}

/** A site's name for a sentence: the place its title starts with, e.g. "Im Karrenberg" of "Im Karrenberg - Fahrbahnsanierung // Vollsperrung". */
export function siteName(title: string | undefined): string {
  const name = title?.split(/\s+-\s+|\/\//)[0].trim();
  if (!name) return strings().detours.aSite;
  return name.length > 32 ? `${name.slice(0, 31).trimEnd()}…` : name;
}

/** "A", "A and B", "A and 2 more". */
const list = (names: string[]) => strings().detours.list(names);

const worstFirst = (a: SiteOnPath, b: SiteOnPath) => Number(b.blocked) - Number(a.blocked) || b.effectiveScore - a.effectiveScore;

/** Minutes the way takes longer than the direct path; 0 for the direct path itself. */
export const extraMinutes = (plan: Plan, way: Candidate) =>
  way.kind === 'direct' ? 0 : Math.max(0, Math.round((way.seconds - plan.direct.seconds) / 60));

/** Sites whose street the direct path uses and that count, but this way doesn't use. */
export function avoidedBy(plan: Plan, way: Candidate): SiteOnPath[] {
  const used = new Set(way.sites.filter((s) => s.use === 'uses').map((s) => s.siteId));
  return plan.direct.sites
    .filter((s) => s.use === 'uses' && !s.atPlace && (s.blocked || s.effectiveRating >= 1) && !used.has(s.siteId))
    .sort(worstFirst);
}

type WayKind = keyof Strings['detours']['labels'];

function wayKind(plan: Plan, index: number): WayKind {
  const way = plan.options[index];
  // when every way runs through a closure, the one shown is the best of bad ones
  if (index === 0) return way.blockedBy.length ? 'leastObstructed' : 'recommended';
  return way.kind === 'direct' ? 'direct' : 'other';
}

export const wayLabel = (plan: Plan, index: number): string => strings().detours.labels[wayKind(plan, index)];

export type WayText = {
  /** "Recommended · 18 min (+4 min) · 6.2 km" */
  headline: string;
  /** "Avoids Kaiserstraße (9/10)" */
  avoids: string | null;
  /** What the way can't get around. */
  warning: string | null;
  /** For screen readers: "Recommended way, 18 minutes, 6.2 km, 4 minutes longer than the direct way, avoids 1 construction site". */
  spoken: string;
};

export function describeWay(plan: Plan, index: number, nameOf: (siteId: string) => string): WayText {
  const t = strings().detours;
  const way = plan.options[index];
  const extra = extraMinutes(plan, way);
  // a direct path with nothing worth avoiding is just the way
  const kind = plan.searched ? wayKind(plan, index) : null;
  const avoided = avoidedBy(plan, way);
  const minutes = Math.max(1, Math.round(way.seconds / 60));
  return {
    headline: [kind && t.labels[kind], `${formatDuration(way.seconds)}${extra > 0 ? ` (+${extra} min)` : ''}`, formatDistance(way.meters)].filter(Boolean).join(' · '),
    avoids: !plan.searched ? t.noDetour
      : avoided.length ? t.avoids(list(avoided.map((s) => `${nameOf(s.siteId)} (${s.blocked ? t.closed : `${s.effectiveRating}/10`})`))) : null,
    warning: warningFor(way, nameOf),
    spoken: [
      kind ? t.spoken[kind] : t.theWay,
      t.minutes(minutes),
      formatDistance(way.meters),
      ...(extra > 0 ? [t.longer(extra)] : []),
      ...(avoided.length ? [t.avoidsCount(avoided.length)] : []),
    ].join(', '),
  };
}

function warningFor(way: Candidate, nameOf: (siteId: string) => string): string | null {
  const t = strings().detours;
  const blocking = way.sites.filter((s) => s.blocked && !s.atPlace);
  if (blocking.length) return t.noWayAround(list(blocking.map((s) => nameOf(s.siteId))));
  const atPlaces = way.sites.filter((s) => s.atPlace && (s.blocked || s.effectiveRating >= 4)).sort(worstFirst);
  if (atPlaces.length) return t.atPlaces(list(atPlaces.map((s) => nameOf(s.siteId))), atPlaces.length === 1);
  const still = way.sites.filter((s) => !s.atPlace && s.effectiveRating >= 4).sort(worstFirst);
  return still.length ? t.stillOnWay(list(still.map((s) => `${nameOf(s.siteId)} (${s.effectiveRating}/10)`))) : null;
}

/** Every site a drawn path meets. */
export function planSiteIds(plan: Plan): Set<string> {
  return new Set([plan.direct, ...plan.options].flatMap((c) => c.sites.map((s) => s.siteId)));
}

/** A site's score as it counts for the way shown, in the shape route_site_ratings returns; null for a site not running then. */
export function wayRating(plan: Plan, index: number, rating: SiteRating): RouteSiteRating | null {
  if (!rating.active) return null;
  const onWay = plan.options[index].sites.find((s) => s.siteId === rating.siteId);
  if (onWay) {
    const { alongM, use, weight, effectiveScore, effectiveRating } = onWay;
    return { ...rating, alongM, routeUse: use, weight, effectiveScore, effectiveRating };
  }
  const avoided = plan.direct.sites.some((s) => s.siteId === rating.siteId);
  return { ...rating, alongM: null, routeUse: avoided ? 'avoids' : 'passes', weight: 0, effectiveScore: 0, effectiveRating: 0 };
}
