import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import { Reveal } from './motion';

// What the phone tells the app when its "reduce motion" setting changes; jest.setup.js starts every test file with it on.
const calls = jest.mocked(AccessibilityInfo.addEventListener).mock.calls as unknown[][];
const reduceMotion = calls.find(([event]) => event === 'reduceMotionChanged')?.[1] as (on: boolean) => void;

function Card({ title }: { title: string | null }) {
  return <Reveal>{title && <Text>{title}</Text>}</Reveal>;
}

beforeEach(async () => {
  jest.useFakeTimers();
  await act(async () => reduceMotion(false));
});

afterEach(async () => {
  await act(async () => reduceMotion(true));
  jest.useRealTimers();
});

test('a card that goes stays in sight, out of reach, until it has shrunk away', async () => {
  const { rerender } = await render(<Card title="Roadworks" />);
  expect(screen.getByText('Roadworks')).toBeOnTheScreen();
  await rerender(<Card title={null} />);
  expect(screen.queryByText('Roadworks')).toBeNull();
  expect(screen.getByText('Roadworks', { includeHiddenElements: true })).toBeOnTheScreen();
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(screen.queryByText('Roadworks', { includeHiddenElements: true })).toBeNull();
});

test('a card called back on its way out shows what it is given', async () => {
  const { rerender } = await render(<Card title="Roadworks" />);
  await rerender(<Card title={null} />);
  await rerender(<Card title="Lane closed" />);
  expect(screen.getByText('Lane closed')).toBeOnTheScreen();
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(screen.getByText('Lane closed')).toBeOnTheScreen();
  expect(screen.queryByText('Roadworks', { includeHiddenElements: true })).toBeNull();
});

test('with reduced motion, a card goes at once', async () => {
  await act(async () => reduceMotion(true));
  const { rerender } = await render(<Card title="Roadworks" />);
  await rerender(<Card title={null} />);
  expect(screen.queryByText('Roadworks', { includeHiddenElements: true })).toBeNull();
});
