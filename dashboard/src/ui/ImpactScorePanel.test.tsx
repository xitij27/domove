import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Poi } from '../data/sources';
import { impactAssessment } from '../model/impact';
import { potentialConflicts } from '../model/outlook';
import type { ProjectEvidence } from '../model/outlook';
import { testSite } from '../model/testSites';
import { ImpactScorePanel } from './ImpactScorePanel';

const a = testSite('a', 0, 0, 100, 109, { title: 'Source street - Vollsperrung' });
const b = testSite('b', 100, 0, 100, 109);
const evidence: ProjectEvidence[] = [a, b].map((s) => ({ id: s.id, start: s.start, end: s.end, openEnded: false, shape: s.shape, center: s.center, issues: [] }));
const locations: Poi[] = [{ name: 'Warehouse & school', at: a.center, detail: '', district: '' }];
const render = (target: 'public' | 'business', points = locations, scenario = false) => renderToStaticMarkup(
  <ImpactScorePanel assessment={impactAssessment(a, evidence[0], evidence, potentialConflicts(evidence), points, target)}
    target={target} locations={target === 'business' ? points : []} scenario={scenario} locationError={null}
    onTarget={() => {}} onAdd={() => {}} onRename={() => {}} onRemove={() => {}} />,
);

describe('impact assessment UI integration', () => {
  it('renders calculated contributions and explains the separate Disruption Points metric', () => {
    const html = render('public');
    expect(html).toContain('82.5 / 100');
    expect(html).toContain('Very High Review Priority');
    expect(html).toContain('0.5 × 15 = 7.5 points');
    expect(html).toContain('Disruption Points remain the separate');
    expect(html).toContain('not measured traffic impact');
  });
  it('withholds totals for missing business locations and allows local map selection', () => {
    const html = render('business', []);
    expect(html).toContain('Insufficient data to calculate Impact Score');
    expect(html).toContain('Missing: Location Exposure');
    expect(html).not.toContain('82.5 / 100');
    expect(html).toContain('Add location on map');
    expect(html).toContain('excluded from shared scenario links and exports');
  });
  it('supports named business points and explicitly labels scenario assessments', () => {
    const html = render('business', locations, true);
    expect(html).toContain('82.5 / 100');
    expect(html).toContain('Warehouse &amp; school');
    expect(html).toContain('Remove location 1');
    expect(html).toContain('Scenario assessment');
    expect(html).toContain('not only published plans');
  });
  it('preserves exact factor values and weighted contributions in the displayed calculation', () => {
    const partial = { ...a, title: 'Halbseitige Sperrung' };
    const result = impactAssessment(partial, evidence[0], evidence, potentialConflicts(evidence), locations, 'public');
    const html = renderToStaticMarkup(<ImpactScorePanel assessment={result} target="public" locations={[]}
      scenario={false} locationError={null} onTarget={() => {}} onAdd={() => {}} onRename={() => {}} onRemove={() => {}} />);
    expect(html).toContain('0.65 × 35 = 22.75 points');
    expect(html).toContain('70.25 / 100');
  });
});
