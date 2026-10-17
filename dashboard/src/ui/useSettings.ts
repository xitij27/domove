import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS } from '../model/settings';
import type { Settings } from '../model/settings';

export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);

/** The settings every figure on screen was worked out with: the defaults plus the scenario's changes. */
export const useSettings = (): Settings => useContext(SettingsContext);
