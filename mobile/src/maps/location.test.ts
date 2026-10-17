import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import type { TransportMode } from '../routes/model';
import { useFollowUser } from './location';
import { FOLLOW_MS, FOLLOW_START_MS, FOLLOW_ZOOM, TURN_MS } from './navigation';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, BestForNavigation: 6 },
  getLastKnownPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  watchHeadingAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));
jest.mock('expo-sensors', () => ({ Gyroscope: { isAvailableAsync: jest.fn() } }));

let onFix: Location.LocationCallback;
let onCompass: Location.LocationHeadingCallback;
const remove = jest.fn();
const follow = jest.fn();
const map = { current: { pointNorth: jest.fn(), zoomTo: jest.fn(), follow } };

function fix(latitude: number, course: number | null, speed: number | null): Location.LocationObject {
  return { coords: { latitude, longitude: 7.46, heading: course, speed, accuracy: 5, altitude: null, altitudeAccuracy: null }, timestamp: 0 };
}
const facing = (heading: number) => ({ trueHeading: heading, magHeading: heading, accuracy: 3 });
const view = (latitude: number, heading: number | null, mode: TransportMode, ms: number) =>
  ({ center: { latitude, longitude: 7.46 }, heading, zoom: FOLLOW_ZOOM[mode], ms, glide: ms !== FOLLOW_START_MS });

async function mount(mode: TransportMode | null) {
  const hook = await renderHook((props: { mode: TransportMode | null }) => useFollowUser(map, props.mode), { initialProps: { mode } });
  await act(async () => {}); // the subscriptions resolve
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(null);
  jest.mocked(Location.watchPositionAsync).mockImplementation(async (_options, callback) => { onFix = callback; return { remove }; });
  jest.mocked(Location.watchHeadingAsync).mockImplementation(async (callback) => { onCompass = callback; return { remove }; });
});

test('brings the camera down to the user, then glides it on with each fix, turned the way they move', async () => {
  await mount('car');
  await act(async () => onFix(fix(51.5, 90, 10)));
  expect(follow).toHaveBeenLastCalledWith(view(51.5, 90, 'car', FOLLOW_START_MS));
  await act(async () => onFix(fix(51.501, 95, 10)));
  expect(follow).toHaveBeenLastCalledWith(view(51.501, 95, 'car', FOLLOW_MS));
});

test('starts from the last known position, without waiting for the first fix', async () => {
  jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(fix(51.49, null, null));
  await mount('bike');
  expect(follow).toHaveBeenCalledWith(view(51.49, null, 'bike', FOLLOW_START_MS));
});

test('on foot, turning the phone turns the map, in steps and a few times a second at most', async () => {
  const now = jest.spyOn(Date, 'now');
  await mount('pedestrian');
  await act(async () => onFix(fix(51.5, null, 0)));
  follow.mockClear();

  now.mockReturnValue(1000);
  await act(async () => onCompass(facing(100)));
  expect(follow).toHaveBeenLastCalledWith(view(51.5, 100, 'pedestrian', TURN_MS));
  now.mockReturnValue(2000);
  await act(async () => onCompass(facing(102))); // the compass shaking
  now.mockReturnValue(2100);
  await act(async () => onCompass(facing(130)));
  now.mockReturnValue(2200);
  await act(async () => onCompass(facing(160))); // too soon after the last turn
  expect(follow).toHaveBeenCalledTimes(2);
  expect(follow).toHaveBeenLastCalledWith(view(51.5, 130, 'pedestrian', TURN_MS));
  now.mockRestore();
});

test('in a car, the map keeps its turn while standing, whichever way the phone points', async () => {
  await mount('car');
  await act(async () => onFix(fix(51.5, 90, 10)));
  await act(async () => onCompass(facing(200)));
  await act(async () => onFix(fix(51.5, null, 0)));
  expect(follow).toHaveBeenCalledTimes(2);
  expect(follow).toHaveBeenLastCalledWith(view(51.5, 90, 'car', FOLLOW_MS));
});

test('listens only while following', async () => {
  const hook = await mount(null);
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  await hook.rerender({ mode: 'car' });
  await act(async () => {});
  expect(Location.watchPositionAsync).toHaveBeenCalledWith(expect.objectContaining({ accuracy: Location.Accuracy.BestForNavigation }), expect.any(Function));
  await hook.rerender({ mode: null });
  expect(remove).toHaveBeenCalledTimes(2);
});
