// Colours by the job they do (dataviz skill). Severity is an ordinal ramp, validated with
// validate_palette.js --ordinal in both modes; the district and programme maps use the blue sequential ramp.
import { useSyncExternalStore } from 'react';
import type { Band } from '../model/settings';

export type Theme = 'light' | 'dark';
export type Palette = {
  surface: string;
  ink: string;
  muted: string;
  axis: string;
  severity: Record<Band, string>;
  sequential: string[];
  accent: string;
  critical: string;
  /** Outlines the chosen district: a hue no fill or site uses, so it never reads as a value. */
  selection: string;
};

export const PALETTES: Record<Theme, Palette> = {
  light: {
    surface: '#fcfcfb', ink: '#0b0b0b', muted: '#898781', axis: '#c3c2b7',
    severity: { low: '#ef9a66', medium: '#eb6834', high: '#a8360f' },
    sequential: ['#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'],
    accent: '#2a78d6', critical: '#d03b3b', selection: '#f5c400',
  },
  dark: {
    surface: '#1a1a19', ink: '#f0efec', muted: '#898781', axis: '#383835',
    severity: { low: '#9a3c14', medium: '#d95926', high: '#f39a6b' },
    sequential: ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef'],
    accent: '#3987e5', critical: '#d03b3b', selection: '#ffd84d',
  },
};

const STORAGE_KEY = 'domove-dashboard-theme';
const CHANGE_EVENT = 'domove-dashboard-theme-change';
let inMemoryPreference: Theme | null = null;

export const readThemePreference = (value: string | null): Theme | null =>
  value === 'light' || value === 'dark' ? value : null;

/** Light unless dark was chosen; the system's dark setting doesn't switch it. */
export const resolveTheme = (value: string | null): Theme => readThemePreference(value) ?? 'light';

const currentTheme = (): Theme => {
  try {
    return resolveTheme(window.localStorage.getItem(STORAGE_KEY) ?? inMemoryPreference);
  } catch {
    return resolveTheme(inMemoryPreference);
  }
};

export const applyTheme = () => {
  document.documentElement.dataset.theme = currentTheme();
};

export const setThemePreference = (theme: Theme) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
    inMemoryPreference = null;
  } catch {
    inMemoryPreference = theme;
  }
  applyTheme();
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = (onChange: () => void) => {
  const update = () => { applyTheme(); onChange(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) update();
  };
  window.addEventListener(CHANGE_EVENT, update);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, update);
    window.removeEventListener('storage', onStorage);
  };
};

/** Light until a light or dark preference is saved. */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, currentTheme);
