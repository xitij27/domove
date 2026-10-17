import { QUESTIONS } from './questions';
import { answerQuestion, isRight, nextQuestion, normalize, shuffle, solution, startQuiz, type Question } from './quiz';

const choice: Question = { id: 'c', kind: 'choice', prompt: 'Which?', options: ['a', 'b', 'c'], answer: 1, fact: 'B it is.' };
const blank: Question = { id: 'b', kind: 'blank', prompt: 'The ___.', answers: ['Phoenix-See', 'Phoenixsee'], fact: 'A lake.' };

/** A random() that runs through the given values, then repeats them. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('typed answers match whatever the case, spacing, hyphens and umlaut spelling', () => {
  expect(normalize(' Phoenix-See ')).toBe(normalize('phoenix see'));
  expect(normalize('Reißverschluss')).toBe('reissverschluss');
  expect(normalize('Hörde')).toBe(normalize('Hoerde'));
  // a ü typed as u plus a combining diaeresis
  expect(normalize('Lütgendortmund')).toBe(normalize('Lütgendortmund'));
  expect(normalize('Café')).toBe('cafe');
  expect(normalize('DSW 21')).toBe('dsw21');
});

test('a choice is right only for its answer, a blank for any of its answers', () => {
  expect(isRight(choice, 1)).toBe(true);
  expect(isRight(choice, 0)).toBe(false);
  expect(isRight(blank, 'phoenix see')).toBe(true);
  expect(isRight(blank, 'PHOENIXSEE')).toBe(true);
  expect(isRight(blank, 'Phoenix')).toBe(false);
  expect(isRight(blank, '  ')).toBe(false);
  expect(solution(choice)).toBe('b');
  expect(solution(blank)).toBe('Phoenix-See');
});

test('shuffling keeps every question once', () => {
  const shuffled = shuffle(QUESTIONS, sequence(0.9, 0.1, 0.5, 0.3));
  expect(shuffled).toHaveLength(QUESTIONS.length);
  expect(new Set(shuffled)).toEqual(new Set(QUESTIONS));
});

test('only the first answer to a question counts', () => {
  let state = startQuiz([choice, blank], sequence(0.99));
  const first = state.deck[0];
  state = answerQuestion(state, first.kind === 'choice' ? 0 : 'wrong');
  expect(state).toMatchObject({ right: 0, asked: 1 });
  expect(answerQuestion(state, first.kind === 'choice' ? first.answer : 'Phoenix-See')).toBe(state);
});

test('goes through the deck, then shuffles it again without repeating the question just asked', () => {
  const questions = [choice, blank, { ...choice, id: 'c2' }];
  let state = startQuiz(questions, sequence(0.5));
  const seen = [state.deck[0].id];
  for (let i = 1; i < questions.length; i++) {
    state = nextQuestion(answerQuestion(state, 0));
    expect(state.given).toBeNull();
    seen.push(state.deck[state.index].id);
  }
  expect(seen.sort()).toEqual(['b', 'c', 'c2']);

  const last = state.deck[state.index];
  // random() giving 0 then 0.5 shuffles the last question to the front, where it would come twice in a row
  state = nextQuestion(state, sequence(0, 0.5));
  expect(state.index).toBe(0);
  expect(state.deck[0]).not.toBe(last);
  expect(state.deck).toHaveLength(questions.length);
});

describe('the question bank', () => {
  test('has unique ids and a fact for every question', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    for (const q of QUESTIONS) expect(q.fact.trim()).not.toBe('');
  });

  test.each(QUESTIONS.filter((q) => q.kind === 'choice'))('$id has 2 to 4 different options, one of them right', (q) => {
    if (q.kind !== 'choice') return;
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(q.options.length).toBeLessThanOrEqual(4);
    expect(new Set(q.options).size).toBe(q.options.length);
    expect(q.options[q.answer]).toBeDefined();
    expect(q.prompt).not.toContain('___');
  });

  test.each(QUESTIONS.filter((q) => q.kind === 'blank'))('$id has one blank and answers that can be typed', (q) => {
    if (q.kind !== 'blank') return;
    expect(q.prompt.split('___')).toHaveLength(2);
    expect(q.answers.length).toBeGreaterThan(0);
    for (const answer of q.answers) {
      expect(normalize(answer)).not.toBe('');
      expect(isRight(q, answer)).toBe(true);
    }
  });

  test('mixes multiple choice with fill in the blanks', () => {
    const blanks = QUESTIONS.filter((q) => q.kind === 'blank').length;
    expect(blanks).toBeGreaterThan(0);
    expect(blanks).toBeLessThan(QUESTIONS.length);
  });
});
