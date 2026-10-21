import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../model/settings';
import { SeverityGrid } from './SeverityGrid';

const sites = [{ kinds: ['full' as const], road: 'main' as const }, { kinds: ['half' as const], road: 'local' as const }];
const render = (settings = DEFAULT_SETTINGS) =>
  renderToStaticMarkup(<SeverityGrid settings={settings} sites={sites} day="21 Oct 2026" onChange={() => {}} />);

it('lays out every restriction against every road, with the day\'s counts in words', () => {
  const html = render();
  expect(html.match(/<tr>/g)).toHaveLength(11);
  expect(html).toContain('Full closure');
  expect(html).toContain('Local street');
  expect(html).toContain('On 21 Oct 2026: 1 high, 0 medium and 1 low.');
  expect(html).not.toContain('With the defaults');
});

it('compares with the defaults once a weight changes', () => {
  const html = render({ ...DEFAULT_SETTINGS, 'weight.half': 1 });
  expect(html).toContain('On 21 Oct 2026: 1 high, 1 medium and 0 low.');
  expect(html).toContain('With the defaults: 1, 0 and 1.');
  expect(html).toContain('sg-pick changed');
});
