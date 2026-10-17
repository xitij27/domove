import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { outlook } from '../model/outlook';
import type { ProjectEvidence } from '../model/outlook';
import { testSite } from '../model/testSites';
import { OutlookPanel } from './OutlookPanel';

const projects: ProjectEvidence[] = [
  { id: 'ongoing', start: 99, end: 102, openEnded: false, shape: null, center: null, issues: [] },
  { id: 'next-week', start: 110, end: 115, openEnded: false, shape: null, center: null, issues: [] },
  { id: 'unknown', start: null, end: null, openEnded: true, shape: null, center: null, issues: [] },
];
const byId = new Map(projects.map((p) => [p.id, testSite(p.id, 0, 0, 99, 115, { title: `Project ${p.id}` })]));
const render = (days: 7 | 14 | 30) => renderToStaticMarkup(<OutlookPanel result={outlook(projects, 100, days)} days={days} byId={byId}
  mapFiltered retrievedAt="2026-10-17T08:00:00Z" scenario={false} onDays={() => {}} onMapFilter={() => {}} onSelect={() => {}} />);

describe('outlook integration', () => {
  it('changes listed projects with the selected window and keeps unknown work separate', () => {
    expect(render(7)).toContain('Projects overlapping period (1)');
    expect(render(7)).not.toContain('Project next-week');
    expect(render(14)).toContain('Projects overlapping period (2)');
    expect(render(14)).toContain('Project next-week');
    expect(render(30)).toContain('Projects overlapping period (2)');
    expect(render(7)).toContain('Uncertain schedules (1)');
  });
  it('shows sources, inclusive semantics, current selection and cautious conflict wording', () => {
    const html = render(14);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Next 14 days/);
    expect(html).toContain('Europe/Berlin');
    expect(html).toContain('inclusive');
    expect(html).toContain('Potential Construction Conflicts');
    expect(html).toContain('Retrieved');
    expect(html).toContain('Source update time is not supplied');
  });
});
