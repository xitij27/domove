import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RoutesPanel } from './RoutesManager';
import type { RoutesRepository } from './api';
import type { RouteDraft, SavedRoute } from './model';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.setTimeout(15000);

let persisted: SavedRoute[];
let repository: jest.Mocked<RoutesRepository>;
const onBusyChange = jest.fn();
const stationToPark: SavedRoute = { id: '1', name: 'Station → Park', start: { label: 'Station', coordinate: null }, destination: { label: 'Park', coordinate: null }, mode: 'bike', waypoints: [], createdAt: '2026-10-16T12:00:00Z' };

function mount() {
  return render(<RoutesPanel onClose={jest.fn()} onBusyChange={onBusyChange} repository={repository} />);
}
async function press(name: string) {
  const button = screen.getByRole('button', { name });
  expect(button).toBeEnabled();
  await fireEvent.press(button);
}
async function enter(label: string, value: string) {
  await fireEvent.changeText(screen.getByLabelText(label), value);
}
async function fill(start = 'Station', destination = 'Park') {
  await press('Create Route');
  await enter('Starting location', start);
  await enter('Final destination', destination);
  await fireEvent.press(screen.getByRole('radio', { name: 'Bicycle' }));
}

beforeEach(() => {
  persisted = [];
  onBusyChange.mockReset();
  repository = {
    list: jest.fn(async () => [...persisted]),
    create: jest.fn(async (draft: RouteDraft) => {
      const route: SavedRoute = {
        id: String(persisted.length + 1), name: `${draft.start} → ${draft.destination}`,
        start: { label: draft.start.trim(), coordinate: null }, destination: { label: draft.destination.trim(), coordinate: null },
        mode: draft.mode as SavedRoute['mode'], createdAt: '2026-10-16T12:00:00Z',
        waypoints: draft.waypoints.filter((label) => label.trim()).map((label, sequence) => ({ id: String(sequence), label: label.trim(), sequence, coordinate: null })),
      };
      persisted.unshift(route);
      return route;
    }),
    delete: jest.fn(async (id: string) => { persisted = persisted.filter((route) => route.id !== id); }),
  };
});

test('creates multiple routes, removes individual stops, reloads and deletes', async () => {
  const { unmount } = await mount();
  expect(screen.getByText('No saved routes yet')).toBeOnTheScreen();
  await fill();
  await press('+ Add stop');
  await enter('Intermediate stop 1', 'Cafe');
  await press('+ Add stop');
  await enter('Intermediate stop 2', 'Remove me');
  await press('+ Add stop');
  await enter('Intermediate stop 3', 'Library');
  await press('Remove stop 2');
  await press('Ready');
  expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ waypoints: ['Cafe', 'Library'] }));
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
  await enter('Starting location', 'Home');
  await enter('Final destination', 'Work');
  await fireEvent.press(screen.getByRole('radio', { name: 'Car' }));
  repository.create.mockRejectedValueOnce(new Error('Offline. Try again.'));
  await press('Ready');
  expect(screen.getByText('Offline. Try again.')).toBeOnTheScreen();
  await press('Ready');
  expect(screen.getByText('Home → Work')).toBeOnTheScreen();
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
