import { formatLeaving, normalizeRoute, repeatSummary, validateRoute, type PlaceDraft, type RouteDraft } from './model';

const at = { latitude: 51.51, longitude: 7.46 };
const place = (label: string, coordinate: PlaceDraft['coordinate'] = at): PlaceDraft => ({ label, coordinate });
const draft: RouteDraft = {
  start: place(' Station '), destination: place(' Park '), mode: 'bike',
  waypoints: [place(' Cafe '), place('', null), place('  ', null), place('Library')], startTime: ' 07:45 ', weekdays: ['friday', 'monday'],
};

test('trims locations and preserves the order of non-empty stops', () => {
  expect(normalizeRoute(draft)).toEqual({
    start: { label: 'Station', coordinate: at }, destination: { label: 'Park', coordinate: at }, mode: 'bike',
    waypoints: [{ label: 'Cafe', coordinate: at }, { label: 'Library', coordinate: at }], startTime: '07:45', weekdays: ['monday', 'friday'],
  });
  expect(normalizeRoute({ ...draft, startTime: '  ', weekdays: [] })).toMatchObject({ startTime: null, weekdays: [] });
});

test('the leaving time is optional but must be a time of day', () => {
  for (const time of ['', '8:30', '08:30', '23:59', '00:00']) expect(validateRoute({ ...draft, weekdays: [], startTime: time }).startTime).toBeUndefined();
  for (const time of ['24:00', '8.30', '0830', '12:60', 'noon']) {
    expect(validateRoute({ ...draft, weekdays: [], startTime: time }).startTime).toBe('Use a leaving time like 08:30.');
  }
});

test('repeat days are optional but need a time', () => {
  expect(validateRoute({ ...draft, weekdays: [] }).startTime).toBeUndefined();
  expect(validateRoute({ ...draft, startTime: '' }).startTime).toBe('Pick a time for the repeat days.');
});

test('repeat days read like an alarm', () => {
  expect(repeatSummary([])).toBeNull();
  expect(repeatSummary(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])).toBe('Every day');
  expect(repeatSummary(['friday', 'thursday', 'wednesday', 'tuesday', 'monday'])).toBe('Weekdays');
  expect(repeatSummary(['sunday', 'saturday'])).toBe('Weekends');
  expect(repeatSummary(['friday', 'monday', 'wednesday'])).toBe('Mon, Wed, Fri');
  expect(formatLeaving({ startTime: '07:15', weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] })).toBe('Leaving at 07:15 · Weekdays');
  expect(formatLeaving({ startTime: '07:15', weekdays: [] })).toBe('Leaving at 07:15');
  expect(formatLeaving({ startTime: null, weekdays: [] })).toBeNull();
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
    start: 'Pick a place from the suggestions or the map.', destination: 'Pick a place from the suggestions or the map.', waypoints: 'Pick each stop from the suggestions or the map.',
  });
  expect(() => normalizeRoute({ ...draft, start: place('Station', null) })).toThrow('Pick a place');
});

test('rejects unsupported modes and oversized input', () => {
  expect(() => normalizeRoute({ ...draft, mode: 'train' as RouteDraft['mode'] })).toThrow('Select');
  expect(Object.keys(validateRoute({ ...draft, start: place('a'.repeat(201)), destination: place('b'.repeat(201)), waypoints: [place('c'.repeat(201))] }))).toEqual(['start', 'destination', 'waypoints']);
  expect(validateRoute({ ...draft, waypoints: Array(48).fill(place('Stop')) }).waypoints).toBeUndefined();
  expect(validateRoute({ ...draft, waypoints: Array(49).fill(place('Stop')) }).waypoints).toBe('Use no more than 48 intermediate stops.');
});
