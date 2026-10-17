import { booleanDisjoint, booleanValid, booleanWithin, kinks, polygon } from '@turf/turf';
import type { MultiPolygon, Polygon } from 'geojson';
import type { RawSite } from '../data/sources';
import { DAY_MS, isoDay, overlapDays } from './days';
import { shapeOf } from './geo';
import type { LonLat, Shape } from './geo';
import { findNeighbours } from './sites';
import type { Site } from './sites';

export type ProjectEvidence = {
  id: string; start: number | null; end: number | null; openEnded: boolean;
  shape: Shape | null; center: LonLat | null; issues: string[];
};
export type PotentialConflict = {
  a: string; b: string; from: number; to: number; metres: number; intersects: boolean;
};
export type OutlookDays = 7 | 14 | 30;
export type OutlookResult = {
  from: number; to: number; active: ProjectEvidence[]; starting: ProjectEvidence[];
  ongoing: ProjectEvidence[]; ending: ProjectEvidence[]; uncertain: ProjectEvidence[];
  conflicts: PotentialConflict[];
};

/** Reject calendar rollover (e.g. 31 February), rather than trusting Date.parse alone. */
export function parseReportedDay(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && isoDay(ms / DAY_MS) === value ? ms / DAY_MS : null;
}

export function berlinToday(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return parseReportedDay(`${part('year')}-${part('month')}-${part('day')}`)!;
}

/** Generous Dortmund bounds; also reject accidentally reversed latitude/longitude. */
export function validLonLat(value: unknown): value is LonLat {
  return Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every(Number.isFinite) &&
    value[0] >= 7.2 && value[0] <= 7.8 && value[1] >= 51.3 && value[1] <= 51.7;
}

function verifiedShape(geometry: Polygon | MultiPolygon | null): Shape | null {
  if (!geometry) return null;
  try {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!polys.length || !polys.every((rings) => rings.length && rings.every((ring) =>
      ring.length >= 4 && ring.every(validLonLat) &&
      ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] &&
      new Set(ring.map((p) => `${p[0]},${p[1]}`)).size >= 3))) return null;
    if (!booleanValid(geometry) || kinks(geometry).features.length) return null;
    for (const rings of polys) {
      const outer = polygon([rings[0]]);
      for (let i = 1; i < rings.length; i++) {
        const hole = polygon([rings[i]]);
        if (!booleanWithin(hole, outer)) return null;
        for (let j = 1; j < i; j++) if (!booleanDisjoint(hole, polygon([rings[j]]))) return null;
      }
    }
    const shape = shapeOf(geometry);
    return shape.bbox.every(Number.isFinite) ? shape : null;
  } catch {
    return null;
  }
}

