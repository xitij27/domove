import { act } from 'react';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import { RoutesPanel } from './RoutesManager';
import type { RoutesRepository } from './api';
import type { RouteDraft, SavedRoute } from './model';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.setTimeout(15000);

let root: Root;
let persisted: SavedRoute[];
let repository: jest.Mocked<RoutesRepository>;
const onBusyChange = jest.fn();

function text(node: TestInstance): string {
  return node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');
}
function button(label: string) {
  const found = root.container.queryAll((node) => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || text(node) === label));
  expect(found).toHaveLength(1);
  return found[0];
}
async function press(label: string) {
  const target = button(label);
  expect(target.props.accessibilityState?.disabled).not.toBe(true);
  await act(async () => { target.props.onClick({ nativeEvent: {} }); });
}
async function enter(label: string, value: string) {
  const input = root.container.queryAll((node) => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function');
  expect(input).toHaveLength(1);
  await act(async () => { input[0].props.onChangeText(value); });
}
async function mode(label: string) {
  const radio = root.container.queryAll((node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label);
  await act(async () => { radio[0].props.onClick({ nativeEvent: {} }); });
}
async function mount() {
  root = createRoot();
  await act(async () => { root.render(<RoutesPanel onClose={jest.fn()} onBusyChange={onBusyChange} repository={repository} />); });
}
async function fill(start = 'Station', destination = 'Park') {
  await press('Create Route');
  await enter('Starting location', start);
  await enter('Final destination', destination);
  await mode('Bicycle');
}

beforeEach(async () => {
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
  await mount();
});
afterEach(async () => { await act(async () => { root.unmount(); }); });

test('creates multiple routes, removes individual stops, reloads and deletes', async () => {
  expect(text(root.container)).toContain('No saved routes yet');
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
  expect(text(root.container)).toContain('Via Cafe → Library');
  await fill('Home', 'Work');
  await press('Ready');
  expect(persisted).toHaveLength(2);
  await act(async () => { root.unmount(); });
  await mount();
  expect(text(root.container)).toContain('Station → Park');
  expect(text(root.container)).toContain('Home → Work');
  await press('Delete route from Station to Park');
  expect(text(root.container)).not.toContain('Station → Park');
  expect(text(root.container)).toContain('Home → Work');
  await press('Refresh routes');
  expect(persisted).toHaveLength(1);
  expect(text(root.container)).not.toContain('Station → Park');
});

test('validates required fields and keeps the draft when save fails', async () => {
  await press('Create Route');
  await press('Ready');
  expect(text(root.container)).toContain('Enter a starting location.');
  expect(text(root.container)).toContain('Enter a final destination.');
  expect(text(root.container)).toContain('Select a transportation mode.');
  expect(repository.create).not.toHaveBeenCalled();
  await enter('Starting location', 'Home');
  await enter('Final destination', 'Work');
  await mode('Car');
  repository.create.mockRejectedValueOnce(new Error('Offline. Try again.'));
  await press('Ready');
  expect(text(root.container)).toContain('Offline. Try again.');
  await press('Ready');
  expect(text(root.container)).toContain('Home → Work');
});

test('blocks double taps while a save is pending', async () => {
  await fill();
  let resolve!: (route: SavedRoute) => void;
  repository.create.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const ready = button('Ready');
  await act(async () => { ready.props.onClick({ nativeEvent: {} }); ready.props.onClick({ nativeEvent: {} }); });
  expect(repository.create).toHaveBeenCalledTimes(1);
  expect(button('Ready').props.accessibilityState.disabled).toBe(true);
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  await act(async () => { resolve({ id: '1', name: 'Station → Park', start: { label: 'Station', coordinate: null }, destination: { label: 'Park', coordinate: null }, mode: 'bike', waypoints: [], createdAt: '2026-10-16T12:00:00Z' }); });
  expect(text(root.container)).toContain('Station → Park');
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

test('failed deletion keeps the route and permits retry', async () => {
  await fill();
  await press('Ready');
  repository.delete.mockRejectedValueOnce(new Error('Cannot delete while offline.'));
  await press('Delete route from Station to Park');
  expect(text(root.container)).toContain('Cannot delete while offline.');
  expect(text(root.container)).toContain('Station → Park');
  await press('Delete route from Station to Park');
  expect(text(root.container)).not.toContain('Station → Park');
});

test('cancelling discards the draft and load failures can be retried', async () => {
  await fill();
  await press('Cancel');
  expect(repository.create).not.toHaveBeenCalled();
  repository.list.mockRejectedValueOnce(new Error('Cannot load routes.'));
  await press('Refresh routes');
  expect(text(root.container)).toContain('Cannot load routes.');
  await press('Retry loading routes');
  expect(text(root.container)).toContain('No saved routes yet');
});
