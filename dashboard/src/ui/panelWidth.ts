// How wide the side panel is: dragged by its edge or set with the arrow keys, remembered by the browser.
const STORAGE_KEY = 'domove-dashboard-panel-width';
export const DEFAULT_WIDTH = 420;
export const MIN_WIDTH = 320;
/** The map always keeps this much, so its controls and legend stay usable. */
const MIN_MAP = 360;
const MAX_WIDTH = 960;
export const KEY_STEP = 24;

/** The widest the panel can be in a workspace this wide. */
export const maxWidth = (workspace: number): number => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, workspace - MIN_MAP));

export const clampWidth = (width: number, workspace: number): number =>
  Math.round(Math.min(Math.max(width, MIN_WIDTH), maxWidth(workspace)));

export function savedWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) && saved >= MIN_WIDTH ? saved : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

export function saveWidth(width: number) {
  try {
    if (width === DEFAULT_WIDTH) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // kept for this visit only
  }
}
