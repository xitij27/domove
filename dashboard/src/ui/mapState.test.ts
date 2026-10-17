import { expect, it } from 'vitest';
import { testSite } from '../model/testSites';
import { buildEvidence, outlook } from '../model/outlook';
import { toDay } from '../model/days';
import { siteState } from './mapState';

it('keeps open-ended Outlook projects on the map without changing disruption dates', () => {
  const date = toDay('2026-10-17');
  const site = testSite('open', 0, 0, date - 10, date - 10);
  const [evidence] = buildEvidence([{ id: site.id, title: 'Work', owner: '', district: '', status: 'planned',
    startsOn: '2026-10-07', endsOn: null, geometry: site.geometry, center: site.center }], [site]);
  expect(outlook([evidence], date, 7).active).toHaveLength(1);
  expect(siteState(site, date)).toBeNull();
  expect(siteState(site, date, evidence)).toBe('other');
  expect(site.end).toBe(date - 10);
});

it('preserves the existing date states outside the optional Outlook filter', () => {
  expect(siteState(testSite('active', 0, 0, 100, 110), 105)).toBe('active');
  expect(siteState(testSite('upcoming', 0, 0, 110, 120), 105)).toBe('upcoming');
  expect(siteState(testSite('later', 0, 0, 200, 210), 105)).toBeNull();
});
