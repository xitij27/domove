import type { Group } from '../routing/valhalla';

export type Tab = 'todo' | 'coordinate' | 'outlook' | 'priorities' | 'transit' | 'capacity' | 'routes';
export type Mode = 'plan' | 'traffic' | 'emergency' | 'transit';
export type StatKey = 'active' | 'points' | 'clashes' | 'closures' | 'stops';

/** What each role sees: its views (the first opens when the role is picked), its key figures, and who it plans routes for. */
export const MODES: Record<Mode, { tabs: Tab[]; stats: StatKey[]; groups: Group[] }> = {
  plan: { tabs: ['todo', 'coordinate', 'outlook', 'priorities'], stats: ['active', 'points', 'clashes'], groups: [] },
  traffic: { tabs: ['priorities', 'capacity', 'routes', 'outlook'], stats: ['points', 'closures', 'active'], groups: ['commuter', 'logistics'] },
  emergency: { tabs: ['routes', 'outlook'], stats: ['closures', 'active'], groups: ['emergency'] },
  transit: { tabs: ['transit', 'routes'], stats: ['stops', 'active'], groups: ['cyclist', 'pedestrian'] },
};
export const MODE_ORDER = Object.keys(MODES) as Mode[];

const STORAGE_KEY = 'domove-dashboard-mode';

/** The role picked last in this browser, else planning. */
export function savedMode(): Mode {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && saved in MODES) return saved as Mode;
  } catch {
    // storage blocked: start in planning
  }
  return 'plan';
}

export function saveMode(mode: Mode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // kept for this visit only
  }
}
