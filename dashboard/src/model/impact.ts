// A prototype review-priority indicator, independent of the planner's Disruption Points.
import type { Poi } from '../data/sources';
import { classifyClosures, KIND_LABEL } from './closures';
import { bboxGap, pointShapeDist, toXY } from './geo';
import { parseReportedDay, validLonLat } from './outlook';
import type { ProjectEvidence, PotentialConflict } from './outlook';
import type { Site } from './sites';

export const IMPACT_WEIGHTS = { S: 35, E: 30, C: 20, D: 15 } as const;
export type FactorKey = keyof typeof IMPACT_WEIGHTS;
export type ImpactTarget = 'public' | 'business';
export type ImpactFactor = {
  key: FactorKey; label: string; weight: number; value: number | null;
  contribution: number | null; reason: string; source: string;
};
export type ImpactAssessment = {
  total: number | null; priority: string | null; factors: ImpactFactor[]; missing: string[];
};

const normalizedFactor = (v: number | null): v is number => v !== null && Number.isFinite(v) && v >= 0 && v <= 1;

/** Missing/invalid factors never become zero and weights are never redistributed. */
export function calculateImpact(values: Record<FactorKey, number | null>): number | null {
  if (!(Object.keys(IMPACT_WEIGHTS) as FactorKey[]).every((k) => normalizedFactor(values[k]))) return null;
  return (Object.keys(IMPACT_WEIGHTS) as FactorKey[]).reduce((sum, k) => sum + IMPACT_WEIGHTS[k] * values[k]!, 0);
}

export function reviewPriority(total: number | null): string | null {
  if (total === null || !Number.isFinite(total) || total < 0 || total > 100) return null;
  return `${total <= 30 ? 'Low' : total <= 60 ? 'Medium' : total <= 80 ? 'High' : 'Very High'} Review Priority`;
}

/** Reuse the existing German title classifier, with path-specific full-closure wording kept scoped. */
export function restrictionSeverity(title: string): { value: number | null; reason: string } {
  const text = title.toLocaleLowerCase('de').replaceAll('ß', 'ss');
  if (/^(?:.* - )?(?:keine (?:relevanten? )?(?:verkehrs)?einschränkungen|keine verkehrsbehinderungen)[.!]?$/.test(text.trim())) {
    return { value: 0, reason: 'The source explicitly reports no relevant traffic restriction.' };
  }
  // "Vollsperrung Radweg" does not establish a full road closure. Preserve any separately reported road closure.
  const pathClosure = /(?:vollsperrung|voll\s*gesperrt)\s+(?:(?:des|der)\s+)?(?:radweg|fussweg|gehweg)\w*/g;
  const withoutNegatedClosure = text.replace(/keine?\s+(?:vollsperrung|sperrung|einengung)/g, ' ');
  const scopedPath = pathClosure.test(withoutNegatedClosure);
  const kinds = classifyClosures(withoutNegatedClosure.replace(pathClosure, ' ')).filter((k) => k !== 'unknown');
  const values = { full: 1, carriageway: 0.65, half: 0.65, one_way: 0.65, narrowing: 0.45,
    sidewalk: 0.25, signal: 0.25, moving: 0.25, parking: 0.25 };
  const value = kinds.length || scopedPath ? Math.max(scopedPath ? 0.25 : 0, ...kinds.map((k) => values[k])) : null;
  const labels = [...kinds.map((k) => KIND_LABEL[k]), ...(scopedPath ? ['Path closure (walking/cycling only)'] : [])];
  return {
    value,
    reason: value === null ? 'No supported restriction is reported; an unknown restriction is not zero.'
      : `${labels.join('; ')}. Classified from published wording, not a verified traffic impact.${kinds.includes('sidewalk') ? ' The named path restriction is not evidence of a full motor-vehicle closure.' : ''}`,
  };
}

/** Thresholds in metres are inclusive. Distances use the published construction geometry. */
export function exposureValue(metres: number): number | null {
  if (!Number.isFinite(metres) || metres < 0) return null;
  return metres <= 100 ? 1 : metres <= 250 ? 0.75 : metres <= 500 ? 0.4 : 0;
}

const validPeriod = (p: ProjectEvidence): p is ProjectEvidence & { start: number; end: number } =>
  p.start !== null && p.end !== null && Number.isInteger(p.start) && Number.isInteger(p.end) && p.start <= p.end &&
  p.end < parseReportedDay('2100-01-01')! && !p.openEnded;

export function durationValue(p: ProjectEvidence): number | null {
  if (!validPeriod(p)) return null;
  const days = p.end - p.start + 1;
  return days <= 2 ? 0.25 : days <= 14 ? 0.5 : days <= 30 ? 0.75 : 1;
}

