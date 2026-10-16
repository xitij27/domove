import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import RoutesManager, { RoutesPanel } from './RoutesManager';
import type { RoutesRepository } from './api';
import type { RouteDraft, SavedRoute } from './model';
import { searchPlaces } from './places';
import { constructionNotifications } from '../notifications/runtime';

// expo-font needs expo-asset, which only Expo's Metro config resolves.
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// Every search suggests exactly the typed text.
jest.mock('./places', () => ({ searchPlaces: jest.fn(async (query: string) => [{ label: query, coordinate: { latitude: 51.51, longitude: 7.46 } }]) }));
jest.mock('../notifications/runtime', () => ({ constructionNotifications: { forgetRoute: jest.fn(async () => undefined) } }));
jest.setTimeout(15000);

const at = { latitude: 51.51, longitude: 7.46 };

let persisted: SavedRoute[];
let repository: jest.Mocked<RoutesRepository>;
const onBusyChange = jest.fn();
const onShowRoute = jest.fn();
const stationToPark: SavedRoute = { id: '1', name: 'Station → Park', start: { label: 'Station', coordinate: at }, destination: { label: 'Park', coordinate: at }, mode: 'bike', startTime: null, weekdays: [], waypoints: [], createdAt: '2026-10-16T12:00:00Z' };

function mount() {
  return render(<RoutesPanel onClose={jest.fn()} onShowRoute={onShowRoute} onBusyChange={onBusyChange} repository={repository} />);
}
async function press(name: string) {
  const button = screen.getByRole('button', { name });
  expect(button).toBeEnabled();
  await fireEvent.press(button);
}
async function enter(label: string, value: string) {
  await fireEvent.changeText(screen.getByLabelText(label), value);
}
/** Types a place and picks the suggestion with the same text. */
async function pick(label: string, value: string) {
  await enter(label, value);
  await fireEvent.press(await screen.findByRole('button', { name: value }));
}
async function fill(start = 'Station', destination = 'Park') {
  await press('Create Route');
  await pick('Starting location', start);
  await pick('Final destination', destination);
  await fireEvent.press(screen.getByRole('radio', { name: 'Bicycle' }));
}

beforeEach(() => {
  persisted = [];
  onBusyChange.mockReset();
  onShowRoute.mockReset();
  repository = {
    list: jest.fn(async () => [...persisted]),
    listObstacles: jest.fn(async (_routeId: string) => []),
    create: jest.fn(async (draft: RouteDraft) => {
      const route: SavedRoute = {
        id: String(persisted.length + 1), name: `${draft.start.label} → ${draft.destination.label}`,
        start: { label: draft.start.label.trim(), coordinate: at }, destination: { label: draft.destination.label.trim(), coordinate: at },
        mode: draft.mode as SavedRoute['mode'], startTime: draft.startTime.trim() || null, weekdays: draft.weekdays, createdAt: '2026-10-16T12:00:00Z',
        waypoints: draft.waypoints.filter((stop) => stop.label.trim()).map((stop, sequence) => ({ id: String(sequence), label: stop.label.trim(), sequence, coordinate: at })),
      };
      persisted.unshift(route);
      return route;
    }),
    delete: jest.fn(async (id: string) => { persisted = persisted.filter((route) => route.id !== id); }),
  };
});

