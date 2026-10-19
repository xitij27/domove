import { afterEach, describe, expect, it } from 'vitest';
import { formatDay, toDay } from '../model/days';
import { reviewPriority } from '../model/impact';
import { EMPTY_SCENARIO, scenarioCsv } from '../model/scenario';
import { clashText, num } from '../ui/format';
import { getLanguage, setLanguage } from '.';
import de from './de';
import en from './en';

/** Every key, and whether it holds words, a function or more keys. */
const shape = (words: object): unknown =>
  Object.fromEntries(Object.entries(words).map(([key, value]) => [key, value && typeof value === 'object' && !Array.isArray(value) ? shape(value) : typeof value]));

afterEach(() => setLanguage('en', false));

describe('languages', () => {
  it('has every English word in German too', () => {
    expect(shape(de)).toEqual(shape(en));
    expect(de.csv.header).toHaveLength(en.csv.header.length);
  });

  it('starts in English outside a browser', () => {
    expect(getLanguage()).toBe('en');
    expect(num(0.18)).toBe('0.18');
  });

  it('words dates, numbers, the model and the export in German once switched', () => {
    setLanguage('de', false);
    expect(formatDay(toDay('2026-11-04'))).toMatch(/^4\. Nov/);
    expect(num(0.18)).toBe('0,18');
    expect(num(-1.5)).toBe('−1,5');
    expect(clashText({ clashes: 3, clashDays: 40 })).toBe('3 Baustellen an 40 Tagen');
    expect(reviewPriority(90)).toBe('Sehr hohe Prüfpriorität');
    expect(scenarioCsv(EMPTY_SCENARIO, []).split('\r\n')[0]).toContain('Veröffentlichter Beginn');
  });
});