function exposure(p: ProjectEvidence, locations: Poi[] | null, target: ImpactTarget): Pick<ImpactFactor, 'value' | 'reason'> {
  const name = target === 'public' ? 'public-service' : 'selected business';
  if (!p.shape) return { value: null, reason: 'Published construction geometry is missing; marker-centre distances are not substituted.' };
  if (!locations?.length) return { value: null, reason: `No verified ${name} locations are available.` };
  let nearest: { poi: Poi; metres: number } | null = null;
  let invalid = false;
  for (const poi of locations) {
    if (!validLonLat(poi.at)) { invalid = true; continue; }
    const metres = pointShapeDist(toXY(poi.at), p.shape);
    if (Number.isFinite(metres) && (!nearest || metres < nearest.metres)) nearest = { poi, metres };
    else if (!Number.isFinite(metres)) invalid = true;
  }
  // Invalid locations could hide a closer point. Only the maximum already-established factor is conclusive.
  if (!nearest || (invalid && nearest.metres > 100)) return { value: null, reason: `Some ${name} locations have invalid coordinates; maximum exposure cannot be established.` };
  return { value: exposureValue(nearest.metres), reason: `Maximum ${name} exposure: ${nearest.poi.name || 'unnamed location'}, approximately ${Math.round(nearest.metres)} m from the published construction geometry. Proximity is not proof of disruption.` };
}

function conflictFactor(p: ProjectEvidence, all: ProjectEvidence[], conflicts: PotentialConflict[]): Pick<ImpactFactor, 'value' | 'reason'> {
  if (!validPeriod(p) || !p.shape) return { value: null, reason: 'Verified dates and construction geometry are required for conflict assessment.' };
  const matching = conflicts.filter((c) => c.a === p.id || c.b === p.id);
  if (matching.some((c) => c.intersects)) return { value: 1, reason: 'Construction Outlook identifies intersecting published geometries and overlapping reported dates. This is a potential construction conflict.' };
  const unresolved = all.some((other) => {
    if (other.id === p.id) return false;
    if (other.start !== null && other.start > p.end || other.end !== null && other.end < p.start) return false;
    if (other.shape && bboxGap(p.shape!.bbox, other.shape.bbox) > 250) return false;
    return !validPeriod(other) || !other.shape;
  });
  if (unresolved) return { value: null, reason: 'Other potentially concurrent projects have missing dates or geometry; a maximum conflict factor cannot be established.' };
  return matching.some((c) => c.metres <= 250)
    ? { value: 0.5, reason: 'Construction Outlook identifies a project within 250 m with overlapping dates. The radius is a planning heuristic, not evidence of traffic disruption.' }
    : { value: 0, reason: 'Construction Outlook finds no intersecting or within-250 m concurrent project in the available dataset.' };
}

export function impactAssessment(
  site: Site, evidence: ProjectEvidence, allEvidence: ProjectEvidence[], conflicts: PotentialConflict[],
  locations: Poi[] | null, target: ImpactTarget,
): ImpactAssessment {
  const severity = restrictionSeverity(site.title);
  const nearby = exposure(evidence, locations, target);
  const conflict = conflictFactor(evidence, allEvidence, conflicts);
  const duration = durationValue(evidence);
  const factor = (key: FactorKey, label: string, value: number | null, reason: string, source: string): ImpactFactor => ({
    key, label, weight: IMPACT_WEIGHTS[key], value, contribution: value === null ? null : value * IMPACT_WEIGHTS[key], reason, source,
  });
  const factors = [
    factor('S', 'Restriction Severity', severity.value, severity.reason, 'Published construction title; existing dashboard closure classifier'),
    factor('E', 'Location Exposure', nearby.value, nearby.reason, target === 'public' ? 'Dortmund Open Data: schools, kindergartens and public transport stops' : 'User-selected business locations; browser only'),
    factor('C', 'Construction Conflict', conflict.value, conflict.reason, 'Construction Outlook: published dates and geometries; 250 m heuristic'),
    factor('D', 'Construction Duration', duration, duration === null ? 'A valid, finite reported start and end date are required; placeholder/open-ended dates are excluded.' : `${evidence.end! - evidence.start! + 1} days, including both reported start and end dates.`, 'Published construction dates; scenario shifts where explicitly applied'),
  ];
  const values = Object.fromEntries(factors.map((f) => [f.key, f.value])) as Record<FactorKey, number | null>;
  const total = calculateImpact(values);
  return { total, priority: reviewPriority(total), factors, missing: factors.filter((f) => f.value === null).map((f) => f.label) };
}
