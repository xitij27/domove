/** A question with options to pick from, or a sentence with a blank to type into. */
export type Question =
  | { id: string; kind: 'choice'; prompt: string; options: string[]; answer: number; fact: string }
  // answers[0] is the one shown after a wrong guess; the others are also accepted
  | { id: string; kind: 'blank'; prompt: string; answers: string[]; fact: string };

/** The option picked, or the words typed into the blank. */
export type Given = number | string;

export type QuizState = {
  deck: Question[]; // every question once, in a random order
  index: number; // the question on show
  given: Given | null; // its answer, until the next question
  right: number;
  asked: number;
};

/** Lower case, umlauts and ß spelled out, and only letters and digits: "Phoenix-See" matches "phoenix see", "Reißverschluss" "reissverschluss". */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function isRight(question: Question, given: Given): boolean {
  if (question.kind === 'choice') return given === question.answer;
  const typed = normalize(String(given));
  return typed !== '' && question.answers.some((answer) => normalize(answer) === typed);
}

/** What a wrong guess is told the answer was. */
export function solution(question: Question): string {
  return question.kind === 'choice' ? question.options[question.answer] : question.answers[0];
}

/** A copy in a random order (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function startQuiz(questions: readonly Question[], random = Math.random): QuizState {
  return { deck: shuffle(questions, random), index: 0, given: null, right: 0, asked: 0 };
}

/** Scores the first answer to the question on show; later ones change nothing. */
export function answerQuestion(state: QuizState, given: Given): QuizState {
  if (state.given !== null) return state;
  const right = isRight(state.deck[state.index], given);
  return { ...state, given, right: state.right + (right ? 1 : 0), asked: state.asked + 1 };
}

/** The next question; after the last, the deck is shuffled again without starting on the one just asked. */
export function nextQuestion(state: QuizState, random = Math.random): QuizState {
  if (state.index + 1 < state.deck.length) return { ...state, index: state.index + 1, given: null };
  const deck = shuffle(state.deck, random);
  const last = deck.length - 1;
  if (last > 0 && deck[0] === state.deck[state.index]) [deck[0], deck[last]] = [deck[last], deck[0]];
  return { ...state, deck, index: 0, given: null };
}
