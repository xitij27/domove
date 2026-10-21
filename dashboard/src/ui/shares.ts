// The impact score's shares as a bar of 100: where each part ends, and the shares once a divider moves.
export const SHARE_STEP = 5;
const STEP = SHARE_STEP;
const snap5 = (x: number) => Math.round(x / STEP) * STEP;

/** Where each part ends, from 0 to 100, scaled so the shares add up to 100 as the score scales them. */
export function boundsOf(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let run = 0;
  return [0, ...values.map((v) => (run += (v / total) * 100))];
}

/** The shares with one divider moved to `at`, kept between its neighbours and on steps of 5. */
export function moveDivider(values: number[], divider: number, at: number): number[] {
  const b = boundsOf(values).map(snap5);
  b[divider + 1] = Math.min(b[divider + 2], Math.max(b[divider], snap5(at)));
  return values.map((_, i) => b[i + 1] - b[i]);
}

