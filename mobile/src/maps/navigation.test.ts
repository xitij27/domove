import { followHeading, turnBetween } from './navigation';

test('follows the direction of travel once moving, whatever the phone faces', () => {
  expect(followHeading(90, 5, 200, 10, 'car')).toBe(90);
  expect(followHeading(90, 1.4, 200, 10, 'pedestrian')).toBe(90);
});

test('ignores a course reported while standing or unknown', () => {
  expect(followHeading(90, 0.3, 200, null, 'pedestrian')).toBe(200);
  expect(followHeading(-1, -1, 200, null, 'pedestrian')).toBe(200);
  expect(followHeading(null, null, 200, null, 'pedestrian')).toBe(200);
});

test('on foot, standing still turns the map the way the phone faces', () => {
  expect(followHeading(null, 0, 200, 90, 'pedestrian')).toBe(200);
});

test('on a bike or in a car, standing still keeps the last direction of travel', () => {
  expect(followHeading(null, 0, 200, 90, 'car')).toBe(90);
  expect(followHeading(null, 0, 200, 90, 'bike')).toBe(90);
});

test('before the first move, the phone facing sets the direction', () => {
  expect(followHeading(null, 0, 200, null, 'car')).toBe(200);
  expect(followHeading(null, 0, null, null, 'car')).toBeNull();
  expect(followHeading(null, 0, null, 90, 'pedestrian')).toBe(90);
});

test('measures turns the short way round', () => {
  expect(turnBetween(10, 350)).toBe(20);
  expect(turnBetween(350, 10)).toBe(20);
  expect(turnBetween(90, 270)).toBe(180);
  expect(turnBetween(45, 45)).toBe(0);
});
