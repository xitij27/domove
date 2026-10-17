import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { testSite } from '../model/testSites';
import { trafficContext } from '../model/trafficContext';
import type { ProjectEvidence } from '../model/outlook';
import { TrafficContextPanel } from './TrafficContextPanel';

it('updates selected-project context and makes missing sources and unsupported alternatives explicit', () => {
  const a = testSite('a', 0, 0, 100, 110, { roadName: 'Verified street' });
  const b = testSite('b', 100, 0, 100, 110);
  const byId = new Map([[a.id, a], [b.id, b]]);
  const evidence = (s = a): ProjectEvidence => ({ id: s.id, start: s.start, end: s.end, shape: s.shape, center: s.center, issues: [], openEnded: false });
  const first = renderToStaticMarkup(<TrafficContextPanel context={trafficContext(a, evidence(), [], true, [])}
    evidence={evidence()} byId={byId} onSelect={() => {}} />);
  const second = renderToStaticMarkup(<TrafficContextPanel context={trafficContext(b, evidence(b), null, false, [])}
    evidence={evidence(b)} byId={byId} onSelect={() => {}} />);
  expect(first).toContain('Verified street');
  expect(first).toContain('fb62-strassenabschnitte');
  expect(second).not.toContain('Verified street');
  expect(second).toContain('Unknown / unavailable');
  expect(second).toContain('Public transport stop data unavailable');
  expect(second).toContain('Alternative route analysis unavailable');
});
