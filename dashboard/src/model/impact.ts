// A prototype review-priority indicator, independent of the planner's Disruption Points.
import type { Poi } from '../data/sources';
import { classifyClosures, KIND_LABEL } from './closures';
import { bboxGap, pointShapeDist, toXY } from './geo';
import { parseReportedDay, validLonLat } from './outlook';
import type { ProjectEvidence, PotentialConflict } from './outlook';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './settings';
import type { Site } from './sites';

export const FACTOR_KEYS = ['S', 'E', 'C', 'D'] as const;
export type FactorKey = typeof FACTOR_KEYS[number];
export type ImpactTarget = 'public' | 'business';
export type ImpactFactor = {
  key: FactorKey; label: string; weight: number; value: number | null;
  contribution: number | null; reason: string; source: string;
};
export type ImpactAssessment = {
  total: number | null; priority: string | null; factors: ImpactFactor[]; missing: string[];
};

const normalizedFactor = (v: number | null): v is number => v !== null && Number.isFinite(v) && v >= 0 && v <= 1;

/** Each factor's share of the 100 points: the planner's shares scaled to add up to 100; null when all are 0. */
export function impactWeights(cfg: Settings = DEFAULT_SETTINGS): Record<FactorKey, number> | null {
  const sum = FACTOR_KEYS.reduce((n, k) => n + cfg[`impact.${k}`], 0);
  return sum > 0 ? Object.fromEntries(FACTOR_KEYS.map((k) => [k, (cfg[`impact.${k}`] * 100) / sum])) as Record<FactorKey, number> : null;
}

/** Missing/invalid factors never become zero and weights are never redistributed. */
export function calculateImpact(values: Record<FactorKey, number | null>, cfg: Settings = DEFAULT_SETTINGS): number | null {
  const weights = impactWeights(cfg);
  if (!weights || !FACTOR_KEYS.every((k) => normalizedFactor(values[k]))) return null;
  return FACTOR_KEYS.reduce((sum, k) => sum + weights[k] * values[k]!, 0);
}

export function reviewPriority(total: number | null, cfg: Settings = DEFAULT_SETTINGS): string | null {
  if (total === null || !Number.isFinite(total) || total < 0 || total > 100) return null;
  const level = total <= cfg['impact.band.medium'] ? 'Low' : total <= cfg['impact.band.high'] ? 'Medium' : total <= cfg['impact.band.veryHigh'] ? 'High' : 'Very High';
  return `${level} Review Priority`;
}

/** Reuse the existing German title classifier and the planner's restriction weights, with path-specific full-closure wording kept scoped. */
export function restrictionSeverity(title: string, cfg: Settings = DEFAULT_SETTINGS): { value: number | null; reason: string } {
  const text = title.toLocaleLowerCase('de').replaceAll('ß', 'ss');
  if (/^(?:.* - )?(?:keine (?:relevanten? )?(?:verkehrs)?einschränkungen|keine verkehrsbehinderungen)[.!]?$/.test(text.trim())) {
    return { value: 0, reason: 'The source explicitly reports no relevant traffic restriction.' };
  }
  // Keep both word orders scoped: "Vollsperrung Radweg", "Gehweg voll gesperrt", "Radweg-Vollsperrung".
  // Remove only the path phrase, so a separately reported motor-road closure remains classifiable.
  const path = '(?:radweg|fussweg|gehweg)\\w*';
  const closure = '(?:vollsperrung|voll\\s*gesperrt|sperrung|gesperrt)';
  const pathClosure = new RegExp(`${closure}\\s+(?:(?:des|der)\\s+)?${path}|${path}(?:\\s*[-–:]\\s*|\\s+)(?:(?:ist|wird)\\s+)?${closure}|(?:radweg|fussweg|gehweg)sperrung`, 'g');
  const withoutNegatedClosure = text.replace(/keine?\s+(?:vollsperrung|sperrung|einengung)/g, ' ');
  const scopedPath = pathClosure.test(withoutNegatedClosure);
  const kinds = classifyClosures(withoutNegatedClosure.replace(pathClosure, ' ')).filter((k) => k !== 'unknown');
  const value = kinds.length || scopedPath ? Math.max(scopedPath ? cfg['weight.sidewalk'] : 0, ...kinds.map((k) => cfg[`weight.${k}`])) : null;
  const labels = [...kinds.map((k) => KIND_LABEL[k]), ...(scopedPath ? ['Path closure (walking/cycling only)'] : [])];
  return {
    value,
    reason: value === null ? 'No supported restriction is reported; an unknown restriction is not zero.'
      : `${labels.join('; ')}. Classified from published wording, not a verified traffic impact.${scopedPath || kinds.includes('sidewalk') ? ' The named path restriction is not evidence of a full motor-vehicle closure.' : ''}`,
  };
}

/** Thresholds in metres are inclusive. Distances use the published construction geometry. */
export function exposureValue(metres: number, cfg: Settings = DEFAULT_SETTINGS): number | null {
  if (!Number.isFinite(metres) || metres < 0) return null;
  return metres <= cfg['impact.near'] ? 1 : metres <= cfg['impact.mid'] ? 0.75 : metres <= cfg['impact.far'] ? 0.4 : 0;
}

