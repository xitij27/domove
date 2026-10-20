import { fireEvent, render, screen } from '@testing-library/react-native';
import DetourSummary from './DetourSummary';
import type { LonLat } from './geo';
import { planRoute } from './planner';
import { at, leg, slowing, square } from './testPlan';

jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');

const straight: [number, number][] = [[0, 0], [2000, 0]];
const north: [number, number][] = [[0, 0], [0, 300], [2000, 300], [2000, 0]];
const nameOf = () => 'Kaiserstraße';
const noop = () => {};

const kaiserstrasse = () => planRoute({
  places: [at(0, 0), at(2000, 0)],
  sites: [square('k', 1000, 0)],
  scores: new Map([['k', slowing(8.7)]]),
  router: async (_places: LonLat[], cuts: LonLat[][]) => (cuts.length ? leg(1080, ...north) : leg(840, ...straight)),
});

test('says it is looking, and offers a retry when it couldn\'t', async () => {
  const retry = jest.fn();
  await render(<DetourSummary detours={{ status: 'planning' }} chosen={0} onChoose={noop} onRetry={noop} nameOf={nameOf} theme="day" />);
  expect(screen.getByText('Looking for a way around construction…')).toBeOnTheScreen();
  await render(<DetourSummary detours={{ status: 'failed', error: 'Could not reach the routing server.' }} chosen={0} onChoose={noop} onRetry={retry} nameOf={nameOf} theme="night" />);
  await fireEvent.press(screen.getByRole('button', { name: /Couldn’t look for a way around construction: Could not reach the routing server\./ }));
  expect(retry).toHaveBeenCalled();
});

test('shows the way picked, and lets the user pick another', async () => {
  const plan = await kaiserstrasse();
  const choose = jest.fn();
  await render(<DetourSummary detours={{ status: 'ready', plan, scores: new Map() }} chosen={0} onChoose={choose} onRetry={noop} nameOf={nameOf} theme="day" />);
  expect(screen.getByText('Recommended · 18 min (+4 min) · 10.8 km')).toBeOnTheScreen();
  expect(screen.getByText('Avoids Kaiserstraße (9/10)')).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: /^Recommended way, 18 minutes/ })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: /^Direct way, 14 minutes/ }));
  expect(choose).toHaveBeenCalledWith(1);
});

test('one way alone needs no choice', async () => {
  const plan = await planRoute({ places: [at(0, 0), at(2000, 0)], sites: [], scores: new Map(), router: async () => leg(200, ...straight) });
  await render(<DetourSummary detours={{ status: 'ready', plan, scores: new Map() }} chosen={0} onChoose={noop} onRetry={noop} nameOf={nameOf} theme="day" />);
  expect(screen.getByText('No detour needed')).toBeOnTheScreen();
  expect(screen.queryByRole('radio')).toBeNull();
});

test('offers a retry when looking for detours failed', async () => {
  const retry = jest.fn();
  await render(<DetourSummary detours={{ status: 'failed', error: 'Server unreachable' }} chosen={0} onChoose={noop} onRetry={retry} nameOf={nameOf} theme="day" />);
  await fireEvent.press(screen.getByRole('button'));
  expect(retry).toHaveBeenCalled();
});