/** Keep source evidence separate from the Planner's synthetic point circles/date defaults. */
export function buildEvidence(raw: RawSite[], sites: Site[]): ProjectEvidence[] {
  const byId = new Map(sites.map((site) => [site.id, site]));
  const normalized = raw.map((record) => {
    const issues: string[] = [];
    let start = parseReportedDay(record.startsOn);
    let end = parseReportedDay(record.endsOn);
    const sentinel = (value: number | null) => value !== null && value >= parseReportedDay('2100-01-01')!;
    const openEnded = !record.endsOn || sentinel(end);
    if (sentinel(start)) start = null;
    if (openEnded) end = null;
    if (start === null) issues.push('Missing or invalid reported start date.');
    if (end === null) issues.push(openEnded ? 'Reported end date is unknown or open-ended.' : 'Invalid reported end date.');
    if (start !== null && end !== null && start > end) {
      start = end = null;
      issues.push('Reported start date is after the end date.');
    }
    const site = byId.get(record.id);
    if (site) {
      if (start !== null && Number.isInteger(site.start - site.baseStart)) start += site.start - site.baseStart;
      if (end !== null && Number.isInteger(site.end - site.baseEnd)) end += site.end - site.baseEnd;
      if (start !== null && end !== null && start > end) {
        start = end = null;
        issues.push('Scenario date interval is invalid.');
      }
    }
    const center = validLonLat(record.center) ? record.center : null;
    const shape = verifiedShape(record.geometry);
    if (!shape) issues.push(record.geometry ? 'Reported construction geometry is invalid.' : 'Verified construction footprint unavailable (point only).');
    if (!center) issues.push('Invalid Dortmund longitude/latitude coordinates.');
    const evidence: ProjectEvidence = { id: record.id, start, end, openEnded, shape, center, issues };
    const text = (s: string) => s.trim().toLocaleLowerCase('de').replace(/\s+/g, ' ');
    const identity = [text(record.title), text(record.owner), record.startsOn, record.endsOn];
    const place = shape ? record.geometry : center;
    const key = place ? JSON.stringify([...identity, place]) : record.id;
    const coordinateKey = center ? JSON.stringify([...identity, center]) : null;
    return { evidence, key, coordinateKey };
  });
  // Prefer the most complete representation of repeated IDs. Distinct places remain distinct.
  normalized.sort((a, b) => a.evidence.issues.length - b.evidence.issues.length);
  const footprintCenters = new Set(normalized.filter((p) => p.evidence.shape !== null && p.coordinateKey !== null)
    .map((p) => p.coordinateKey));
  const seenIds = new Set<string>();
  const seenProjects = new Set<string>();
  return normalized.flatMap(({ evidence, key, coordinateKey }) => {
    // A matching point-only feed record adds no evidence to an already reported footprint.
    // Two different real polygons may share a marker and must remain separate projects.
    if (!evidence.shape && coordinateKey && footprintCenters.has(coordinateKey)) return [];
    if (seenIds.has(evidence.id) || seenProjects.has(key)) return [];
    seenIds.add(evidence.id);
    seenProjects.add(key);
    return [evidence];
  });
}

export function potentialConflicts(projects: ProjectEvidence[], radius = 250): PotentialConflict[] {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Conflict radius must be non-negative.');
  const verified = projects.filter((p): p is ProjectEvidence & { start: number; end: number; shape: Shape } =>
    p.start !== null && p.end !== null && p.start <= p.end && p.shape !== null);
  const byId = new Map(verified.map((p) => [p.id, p]));
  const pairs: PotentialConflict[] = [];
  for (const [id, neighbours] of findNeighbours(verified, radius)) {
    const a = byId.get(id)!;
    for (const neighbour of neighbours) {
      if (id >= neighbour.id) continue;
      const b = byId.get(neighbour.id)!;
      if (!overlapDays(a.start, a.end, b.start, b.end)) continue;
      pairs.push({ a: id, b: b.id, from: Math.max(a.start, b.start), to: Math.min(a.end, b.end),
        metres: neighbour.m, intersects: neighbour.m === 0 });
    }
  }
  return pairs;
}

/** Inclusive reference day through reference + days - 1; open ends are explicitly uncertain. */
export function outlook(projects: ProjectEvidence[], referenceDay: number, days: OutlookDays, radius = 250,
  conflicts = potentialConflicts(projects, radius)): OutlookResult {
  if (!Number.isInteger(referenceDay) || ![7, 14, 30].includes(days)) throw new RangeError('Invalid outlook window.');
  const from = referenceDay;
  const to = from + days - 1;
  const active = projects.filter((p) => p.start !== null && p.start <= to &&
    (p.end !== null ? p.end >= from : p.openEnded));
  return {
    from, to, active,
    starting: active.filter((p) => p.start! >= from),
    ongoing: active.filter((p) => p.start! < from),
    ending: active.filter((p) => p.end !== null && p.end >= from && p.end <= to),
    uncertain: projects.filter((p) => (p.start === null || p.end === null) &&
      (p.start === null || p.start <= to) && (p.end === null || p.end >= from)),
    conflicts: conflicts.filter((c) => c.from <= to && c.to >= from)
      .map((c) => ({ ...c, from: Math.max(c.from, from), to: Math.min(c.to, to) })),
  };
}
