import { normalizeRoute, validateRoute, type PlaceDraft, type RouteDraft } from './model';

const at = { latitude: 51.51, longitude: 7.46 };
const place = (label: string, coordinate: PlaceDraft['coordinate'] = at): PlaceDraft => ({ label, coordinate });
const draft: RouteDraft = {
  start: place(' Station '), destination: place(' Park '), mode: 'bike',
  waypoints: [place(' Cafe '), place('', null), place('  ', null), place('Library')], startTime: ' 07:45 ', weekdays: [],
};

test('trims locations and preserves the order of non-empty stops', () => {
  expect(normalizeRoute(draft)).toEqual({
    start: { label: 'Station', coordinate: at }, destination: { label: 'Park', coordinate: at }, mode: 'bike',
    waypoints: [{ label: 'Cafe', coordinate: at }, { label: 'Library', coordinate: at }], startTime: '07:45', weekdays: [],
  });
  expect(normalizeRoute({ ...draft, startTime: '  ' }).startTime).toBeNull();
});

test('the leaving time is optional but must be a time of day', () => {
  for (const time of ['', '8:30', '08:30', '23:59', '00:00']) expect(validateRoute({ ...draft, startTime: time }).startTime).toBeUndefined();
  for (const time of ['24:00', '8.30', '0830', '12:60', 'noon']) {
    expect(validateRoute({ ...draft, startTime: time }).startTime).toBe('Enter a time like 08:30, or leave it empty.');
  }
});

test('repeating days need a leaving time and stay distinct', () => {
  expect(validateRoute({ ...draft, startTime: '', weekdays: ['monday'] }).weekdays).toBe('Select a leaving time for the selected days.');
  expect(validateRoute({ ...draft, startTime: '08:30', weekdays: ['monday', 'wednesday'] }).weekdays).toBeUndefined();
  expect(validateRoute({ ...draft, startTime: '', weekdays: [] }).weekdays).toBeUndefined();
  expect(validateRoute({ ...draft, startTime: '08:30', weekdays: ['monday', 'monday'] }).weekdays).toBe('Select each weekday only once.');
  expect(normalizeRoute({ ...draft, startTime: '08:30', weekdays: ['friday'] }).weekdays).toEqual(['friday']);
});
test.each(['pedestrian', 'bike', 'car'] as const)('accepts %s without optional stops', (mode) => {
  expect(validateRoute({ ...draft, mode, waypoints: [] })).toEqual({});
});

test('reports all missing required fields', () => {
  expect(validateRoute({ start: place(' \t ', null), destination: place('\n', null), mode: '', waypoints: [], startTime: '', weekdays: [] })).toEqual({
    start: 'Enter a starting location.', destination: 'Enter a final destination.', mode: 'Select a transportation mode.',
  });
});

test('typed text that was not picked from the suggestions is rejected', () => {
  expect(validateRoute({ ...draft, start: place('Station', null), destination: place('Park', null), waypoints: [place('Cafe', null)] })).toEqual({
    start: 'Pick a place from the suggestions.', destination: 'Pick a place from the suggestions.', waypoints: 'Pick each stop from the suggestions.',
  });
  expect(() => normalizeRoute({ ...draft, start: place('Station', null) })).toThrow('Pick a place');
});

test('rejects unsupported modes and oversized input', () => {
  expect(() => normalizeRoute({ ...draft, mode: 'train' as RouteDraft['mode'] })).toThrow('Select');
  expect(Object.keys(validateRoute({ ...draft, start: place('a'.repeat(201)), destination: place('b'.repeat(201)), waypoints: [place('c'.repeat(201))] }))).toEqual(['start', 'destination', 'waypoints']);
  expect(validateRoute({ ...draft, waypoints: Array(48).fill(place('Stop')) }).waypoints).toBeUndefined();
  expect(validateRoute({ ...draft, waypoints: Array(49).fill(place('Stop')) }).waypoints).toBe('Use no more than 48 intermediate stops.');
});
