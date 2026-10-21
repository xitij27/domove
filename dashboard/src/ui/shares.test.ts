import { expect, it } from 'vitest';
import { boundsOf, moveDivider } from './shares';

it('moves points from one share to the next, keeping 100 in all', () => {
  expect(boundsOf([35, 30, 20, 15])).toEqual([0, 35, 65, 85, 100]);
  expect(moveDivider([35, 30, 20, 15], 0, 41)).toEqual([40, 25, 20, 15]);
  // a divider stops at its neighbours, so no share goes below 0
  expect(moveDivider([35, 30, 20, 15], 1, 10)).toEqual([35, 0, 50, 15]);
  // shares that didn't add up to 100 are scaled first, as the score scales them
  expect(moveDivider([50, 50, 50, 50], 2, 80).reduce((a, b) => a + b, 0)).toBe(100);
});
