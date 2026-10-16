import { File, Paths } from 'expo-file-system';
import type { Status } from './sites';

// Named after Mapbox Standard's light presets, which the Mapbox map passes through as is.
export type MapTheme = 'day' | 'night';

export type Palette = {
  surface: string; // chips, cards and map controls floating over the map
  border: string;
  text: string;
  muted: string;
  thumb: string; // highlight behind the selected day/night button
  accent: string; // the selected sun or moon
  status: Record<Status, string>; // status label on a card; the pin colours are too faint on white or black
};

export const PALETTES: Record<MapTheme, Palette> = {
  day: {
    surface: '#ffffff',
    border: 'rgba(16, 24, 40, 0.08)',
    text: '#1a1d23',
    muted: '#5b6472',
    thumb: '#fff1cc',
    accent: '#c26a00',
    status: { current: '#c62828', planned: '#a15c00' },
  },
  night: {
    surface: '#232a36',
    border: 'rgba(255, 255, 255, 0.10)',
    text: '#eef1f6',
    muted: '#9aa4b5',
    thumb: '#3a4662',
    accent: '#c3ccff',
    status: { current: '#ff7b72', planned: '#ffca4d' },
  },
};

const themeFile = () => new File(Paths.document, 'map-theme.txt');

// The dark map is what the app has always shown, so it stays the default until someone picks day.
export function loadTheme(): MapTheme {
  try {
    const file = themeFile();
    return file.exists && file.textSync() === 'day' ? 'day' : 'night';
  } catch {
    return 'night';
  }
}

export function saveTheme(theme: MapTheme) {
  try {
    themeFile().writeSync(theme);
  } catch {
    // only costs remembering the choice
  }
}