test('the sheet raises on the form or the saved routes, and Close lowers it', async () => {
  const onOpenChange = jest.fn();
  await render(<RoutesManager repository={repository} onOpenChange={onOpenChange} onShowRoute={onShowRoute} />);
  expect(screen.getByRole('button', { name: 'Raise the routes panel' })).toBeCollapsed();
  await press('Create Route');
  expect(screen.getByLabelText('Starting location')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Lower the routes panel' })).toBeExpanded();
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  await press('Close');
  expect(screen.queryByLabelText('Starting location')).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  await press('Saved routes');
  expect(await screen.findByText('No saved routes yet')).toBeOnTheScreen();
  await press('Lower the routes panel');
  expect(screen.getByRole('button', { name: 'Create Route' })).toBeOnTheScreen();
});

test('creates multiple routes, removes individual stops, reloads and deletes', async () => {
  const { unmount } = await mount();
  expect(screen.getByText('No saved routes yet')).toBeOnTheScreen();
  await fill();
  await press('+ Add stop');
  await pick('Intermediate stop 1', 'Cafe');
  await press('+ Add stop');
  await pick('Intermediate stop 2', 'Remove me');
  await press('+ Add stop');
  await pick('Intermediate stop 3', 'Library');
  await press('Remove stop 2');
  await press('Ready');
  expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ waypoints: [{ label: 'Cafe', coordinate: at }, { label: 'Library', coordinate: at }] }));
  expect(screen.getByText('Via Cafe → Library')).toBeOnTheScreen();
  await fill('Home', 'Work');
  await press('Ready');
  expect(persisted).toHaveLength(2);
  await unmount();
  await mount();
  expect(screen.getByText('Station → Park')).toBeOnTheScreen();
  expect(screen.getByText('Home → Work')).toBeOnTheScreen();
  await press('Delete route from Station to Park');
  expect(screen.queryByText('Station → Park')).not.toBeOnTheScreen();
  expect(screen.getByText('Home → Work')).toBeOnTheScreen();
  expect(constructionNotifications.forgetRoute).toHaveBeenCalledWith('1');
  await press('Refresh routes');
  expect(persisted).toHaveLength(1);
  expect(screen.queryByText('Station → Park')).not.toBeOnTheScreen();
});

test('validates required fields and keeps the draft when save fails', async () => {
  await mount();
  await press('Create Route');
  await press('Ready');
  expect(screen.getByText('Enter a starting location.')).toBeOnTheScreen();
  expect(screen.getByText('Enter a final destination.')).toBeOnTheScreen();
  expect(screen.getByText('Select a transportation mode.')).toBeOnTheScreen();
  expect(repository.create).not.toHaveBeenCalled();
  await pick('Starting location', 'Home');
  await pick('Final destination', 'Work');
  await fireEvent.press(screen.getByRole('radio', { name: 'Car' }));
  repository.create.mockRejectedValueOnce(new Error('Offline. Try again.'));
  await press('Ready');
  expect(screen.getByText('Offline. Try again.')).toBeOnTheScreen();
  await press('Ready');
  expect(screen.getByText('Home → Work')).toBeOnTheScreen();
});

test('only places picked from the suggestions can be saved', async () => {
  await mount();
  await press('Create Route');
  await enter('Starting location', 'Station');
  await pick('Final destination', 'Park');
  await fireEvent.press(screen.getByRole('radio', { name: 'Bicycle' }));
  await press('Ready');
  expect(screen.getByText('Pick a place from the suggestions.')).toBeOnTheScreen();
  // Typing over a picked place drops its coordinate too.
  await pick('Starting location', 'Station');
  await enter('Final destination', 'Parks');
  await press('Ready');
  expect(screen.getByText('Pick a place from the suggestions.')).toBeOnTheScreen();
  expect(repository.create).not.toHaveBeenCalled();
  await fireEvent.press(await screen.findByRole('button', { name: 'Parks' }));
  await press('Ready');
  expect(screen.getByText('Station → Parks')).toBeOnTheScreen();
});

/** Picks a value in the open iOS picker, as the native picker reports it. */
async function choose(date: Date) {
  await fireEvent(screen.getByTestId('leaving-picker'), 'change', { nativeEvent: { timestamp: date.getTime() } });
}

async function toggleDay(name: string) {
  await fireEvent.press(screen.getByRole('checkbox', { name }));
}

