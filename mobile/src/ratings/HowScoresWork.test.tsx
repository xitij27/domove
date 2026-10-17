import { fireEvent, render, screen } from '@testing-library/react-native';
import HowScoresWork from './HowScoresWork';
import type { RatingsApi } from './api';

jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const api = (weights: RatingsApi['weights']): RatingsApi => ({ site: jest.fn(), route: jest.fn(), weights });

test('explains the score with the values the server uses right now', async () => {
  await render(<HowScoresWork visible onClose={jest.fn()} theme="day" api={api(async () => ({ school_radius_m: 200, school_primary_points: 2 }))} />);
  expect(await screen.findByText('These are the values the server uses right now.')).toBeOnTheScreen();
  expect(screen.getByText('Primary or special school within 200 m, on school days 7–17')).toBeOnTheScreen();
  expect(screen.getByText('+2')).toBeOnTheScreen();
  // values the server didn't send keep their starting value
  expect(screen.getByText('Bus stop within 30 m or Stadtbahn stop within 50 m')).toBeOnTheScreen();
});

test('without the server it shows the starting values and says so', async () => {
  await render(<HowScoresWork visible onClose={jest.fn()} theme="night" api={api(async () => { throw new Error('offline'); })} />);
  expect(await screen.findByText('Couldn\'t load the current values, so these are the starting values.')).toBeOnTheScreen();
  expect(screen.getByText('Primary or special school within 150 m, on school days 7–17')).toBeOnTheScreen();
});

test('closes', async () => {
  const onClose = jest.fn();
  await render(<HowScoresWork visible onClose={onClose} theme="day" api={api(async () => ({}))} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});
