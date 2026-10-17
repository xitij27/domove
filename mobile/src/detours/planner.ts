import type { Impact } from '../ratings/model';
import { bboxGap, bboxOf, pointAt, pointShapeDist, samplesAlong, sharedShare, toLonLat, toXY, type LonLat, type Shape, type XY } from './geo';
import { errorCode, NO_WAY, type Leg, type Router } from './valhalla';

// How a trip finds its way around construction sites (docs/site-rating-and-detours.md, section 2): ask the router for
// up to four paths, score each as travel time plus a penalty for every site it still uses, and recommend the cheapest
// within a detour limit. A path through a site that blocks the mode is out, unless every path goes through one.

/** rating_weights' reach_m: a path this close to a site's area runs inside it. */
const REACH_M = 5;
/** rating_weights' uses_street_m: a path further than this inside a site uses its street. */
const USES_STREET_M = 20;
/** rating_weights' crossing_weight: the share of a slowed site's score that counts when a path only crosses it. */
const CROSSING_WEIGHT = 0.3;
/** Seconds per squared effective score: 10 s for a 1/10, 16⅔ min for a 10/10. */
const PENALTY_S = 10;
/** Sites rated this high or more are worth a detour; a path using one makes the planner look for another. */
const MEDIUM = 4;
const HIGH = 7;
/** Rounds of "leave out the sites the new path runs into, and ask again" for each candidate. */
const MAX_ROUNDS = 3;
/** The public server takes at most 100 vertices of exclude_polygons: 19 squares of 30 m, as in the dashboard. */
export const MAX_CUTS = 19;
const CUT_SIDE_M = 30;
/** Candidates this much slower than the direct path are dropped, unless the direct path is blocked. */
const MAX_SLOWER = 0.5;
const MAX_SLOWER_S = 15 * 60;
/** A candidate that shares more of its length than this with a cheaper one adds nothing. */
const SAME_WAY = 0.85;
/** The recommendation and up to two others. */
const MAX_OPTIONS = 3;

export type PlanSite = { id: string; shape: Shape };
/** What the planner needs of a site's impact score (SiteRating in ratings/model). */
export type SiteScore = { impact: Impact; score: number; rating: number; active: boolean };

/** How a path meets a site that runs at the travel time. */
export type SiteOnPath = {
  siteId: string;
  /** Metres of the path inside the site's area. */
  alongM: number;
  use: 'uses' | 'crosses';
  /** Share of the score that counts for the path. */
  weight: number;
  effectiveScore: number;
  effectiveRating: number;
  /** The path uses the street of a site that blocks the mode. */
  blocked: boolean;
  /** The site lies at the start, a stop or the destination, so no path avoids it. */
  atPlace: boolean;
};

/** Which sites a candidate was asked to go around: none, those that block the mode, also high ones, also medium ones. */
export type CandidateKind = 'direct' | 'blocked' | 'high' | 'medium';

export type Candidate = Leg & {
  kind: CandidateKind;
  sites: SiteOnPath[];
  /** Seconds the sites it still uses add to its travel time. */
  penaltyS: number;
  cost: number;
  /** Sites blocking the mode whose street it uses, other than at a start, stop or destination. */
  blockedBy: string[];
};

export type Plan = {
  /** The path as the router draws it, avoiding nothing. */
  direct: Candidate;
  /** Best first: the recommendation, then up to two others. */
  options: Candidate[];
  /** Whether the direct path uses anything worth looking for another path. */
  searched: boolean;
  /** More sites were in the way than the router takes areas to leave out. */
  limitReached: boolean;
};

export type Hit = { site: PlanSite; alongM: number; mid: LonLat };

/** Sites whose area the path comes within 5 m of, how far it runs inside each, and the middle of its longest stretch there. */
export function sitesAlongPath(line: LonLat[], sites: PlanSite[], step = 5): Hit[] {
  const pts = line.map(toXY);
  if (pts.length < 2) return [];
  const box = bboxOf(pts);
  const tracks = sites
    .filter((site) => bboxGap(site.shape.bbox, box) <= REACH_M)
    .map((site) => ({ site, along: 0, runStart: -1, last: -1, best: [0, -1] as [number, number] }));
  if (!tracks.length) return [];
  const close = (t: (typeof tracks)[number]) => {
    if (t.runStart >= 0 && t.last - t.runStart > t.best[1] - t.best[0]) t.best = [t.runStart, t.last];
    t.runStart = -1;
  };
  for (const { p, at, len } of samplesAlong(pts, step)) {
    for (const t of tracks) {
      const bb = t.site.shape.bbox;
      const near = p[0] >= bb[0] - REACH_M && p[0] <= bb[2] + REACH_M && p[1] >= bb[1] - REACH_M && p[1] <= bb[3] + REACH_M;
      if (near && pointShapeDist(p, t.site.shape) <= REACH_M) {
        t.along += len;
        if (t.runStart < 0) t.runStart = at;
        t.last = at;
      } else close(t);
    }
  }
  return tracks.flatMap((t) => {
    close(t);
    return t.along > 0 ? [{ site: t.site, alongM: t.along, mid: toLonLat(pointAt(pts, (t.best[0] + t.best[1]) / 2)) }] : [];
  });
}

