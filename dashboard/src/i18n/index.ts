import { useSyncExternalStore } from 'react';
import de from './de';
import en from './en';
import type { Strings } from './en';

export type { Strings };
export type Language = 'en' | 'de';
export const LANGUAGES: readonly Language[] = ['en', 'de'];
/** Each language's name in itself, as the switch reads it out. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', de: 'Deutsch' };

const STRINGS: Record<Language, Strings> = { en, de };
const LOCALES: Record<Language, string> = { en: 'en-GB', de: 'de-DE' };
const STORAGE_KEY = 'domove-dashboard-language';
const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'de';

/** The language picked last, else German for a browser set to German, else English. Outside a browser (the tests), English. */
function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // storage blocked: fall back to the browser's language
  }
  return window.navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let current: Language = initialLanguage();
const listeners = new Set<() => void>();

export const getLanguage = (): Language => current;

/** For screen readers and the browser's own spelling and hyphenation. */
export const applyLanguage = () => {
  document.documentElement.lang = current;
};

export function setLanguage(next: Language, remember = true) {
  if (next === current) return;
  current = next;
  if (remember) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // kept for this visit only
    }
  }
  if (typeof document !== 'undefined') applyLanguage();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** The words in the dashboard's language, for code outside components: the model's reasons, the CSV export. */
export const strings = (): Strings => STRINGS[current];
/** For dates and numbers written out in the dashboard's language. */
export const locale = (): string => LOCALES[current];

/** The dashboard's language; a component using it renders again when it changes. */
export const useLanguage = (): Language => useSyncExternalStore(subscribe, getLanguage, () => 'en');
export const useStrings = (): Strings => STRINGS[useLanguage()];

/** `value` with up to `digits` decimals and the language's decimal mark: "0.18" or "0,18". */
export const decimal = (value: number, digits: number): string => {
  const text = value.toFixed(digits);
  return current === 'de' ? text.replace('.', ',') : text;
};
/** A whole number with the language's thousands separator: "12,345" or "12.345". */
export const whole = (value: number): string => Math.round(value).toLocaleString(locale());
