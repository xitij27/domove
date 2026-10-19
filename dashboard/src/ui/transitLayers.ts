import type { TransitKind } from '../data/sources';

/** What the Transit role can show on the map: the lines by kind, and the stops, bike-share stations and P+R sites. */
export type TransitLayer = TransitKind | 'stop' | 'bike' | 'pr';
export type TransitLayers = Record<TransitLayer, boolean>;
export const TRANSIT_LAYERS: TransitLayer[] = ['stadtbahn', 'train', 'bus', 'stop', 'bike', 'pr'];
// bike-share stations are many and only matter up close, so they start hidden
const DEFAULTS: TransitLayers = { stadtbahn: true, train: true, bus: true, stop: true, bike: false, pr: true };
const STORAGE_KEY = 'domove-dashboard-transit-layers';

/** The layers picked last in this browser; anything missing or unreadable falls back to the defaults. */
export function savedTransitLayers(): TransitLayers {
  let saved: unknown = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    // storage blocked or garbled: the defaults
  }
  const pick = (layer: TransitLayer) => {
    const v = saved && typeof saved === 'object' ? (saved as Record<string, unknown>)[layer] : undefined;
    return typeof v === 'boolean' ? v : DEFAULTS[layer];
  };
  return Object.fromEntries(TRANSIT_LAYERS.map((l) => [l, pick(l)])) as TransitLayers;
}

export function saveTransitLayers(layers: TransitLayers) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layers));
  } catch {
    // kept for this visit only
  }
}

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Black or white text, whichever contrasts more with a line's colour (WCAG relative luminance). */
export const textOn = (hex: string): string => {
  const l = luminance(hex);
  return (1.05) / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#0b0b0b';
};