/** A closed square around the point, to leave out the road there. */
export function cutSquare(at: LonLat, side = CUT_SIDE_M): LonLat[] {
  const [x, y] = toXY(at);
  const h = side / 2;
  return ([[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]] as XY[]).map(toLonLat);
}

const atPlace = (site: PlanSite, places: XY[]) => places.some((p) => pointShapeDist(p, site.shape) <= REACH_M);

function measure(kind: CandidateKind, leg: Leg, sites: PlanSite[], scores: ReadonlyMap<string, SiteScore>, places: XY[]): Candidate {
  let penaltyS = 0;
  const onPath = sitesAlongPath(leg.line, sites).flatMap(({ site, alongM }): SiteOnPath[] => {
    const score = scores.get(site.id);
    if (!score?.active) return [];
    const use = alongM > USES_STREET_M ? 'uses' : 'crosses';
    const blocks = score.impact === 'blocked';
    // crossing a closed side street at a junction costs nothing: the junction stays open
    const weight = use === 'uses' ? 1 : blocks ? 0 : CROSSING_WEIGHT;
    // the penalty uses the unrounded score; the score shown is rounded to 0.1, as the server does
    penaltyS += PENALTY_S * (score.score * weight) ** 2;
    const effectiveScore = Math.round(score.score * weight * 10) / 10;
    return [{
      siteId: site.id,
      alongM: Math.round(alongM),
      use,
      weight,
      effectiveScore,
      effectiveRating: Math.floor(effectiveScore + 0.5),
      blocked: blocks && use === 'uses',
      atPlace: atPlace(site, places),
    }];
  });
  return {
    ...leg,
    kind,
    sites: onPath,
    penaltyS,
    cost: leg.seconds + penaltyS,
    blockedBy: onPath.filter((s) => s.blocked && !s.atPlace).map((s) => s.siteId),
  };
}

/**
 * The direct path, then, if it uses a blocking site or one rated 4 or more, up to three more: around the blocking sites,
 * also around those rated 7 or more, also around those rated 4 or more. Each starts from where the one before it left
 * off: leave out a square where the path runs through each site, ask again, and repeat for sites the new path finds.
 */
export async function planRoute({ places, sites, scores, router, signal }: {
  places: LonLat[];
  sites: PlanSite[];
  scores: ReadonlyMap<string, SiteScore>;
  router: Router;
  signal?: AbortSignal;
}): Promise<Plan> {
  const ends = places.map(toXY);
  const direct = measure('direct', await router(places, [], signal), sites, scores, ends);
  const searched = direct.blockedBy.length > 0 || direct.sites.some((s) => !s.atPlace && s.effectiveRating >= MEDIUM);
  if (!searched) return { direct, options: [direct], searched, limitReached: false };

  const avoiding = (floor: number) => sites.filter((site) => {
    const score = scores.get(site.id);
    return !!score?.active && (score.impact === 'blocked' || score.rating >= floor);
  });
  const tiers: [CandidateKind, PlanSite[]][] = [['blocked', avoiding(Infinity)], ['high', avoiding(HIGH)], ['medium', avoiding(MEDIUM)]];
  const candidates = [direct];
  const cuts: LonLat[][] = [];
  const cut = new Set<string>();
  const stuck = new Set<string>();
  let leg: Leg = direct;
  let limitReached = false;
  for (const [kind, avoid] of tiers) {
    let moved = false;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const added: string[] = [];
      for (const hit of sitesAlongPath(leg.line, avoid)) {
        const { id } = hit.site;
        if (hit.alongM <= USES_STREET_M || cut.has(id) || stuck.has(id)) continue;
        if (atPlace(hit.site, ends)) {
          stuck.add(id); // the trip starts, stops or ends inside it
        } else if (cuts.length >= MAX_CUTS) {
          limitReached = true;
        } else {
          cuts.push(cutSquare(hit.mid));
          cut.add(id);
          added.push(id);
        }
      }
      if (!added.length) break;
      try {
        leg = await router(places, cuts, signal);
        moved = true;
      } catch (e) {
        if (!NO_WAY.has(errorCode(e) ?? -1)) throw e;
        // no way around this round's sites: keep the last path, and stop trying to leave them out
        cuts.splice(cuts.length - added.length);
        for (const id of added) {
          cut.delete(id);
          stuck.add(id);
        }
        break;
      }
    }
    if (moved) candidates.push(measure(kind, leg, sites, scores, ends));
  }
  return { direct, options: pick(direct, candidates), searched, limitReached };
}

function pick(direct: Candidate, candidates: Candidate[]): Candidate[] {
  const clean = candidates.filter((c) => !c.blockedBy.length);
  // every path goes through a blocking site: only the least obstructed one
  if (!clean.length) return [[...candidates].sort((a, b) => a.blockedBy.length - b.blockedBy.length || a.cost - b.cost)[0]];
  const slowest = direct.blockedBy.length ? Infinity : Math.min(direct.seconds * (1 + MAX_SLOWER), direct.seconds + MAX_SLOWER_S);
  const options: Candidate[] = [];
  for (const c of clean.filter((x) => x.seconds <= slowest).sort((a, b) => a.cost - b.cost)) {
    if (options.length < MAX_OPTIONS && !options.some((o) => sharedShare(c.line, o.line) > SAME_WAY)) options.push(c);
  }
  return options;
}
