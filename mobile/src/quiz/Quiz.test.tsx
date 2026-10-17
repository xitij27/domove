import { fireEvent, render, screen } from '@testing-library/react-native';
import { QuizButton, QuizQuestion, useQuiz } from './Quiz';
import type { Question } from './quiz';

jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');

const canal: Question = {
  id: 'canal',
  kind: 'choice',
  prompt: 'Which canal links Dortmund to the North Sea?',
  options: ['the Dortmund–Ems Canal', 'the Kiel Canal'],
  answer: 0,
  fact: 'It opened in 1899.',
};
const merge: Question = {
  id: 'merge',
  kind: 'blank',
  prompt: 'Taking turns where a lane ends is the ___.',
  answers: ['Reißverschlussverfahren', 'zip merge'],
  fact: 'The law asks for it.',
};

function Card({ questions, onClose = () => {} }: { questions: Question[]; onClose?: () => void }) {
  const quiz = useQuiz(questions);
  return <QuizQuestion quiz={quiz} theme="day" onClose={onClose} />;
}

test('a wrong pick shows the right option and the fact, and counts towards the score', async () => {
  await render(<Card questions={[canal]} />);
  expect(screen.getByText(canal.prompt)).toBeOnTheScreen();
  expect(screen.queryByText(/right$/)).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'the Kiel Canal' }));
  expect(screen.getByText('The answer is “the Dortmund–Ems Canal”.')).toBeOnTheScreen();
  expect(screen.getByText('It opened in 1899.')).toBeOnTheScreen();
  expect(screen.getByText('0 of 1 right')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'the Dortmund–Ems Canal' })).toBeDisabled();

  // the only question comes round again, unanswered
  await fireEvent.press(screen.getByRole('button', { name: 'Next question' }));
  expect(screen.queryByText('It opened in 1899.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'the Dortmund–Ems Canal' }));
  expect(screen.getByText('Right!')).toBeOnTheScreen();
  expect(screen.getByText('1 of 2 right')).toBeOnTheScreen();
});

test('a typed answer is checked without minding case or ß, and the box is empty for the next blank', async () => {
  await render(<Card questions={[merge]} />);
  expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();

  await fireEvent.changeText(screen.getByLabelText('Your answer'), 'reissverschlussverfahren');
  await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
  expect(screen.getByText('Right!')).toBeOnTheScreen();
  expect(screen.getByText('1 of 1 right')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Next question' }));
  expect(screen.getByLabelText('Your answer')).toHaveProp('value', '');
  await fireEvent.changeText(screen.getByLabelText('Your answer'), 'merge');
  await fireEvent(screen.getByLabelText('Your answer'), 'submitEditing');
  expect(screen.getByText('The answer is “Reißverschlussverfahren”.')).toBeOnTheScreen();
  expect(screen.getByText('1 of 2 right')).toBeOnTheScreen();
});

test('the card closes from its close button, and the round button says whether the quiz is open', async () => {
  const onClose = jest.fn();
  await render(<Card questions={[canal]} onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Close the quiz' }));
  expect(onClose).toHaveBeenCalledTimes(1);

  const onPress = jest.fn();
  await render(<QuizButton open={false} theme="night" onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Dortmund quiz' });
  expect(button).toBeCollapsed();
  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});