const validPeriod = (p: ProjectEvidence): p is ProjectEvidence & { start: number; end: number } =>
  p.start !== null && p.end !== null && Number.isInteger(p.start) && Number.isInteger(p.end) && p.start <= p.end &&
  p.end < parseReportedDay('2100-01-01')! && !p.openEnded;

export function durationValue(p: ProjectEvidence, cfg: Settings = DEFAULT_SETTINGS): number | null {
  if (!validPeriod(p)) return null;
  const days = p.end - p.start + 1;
  return days <= cfg['impact.short'] ? 0.25 : days <= cfg['impact.medium'] ? 0.5 : days <= cfg['impact.long'] ? 0.75 : 1;
}

function exposure(p: ProjectEvidence, locations: Poi[] | null, target: ImpactTarget, cfg: Settings): Pick<ImpactFactor, 'value' | 'reason'> {
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
  if (!nearest || (invalid && nearest.metres > cfg['impact.near'])) return { value: null, reason: `Some ${name} locations have invalid coordinates; maximum exposure cannot be established.` };
  return { value: exposureValue(nearest.metres, cfg), reason: `Maximum ${name} exposure: ${nearest.poi.name || 'unnamed location'}, approximately ${Math.round(nearest.metres)} m from the published construction geometry. Proximity is not proof of disruption.` };
}

function conflictFactor(p: ProjectEvidence, all: ProjectEvidence[], conflicts: PotentialConflict[], cfg: Settings): Pick<ImpactFactor, 'value' | 'reason'> {
  const radius = cfg['impact.radius'];
  if (!validPeriod(p) || !p.shape) return { value: null, reason: 'Verified dates and construction geometry are required for conflict assessment.' };
  const matching = conflicts.filter((c) => c.a === p.id || c.b === p.id);
  if (matching.some((c) => c.intersects)) return { value: 1, reason: 'Construction Outlook identifies intersecting published geometries and overlapping reported dates. This is a potential construction conflict.' };
  const unresolved = all.some((other) => {
    if (other.id === p.id) return false;
    if (other.start !== null && other.start > p.end || other.end !== null && other.end < p.start) return false;
    if (other.shape && bboxGap(p.shape!.bbox, other.shape.bbox) > radius) return false;
    // A point-only project far from this footprint cannot be a conflict, so it must not void every score in the city.
    if (!other.shape && other.center && pointShapeDist(toXY(other.center), p.shape!) > radius) return false;
    return !validPeriod(other) || !other.shape;
  });
  if (unresolved) return { value: null, reason: 'Other potentially concurrent projects have missing dates or geometry; a maximum conflict factor cannot be established.' };
  return matching.some((c) => c.metres <= radius)
    ? { value: 0.5, reason: `Construction Outlook identifies a project within ${radius} m with overlapping dates. The radius is a planning heuristic, not evidence of traffic disruption.` }
    : { value: 0, reason: `Construction Outlook finds no intersecting or within-${radius} m concurrent project in the available dataset.` };
}

export function impactAssessment(
  site: Site, evidence: ProjectEvidence, allEvidence: ProjectEvidence[], conflicts: PotentialConflict[],
  locations: Poi[] | null, target: ImpactTarget, cfg: Settings = DEFAULT_SETTINGS,
): ImpactAssessment {
  const severity = restrictionSeverity(site.title, cfg);
  const nearby = exposure(evidence, locations, target, cfg);
  const conflict = conflictFactor(evidence, allEvidence, conflicts, cfg);
  const duration = durationValue(evidence, cfg);
  const weights = impactWeights(cfg) ?? { S: 0, E: 0, C: 0, D: 0 };
  const factor = (key: FactorKey, label: string, value: number | null, reason: string, source: string): ImpactFactor => ({
    key, label, weight: weights[key], value, contribution: value === null ? null : value * weights[key], reason, source,
  });
  const factors = [
    factor('S', 'Restriction Severity', severity.value, severity.reason, 'Published construction title; the restriction weights in Settings'),
    factor('E', 'Location Exposure', nearby.value, nearby.reason, target === 'public' ? 'Dortmund Open Data: schools, kindergartens and public transport stops' : 'User-selected business locations; browser only'),
    factor('C', 'Construction Conflict', conflict.value, conflict.reason, `Construction Outlook: published dates and geometries; ${cfg['impact.radius']} m heuristic`),
    factor('D', 'Construction Duration', duration, duration === null ? 'A valid, finite reported start and end date are required; placeholder/open-ended dates are excluded.' : `${evidence.end! - evidence.start! + 1} days, including both reported start and end dates.`, 'Published construction dates; scenario shifts where explicitly applied'),
  ];
  const values = Object.fromEntries(factors.map((f) => [f.key, f.value])) as Record<FactorKey, number | null>;
  const total = calculateImpact(values, cfg);
  return { total, priority: reviewPriority(total, cfg), factors, missing: factors.filter((f) => f.value === null).map((f) => f.label) };
}
