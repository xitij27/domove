import { isActive } from '../model/analysis';
import type { Site } from '../model/sites';
import type { ProjectEvidence } from '../model/outlook';

/** Keep uncertain Outlook projects visible without changing the legacy disruption dates. */
export function siteState(s: Site, date: number, periodEvidence?: ProjectEvidence): 'active' | 'upcoming' | 'other' | null {
  if (periodEvidence) {
    if (periodEvidence.end === null) return 'other';
    return periodEvidence.start !== null && periodEvidence.start > date ? 'upcoming' : 'active';
  }
  if (isActive(s, date)) return 'active';
  if (s.start > date && s.start <= date + 30) return 'upcoming';
  return null;
}
