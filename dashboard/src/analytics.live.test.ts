// Opt-in read-only smoke test; normal unit checks never depend on external services.
import { describe, expect, it } from 'vitest';
import { fetchKindergartens, fetchRoads, fetchSchools, fetchSites, fetchStops } from './data/sources';
import { berlinToday, buildEvidence, outlook, potentialConflicts } from './model/outlook';
import { buildSites, prepareContext } from './model/sites';
import { impactAssessment } from './model/impact';
import { trafficContext } from './model/trafficContext';

describe.runIf(import.meta.env.LIVE)('analytics with live read-only sources', () => {
  it('normalizes actual construction records and assesses available source evidence', async () => {
    const [raw, roads, stops, schools, kindergartens] = await Promise.all([
      fetchSites(), fetchRoads(), fetchStops(), fetchSchools(), fetchKindergartens(),
    ]);
    const sites = buildSites(raw, prepareContext({ roads, stops, fire: [], hospitals: [] }));
    const evidence = buildEvidence(raw, sites);
    const conflicts = potentialConflicts(evidence);
    const reference = berlinToday();
    const byId = new Map(sites.map((s) => [s.id, s]));
    const assessments = evidence.map((p) => impactAssessment(byId.get(p.id)!, p, evidence, conflicts, [...stops, ...schools, ...kindergartens], 'public'));
    expect(raw.length).toBeGreaterThan(0);
    expect(evidence.some((p) => p.shape !== null)).toBe(true);
    for (const days of [7, 14, 30] as const) expect(outlook(evidence, reference, days, 250, conflicts).to - reference + 1).toBe(days);
    for (const score of assessments) {
      if (score.total !== null) expect(score.total).toBeGreaterThanOrEqual(0);
      if (score.total !== null) expect(score.total).toBeLessThanOrEqual(100);
      expect(score.factors).toHaveLength(4);
    }
    const selected = evidence.find((p) => p.shape !== null)!;
    expect(trafficContext(byId.get(selected.id)!, selected, stops, true, conflicts).sources.length).toBeGreaterThan(0);
    // Aggregate counts only; never log coordinates, device identifiers, keys or private business locations.
    console.log({ sourceRecords: raw.length, uniqueProjects: evidence.length,
      verifiedFootprints: evidence.filter((p) => p.shape).length, potentialPairs: conflicts.length,
      completeScores: assessments.filter((p) => p.total !== null).length });
  }, 120_000);
});
