import { toSites, type SiteRow } from './sites';

const row: SiteRow = { id: 'a', status: 'planned', title: 'Stortsweg - Glasfaser', owner: null, period: '15.11.2026 - 23.12.2026', district: 'Hombruch', latitude: 51.48, longitude: 7.4 };

test('maps backend rows and drops ones with a bad status or coordinates', () => {
  const sites = toSites([
    row,
    { ...row, id: 'b', status: 'unknown' },
    { ...row, id: 'c', latitude: null as unknown as number },
  ]);

  expect(sites).toEqual([{
    id: 'a',
    status: 'planned',
    coordinate: { latitude: 51.48, longitude: 7.4 },
    title: 'Stortsweg - Glasfaser',
    owner: '',
    period: '15.11.2026 - 23.12.2026',
    district: 'Hombruch',
  }]);
});
