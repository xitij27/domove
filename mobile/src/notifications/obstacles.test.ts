import { toObstacles } from './obstacles';

test('rows become obstacles and half-filled rows are skipped', () => {
  expect(toObstacles([
    { route_id: 'r1', construction_site_id: 's1', routes: { finish_label: 'Work' }, construction_sites: { title: 'Bridge', starts_on: '2026-10-30', ends_on: null } },
    { route_id: 'r2', construction_site_id: 's2', routes: null, construction_sites: null },
    null,
  ])).toEqual([{ routeId: 'r1', siteId: 's1', siteTitle: 'Bridge', destination: 'Work', startsOn: '2026-10-30', endsOn: null }]);
});
