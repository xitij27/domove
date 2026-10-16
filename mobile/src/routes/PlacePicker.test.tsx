import { act, fireEvent, render, screen } from '@testing-library/react-native';
import PlacePicker from './PlacePicker';
import type { PlacePick } from './model';
import { placeNameAt } from './places';

// expo-font needs expo-asset, which only Expo's Metro config resolves.
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./places', () => ({ placeNameAt: jest.fn(async () => 'Markt, Dortmund') }));

const markt = { latitude: 51.5136, longitude: 7.4653 };
let pick: PlacePick;
const onDone = jest.fn();

beforeEach(() => {
  pick = { title: 'Starting location', kind: 'start', initial: null, onPick: jest.fn() };
  onDone.mockReset();
  jest.mocked(placeNameAt).mockClear();
});

function mount(center: typeof markt | null) {
  return render(<PlacePicker pick={pick} center={center} theme="day" onDone={onDone} />);
}

test('names the place under the pin and hands it to the form', async () => {
  const { rerender } = await mount(null);
  expect(screen.getByText('Moving the pin…')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Use this location' })).toBeDisabled();
  await rerender(<PlacePicker pick={pick} center={markt} theme="day" onDone={onDone} />);
  expect(await screen.findByText('Markt, Dortmund')).toBeOnTheScreen();
  // The map reports the same middle again when it idles, which needs no new lookup.
  await rerender(<PlacePicker pick={pick} center={{ ...markt }} theme="day" onDone={onDone} />);
  expect(placeNameAt).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Use this location' }));
  expect(pick.onPick).toHaveBeenCalledWith({ label: 'Markt, Dortmund', coordinate: markt });
  expect(onDone).toHaveBeenCalled();
});

test('a place without a name, or offline, is saved by its coordinate', async () => {
  let fail!: (error: Error) => void;
  jest.mocked(placeNameAt).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  await mount(markt);
  expect(screen.getByLabelText('Looking up the address')).toBeOnTheScreen();
  await act(async () => fail(new Error('offline')));
  expect(screen.queryByLabelText('Looking up the address')).toBeNull();
  expect(screen.getByText('Pin at 51.51360, 7.46530')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Use this location' }));
  expect(pick.onPick).toHaveBeenCalledWith({ label: 'Pin at 51.51360, 7.46530', coordinate: markt });
});

test('closing hands nothing to the form', async () => {
  await mount(markt);
  await fireEvent.press(screen.getByRole('button', { name: 'Stop choosing on the map' }));
  expect(onDone).toHaveBeenCalled();
  expect(pick.onPick).not.toHaveBeenCalled();
});
