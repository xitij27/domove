import { afterEach, describe, expect, it, vi } from 'vitest';
import { savedTransitLayers, textOn } from './transitLayers';

afterEach(() => vi.unstubAllGlobals());

describe('transit layers', () => {
  it('writes line labels in whichever of black and white reads better on DSW21 colours', () => {
    expect(textOn('#fcdc00')).toBe('#0b0b0b'); // U41 yellow
    expect(textOn('#7fd2e6')).toBe('#0b0b0b'); // U44 light blue
    expect(textOn('#dc2a1b')).toBe('#ffffff'); // U45 red
    expect(textOn('#8874c7')).toBe('#0b0b0b'); // U46 violet: black reads about 5:1, white 3.9:1
  });

  it('keeps saved choices and falls back to the defaults for anything missing or unreadable', () => {
    const store = (value: string | null) => vi.stubGlobal('window', { localStorage: { getItem: () => value } });
    store('{"bus":false,"bike":true,"stop":"yes"}');
    expect(savedTransitLayers()).toEqual({ stadtbahn: true, train: false, bus: false, stop: true, bike: true, pr: false });
    store('not json');
    expect(savedTransitLayers()).toMatchObject({ train: false, bike: false, pr: false });
  });
});
