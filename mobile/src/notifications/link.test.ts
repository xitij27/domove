import { notificationRouteLink } from './link';

const url = 'https://www.google.com/maps/dir/?api=1&origin=51.51%2C7.46&destination=51.52%2C7.48&waypoints=51.515%2C7.47';

test('accepts the generated Google Maps directions URL', () => {
  expect(notificationRouteLink({ googleMapsUrl: url })).toBe(url);
  expect(notificationRouteLink({ googleMapsUrl: url.replace('www.google.com', 'maps.google.com') })).toBe(url.replace('www.google.com', 'maps.google.com'));
});

test.each([
  'https://www.google.com.evil.example/maps/dir/?api=1&origin=x&destination=y',
  'http://www.google.com/maps/dir/?api=1&origin=x&destination=y',
  'https://www.google.com/maps/search/?api=1&origin=x&destination=y',
  'https://www.google.com/maps/dir/?api=1',
])('rejects an unsafe or incomplete notification URL', (value) => {
  expect(notificationRouteLink({ googleMapsUrl: value })).toBeNull();
});
