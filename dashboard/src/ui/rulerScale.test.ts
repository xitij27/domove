import { describe, expect, it } from 'vitest';
import { nudge, position, scaleFor, snap, ticks, valueAt } from './rulerScale';

describe('ruler scale', () => {
  it('spans its settings, on a log scale for distances that span a lot', () => {
    const s = scaleFor('m', ['clash.radius', 'cluster.radius', 'together.radius']);
    expect(s).toEqual({ lo: 10, hi: 2000, log: true });
    expect(position(10, s)).toBe(0);
    expect(position(2000, s)).toBe(1);
    // 50 m isn't squeezed against 0 as it would be on a straight scale
    expect(position(50, s)).toBeGreaterThan(0.25);
    expect(valueAt(position(400, s), s)).toBeCloseTo(400);
    expect(ticks('m', s)).toEqual([10, 25, 50, 100, 250, 500, 1000, 2000]);
  });

  it('keeps severity and points on their whole range, and narrow ranges straight', () => {
    expect(scaleFor('severity', ['stop.minSeverity'])).toEqual({ lo: 0, hi: 1, log: false });
    expect(scaleFor('points', ['impact.band.high'])).toEqual({ lo: 0, hi: 100, log: false });
    expect(scaleFor('days', ['transit.days']).log).toBe(true);
    expect(scaleFor('plain', ['overload.factor'])).toEqual({ lo: 1, hi: 3, log: false });
    expect(ticks('plain', scaleFor('plain', ['overload.factor']))).toEqual([1, 3]);
  });

  it('turns a drag or a key press into a value the setting allows', () => {
    expect(snap('reach.stop', 437)).toBe(440);
    expect(snap('reach.stop', 5000)).toBe(1000);
    expect(snap('window.shiftCost', 0.034)).toBe(0.03);
    expect(nudge('reach.stop', 400, 1, false)).toBe(410);
    expect(nudge('reach.stop', 400, -1, true)).toBe(300);
    expect(nudge('priority.horizon', 365, 1, false)).toBe(365);
  });
});
