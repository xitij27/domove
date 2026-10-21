import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';
import Compass, { compassLabel } from './Compass';

jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');

test('says how far the map is turned from north, either way', () => {
  expect(compassLabel(0)).toBe('Compass: map points north');
  expect(compassLabel(40.4)).toBe('Compass: map turned 40° from north');
  expect(compassLabel(320)).toBe('Compass: map turned 40° from north');
  expect(compassLabel(180)).toBe('Compass: map turned 180° from north');
  expect(compassLabel(359.7)).toBe('Compass: map points north');
  expect(compassLabel(-30)).toBe('Compass: map turned 30° from north');
});

test('turns the needle against the map, names the angle, and asks the map to point north when tapped', async () => {
  const heading = new Animated.Value(0);
  const onPress = jest.fn();
  await render(<Compass heading={heading} theme="night" onPress={onPress} />);
  expect(screen.getByRole('button', { name: 'Compass: map points north' })).toBeOnTheScreen();

  // the map's top faces 40° east of north, so north is 40° to the left of straight up
  await act(async () => { heading.setValue(40); });
  expect(screen.getByTestId('compass-needle')).toHaveStyle({ transform: [{ rotate: '-40deg' }] });

  await fireEvent.press(screen.getByRole('button', { name: 'Compass: map turned 40° from north' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});