test('like an alarm, a route does not repeat until days are picked', async () => {
  jest.useFakeTimers({ now: new Date(2026, 9, 16, 14, 52), advanceTimers: true });
  try {
    await mount();
    await fill();
    expect(screen.getByText("Doesn't repeat")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Leaving time' })).toHaveAccessibilityValue({ text: 'Not set' });
    // A repeat day needs a time, so the clock opens on the current one.
    await toggleDay('Monday');
    expect(screen.getByRole('button', { name: 'Leaving time' })).toHaveAccessibilityValue({ text: '14:52' });
    await choose(new Date(2026, 9, 16, 7, 15));
    for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday']) await toggleDay(day);
    expect(screen.getByRole('checkbox', { name: 'Friday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Saturday' })).not.toBeChecked();
    expect(screen.getByText('Weekdays')).toBeOnTheScreen();
    await press('Ready');
    expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ startTime: '07:15', weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] }));
    expect(await screen.findByText('Leaving at 07:15 · Weekdays')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

test('Clear removes the time and the repeat days', async () => {
  await mount();
  await fill();
  await press('Leaving time');
  await choose(new Date(2026, 9, 16, 7, 15));
  await toggleDay('Saturday');
  expect(screen.getByText('Sat')).toBeOnTheScreen();
  await press('Clear leaving time');
  expect(screen.getByRole('button', { name: 'Leaving time' })).toHaveAccessibilityValue({ text: 'Not set' });
  expect(screen.getByRole('checkbox', { name: 'Saturday' })).not.toBeChecked();
  expect(screen.queryByTestId('leaving-picker')).toBeNull();
  await press('Leaving time');
  await choose(new Date(2026, 9, 16, 7, 15));
  await press('Ready');
  expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ startTime: '07:15', weekdays: [] }));
  expect(await screen.findByText('Leaving at 07:15')).toBeOnTheScreen();
});

test('says when suggestions cannot be loaded', async () => {
  jest.mocked(searchPlaces).mockRejectedValueOnce(new Error('offline'));
  await mount();
  await press('Create Route');
  await enter('Starting location', 'Station');
  expect(await screen.findByText('Could not load suggestions. Check your connection.')).toBeOnTheScreen();
});

test('blocks double taps while a save is pending', async () => {
  await mount();
  await fill();
  let resolve!: (route: SavedRoute) => void;
  repository.create.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  // The returned promise settles when the press handler does, i.e. after the save.
  const pressing = fireEvent.press(screen.getByRole('button', { name: 'Ready' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ready' })).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  persisted.unshift(stationToPark);
  await act(async () => { resolve(stationToPark); await pressing; });
  expect(repository.create).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Station → Park')).toBeOnTheScreen();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

test('a route saved while the list is still loading stays listed', async () => {
  let finishFirstLoad!: (routes: SavedRoute[]) => void;
  repository.list.mockImplementationOnce(() => new Promise((done) => { finishFirstLoad = done; }));
  await mount();
  await fill();
  await press('Ready');
  expect(screen.getByText('Station → Park')).toBeOnTheScreen();
  // The first request started before the save, so its result must not replace the list.
  await act(async () => { finishFirstLoad([]); });
  expect(screen.getByText('Station → Park')).toBeOnTheScreen();
});

test('failed deletion keeps the route and permits retry', async () => {
  await mount();
  await fill();
  await press('Ready');
  repository.delete.mockRejectedValueOnce(new Error('Cannot delete while offline.'));
  await press('Delete route from Station to Park');
  expect(screen.getByText('Cannot delete while offline.')).toBeOnTheScreen();
  expect(screen.getByText('Station → Park')).toBeOnTheScreen();
  await press('Delete route from Station to Park');
  expect(screen.queryByText('Station → Park')).not.toBeOnTheScreen();
});

test('a location saved without a label gets a generic name', async () => {
  persisted = [{ ...stationToPark, destination: { label: null, coordinate: { latitude: 51.49, longitude: 7.48 } } }];
  await mount();
  expect(screen.getByText('Station → Final destination')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Delete route from Station to Final destination' })).toBeOnTheScreen();
});

test('cancelling discards the draft and load failures can be retried', async () => {
  await mount();
  await fill();
  await press('Cancel');
  expect(repository.create).not.toHaveBeenCalled();
  repository.list.mockRejectedValueOnce(new Error('Cannot load routes.'));
  await press('Refresh routes');
  expect(screen.getByText('Cannot load routes.')).toBeOnTheScreen();
  await press('Retry loading routes');
  expect(screen.getByText('No saved routes yet')).toBeOnTheScreen();
});

test('tapping a route puts it on the map and lowers the sheet', async () => {
  persisted = [{ ...stationToPark }];
  const onOpenChange = jest.fn();
  await render(<RoutesManager repository={repository} onOpenChange={onOpenChange} onShowRoute={onShowRoute} />);
  await press('Saved routes');
  await screen.findByText('Station → Park');
  await press('Show route from Station to Park on the map');
  expect(onShowRoute).toHaveBeenCalledWith(stationToPark);
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole('button', { name: 'Create Route' })).toBeOnTheScreen();
});
