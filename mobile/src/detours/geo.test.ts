import { samplesAlong, sharedShare, toXY } from './geo';
import { at } from './testPlan';

test('samples stand for the whole line', () => {
  const samples = samplesAlong([at(0, 0), at(100, 0), at(100, 33)].map(toXY), 5);
  expect(samples.reduce((sum, s) => sum + s.len, 0)).toBeCloseTo(133);
  expect(samples[0].at).toBeCloseTo(2.5);
});

test('a line shares all of itself with itself, and nothing with a street 50 m over', () => {
  const line = [at(0, 0), at(500, 0)];
  expect(sharedShare(line, line)).toBe(1);
  expect(sharedShare(line, [at(0, 50), at(500, 50)])).toBe(0);
});

test('shares only the part of a line that runs along the other', () => {
  // the second line turns off halfway
  const share = sharedShare([at(0, 0), at(1000, 0)], [at(0, 0), at(500, 0), at(500, 400)]);
  expect(share).toBeGreaterThan(0.5);
  expect(share).toBeLessThan(0.53);
});
