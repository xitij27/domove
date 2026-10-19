import { QUESTIONS, questionIn } from '../quiz/questions';
import { QUESTIONS_DE } from '../quiz/questions.de';
import { isRight } from '../quiz/quiz';
import { formatDistance } from '../detours/text';
import { repeatSummary } from '../routes/model';
import { decimal, getLanguage, setLanguage, strings } from '.';
import de from './de';
import en from './en';

/** Every key, and whether it holds words, a function or more keys. */
const shape = (words: object): unknown =>
  Object.fromEntries(Object.entries(words).map(([key, value]) => [key, value && typeof value === 'object' && !Array.isArray(value) ? shape(value) : typeof value]));

afterEach(() => setLanguage('en', false));

test('German has every word English has', () => {
  expect(shape(de)).toEqual(shape(en));
});

test('every quiz question is asked in German, with its options in the same order', () => {
  expect(Object.keys(QUESTIONS_DE).sort()).toEqual(QUESTIONS.map((q) => q.id).sort());
  for (const question of QUESTIONS) {
    const asked = questionIn(question, 'de');
    expect(asked.prompt).not.toBe(question.prompt);
    if (question.kind === 'choice' && asked.kind === 'choice') expect(asked.options).toHaveLength(question.options.length);
  }
});

test('a blank asked in German takes the German answer and the English one', () => {
  const wall = QUESTIONS.find((q) => q.id === 'yellow-wall')!;
  expect(isRight(questionIn(wall, 'de'), 'Wand')).toBe(true);
  expect(isRight(questionIn(wall, 'de'), 'Wall')).toBe(true);
  expect(questionIn(wall, 'en')).toBe(wall);
});

test('switching the language rewords the app, its days and its decimal mark', () => {
  setLanguage('de', false);
  expect(getLanguage()).toBe('de');
  expect(strings().routes.sitesOnWay(2)).toBe('2 Baustellen auf dem Weg');
  expect(repeatSummary(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])).toBe('Werktags');
  expect(repeatSummary(['friday', 'monday'])).toBe('Mo, Fr');
  expect(decimal(6.2, 1)).toBe('6,2');
  expect(formatDistance(6200)).toBe('6,2 km');
  setLanguage('en', false);
  expect(formatDistance(6200)).toBe('6.2 km');
});
