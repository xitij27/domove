import { normalizeRoute, validateRoute, type RouteDraft } from './model';

const draft: RouteDraft = { start: ' Station ', destination: ' Park ', mode: 'bike', waypoints: [' Cafe ', '', '  ', 'Library'] };

test('trims locations and preserves the order of non-empty stops', () => {
  expect(normalizeRoute(draft)).toEqual({ start: 'Station', destination: 'Park', mode: 'bike', waypoints: ['Cafe', 'Library'] });
});

test.each(['pedestrian', 'bike', 'car'] as const)('accepts %s without optional stops', (mode) => {
  expect(validateRoute({ ...draft, mode, waypoints: [] })).toEqual({});
});

test('reports all missing required fields', () => {
  expect(validateRoute({ start: ' \t ', destination: '\n', mode: '', waypoints: [] })).toEqual({
    start: 'Enter a starting location.', destination: 'Enter a final destination.', mode: 'Select a transportation mode.',
  });
});

test('rejects unsupported modes and oversized input', () => {
  expect(() => normalizeRoute({ ...draft, mode: 'train' as RouteDraft['mode'] })).toThrow('Select');
  expect(Object.keys(validateRoute({ ...draft, start: 'a'.repeat(201), destination: 'b'.repeat(201), waypoints: ['c'.repeat(201)] }))).toEqual(['start', 'destination', 'waypoints']);
  expect(validateRoute({ ...draft, waypoints: Array(51).fill('Stop') }).waypoints).toBeDefined();
});
