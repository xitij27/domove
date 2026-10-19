import { useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import de from './de';
import en, { type Strings } from './en';

export type { Strings };
export type Language = 'en' | 'de';
export const LANGUAGES: readonly Language[] = ['en', 'de'];
/** Each language's name in itself, as the switch reads it out. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', de: 'Deutsch' };

const STRINGS: Record<Language, Strings> = { en, de };
// en-GB for "Mon 2 Nov", the order the app has always shown dates in.
const LOCALES: Record<Language, string> = { en: 'en-GB', de: 'de-DE' };

const languageFile = () => new File(Paths.document, 'language.txt');
const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'de';

/** German on a phone set to German, English on any other. */
export function deviceLanguage(): Language {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

/** The language picked in the app, or the phone's until one is. */
function loadLanguage(): Language {
  try {
    const file = languageFile();
    const saved = file.exists ? file.textSync().trim() : null;
    if (isLanguage(saved)) return saved;
  } catch {
    // only costs remembering the choice
  }
  return deviceLanguage();
}

let current: Language = loadLanguage();
const listeners = new Set<() => void>();

export const getLanguage = (): Language => current;

/** Switches every screen, and, with `remember`, keeps the choice for the next launch. */
export function setLanguage(next: Language, remember = true) {
  if (next === current) return;
  current = next;
  if (remember) {
    try {
      languageFile().writeSync(next);
    } catch {
      // only costs remembering the choice
    }
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The words in the app's language, for code outside components, such as notifications and error messages. */
export const strings = (): Strings => STRINGS[current];
/** For dates written out in the app's language. */
export const locale = (): string => LOCALES[current];

/** The app's language; a component using it renders again when it changes. */
export const useLanguage = (): Language => useSyncExternalStore(subscribeLanguage, getLanguage);
export const useStrings = (): Strings => STRINGS[useLanguage()];

/** `value` with `digits` decimals and the language's decimal mark: "6.2" or "6,2". */
export function decimal(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return current === 'de' ? text.replace('.', ',') : text;
}

/** A number as JavaScript writes it, with the language's decimal mark: "1.3" or "1,3". */
export const number = (value: number): string => (current === 'de' ? String(value).replace('.', ',') : String(value));

/** "Thu 23 Oct" or "Do., 23. Okt.". */
export const shortDate = (date: Date): string => date.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
