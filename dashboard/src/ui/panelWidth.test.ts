import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampWidth, DEFAULT_WIDTH, MIN_WIDTH, savedWidth } from './panelWidth';

afterEach(() => vi.unstubAllGlobals());

describe('panel width', () => {
  it('stays between its limits and always leaves the map room', () => {
    expect(clampWidth(100, 1600)).toBe(MIN_WIDTH);
    expect(clampWidth(700, 1600)).toBe(700);
    expect(clampWidth(1400, 1600)).toBe(960);
    expect(clampWidth(700, 1000)).toBe(640);
    // a narrow window: the panel keeps its minimum
    expect(clampWidth(500, 600)).toBe(MIN_WIDTH);
  });

  it('starts at the default without a saved width, or with storage blocked', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    expect(savedWidth()).toBe(DEFAULT_WIDTH);
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked'); } } });
    expect(savedWidth()).toBe(DEFAULT_WIDTH);
    vi.stubGlobal('window', { localStorage: { getItem: () => 'wide' } });
    expect(savedWidth()).toBe(DEFAULT_WIDTH);
    vi.stubGlobal('window', { localStorage: { getItem: () => '560' } });
    expect(savedWidth()).toBe(560);
  });
});
