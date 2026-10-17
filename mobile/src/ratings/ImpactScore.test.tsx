import { fireEvent, render, screen } from '@testing-library/react-native';
import ImpactScore from './ImpactScore';
import { parseRouteRatings, parseSiteRatings } from './model';
import { crossingRouteRow, holidayRow, schoolDayRow } from './testRatings';

const props = { loading: false, error: null, onRetry: jest.fn(), mode: 'car' as const, theme: 'day' as const, onExplain: jest.fn() };

test('shows the score with every point behind it and how they add up', async () => {
  const [rating] = parseSiteRatings([schoolDayRow]);
  await render(<ImpactScore {...props} rating={rating} />);
  expect(screen.getByText('9')).toBeOnTheScreen();
  expect(screen.getByText('Severe impact')).toBeOnTheScreen();
  expect(screen.getByText('Half closure and lane narrowing on Kaiserstraße (main road)')).toBeOnTheScreen();
  expect(screen.getByText('Slows cars by about 2 min · 6 × 0.6 × 1')).toBeOnTheScreen();
  expect(screen.getByText('Berswordt-Europa-Grundschule, 83 m away')).toBeOnTheScreen();
  expect(screen.getAllByText('+1.5')).toHaveLength(2);
  expect(screen.getByText('Closure 4.7 + surroundings 4.0 = 8.7, rounded to 9/10')).toBeOnTheScreen();
});

test('factors that don\'t count at this time stay on the list with the reason', async () => {
  const [rating] = parseSiteRatings([holidayRow]);
  await render(<ImpactScore {...props} rating={rating} />);
  expect(screen.getAllByText('Not counted: school holidays (Herbstferien)')).toHaveLength(2);
  expect(screen.getByText('4 crossings with lights or markings')).toBeOnTheScreen();
  expect(screen.getByText('Medium impact')).toBeOnTheScreen();
});

test('without a route the score can be switched to another mode', async () => {
  const onModeChange = jest.fn();
  const [rating] = parseSiteRatings([schoolDayRow]);
  await render(<ImpactScore {...props} rating={rating} onModeChange={onModeChange} />);
  expect(screen.getByRole('radio', { name: 'Car' })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'Bicycle' }));
  expect(onModeChange).toHaveBeenCalledWith('bike');
});

test('on a route it says how much of the score counts for the route', async () => {
  const [rating] = parseRouteRatings([crossingRouteRow]);
  await render(<ImpactScore {...props} rating={rating} />);
  expect(screen.getByText('Your route only crosses it, so 30 % counts: 2.6')).toBeOnTheScreen();
  expect(screen.queryByRole('radio')).toBeNull();
});

test('a failed load can be retried, and the method is always one tap away', async () => {
  const onRetry = jest.fn();
  const onExplain = jest.fn();
  await render(<ImpactScore {...props} rating={null} error="Could not reach the server for the impact score." onRetry={onRetry} onExplain={onExplain} />);
  await fireEvent.press(screen.getByText('Could not reach the server for the impact score. — tap to retry'));
  expect(onRetry).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'How scores work' }));
  expect(onExplain).toHaveBeenCalled();
});
