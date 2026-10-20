import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getLanguage, setLanguage } from '../i18n';
import type { Release } from '../updates/release';
import type { Updater } from '../updates/updater';
import Settings from './Settings';

jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));

const release: Release = { version: '0.1.38', apkUrl: 'https://example.com/a.apk', apkName: 'a.apk', size: 48_000_000 };

function updater(overrides: Partial<Updater> = {}): Updater {
  return {
    currentVersion: '0.1.37',
    latest: jest.fn(async () => release),
    download: jest.fn(async () => 'content://apk'),
    install: jest.fn(async () => {}),
    ...overrides,
  };
}

afterEach(() => setLanguage('en', false));

test('switches the language', async () => {
  await render(<Settings visible onClose={jest.fn()} theme="day" />);
  expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'Deutsch' }));
  expect(getLanguage()).toBe('de');
  expect(screen.getByText('Einstellungen')).toBeOnTheScreen();
});

test('has no updates where the app cannot install them', async () => {
  await render(<Settings visible onClose={jest.fn()} theme="day" />);
  expect(screen.queryByText('App updates')).toBeNull();
});

test('finds a newer release, downloads it and opens the installer', async () => {
  let progress: (share: number | null) => void = () => {};
  let finish: (uri: string) => void = () => {};
  const phone = updater({ download: jest.fn((_release, onProgress) => { progress = onProgress; return new Promise<string>((resolve) => { finish = resolve; }); }) });
  await render(<Settings visible onClose={jest.fn()} theme="day" updater={phone} />);
  expect(screen.getByText('Installed: version 0.1.37')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('Version 0.1.38 is available.')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Download and install (48 MB)' }));
  expect(phone.download).toHaveBeenCalledWith(release, expect.any(Function));
  await act(async () => progress(0.426));
  expect(screen.getByText('Downloading version 0.1.38… 42 %')).toBeOnTheScreen();

  await act(async () => finish('content://apk'));
  expect(phone.install).toHaveBeenCalledWith('content://apk');
  expect(screen.getByText(/Android asks you to confirm the update/)).toBeOnTheScreen();

  // backing out of Android's installer leaves the download to install again
  await fireEvent.press(screen.getByRole('button', { name: 'Install' }));
  expect(phone.download).toHaveBeenCalledTimes(1);
  expect(phone.install).toHaveBeenCalledTimes(2);
});

test('says when the app is up to date', async () => {
  await render(<Settings visible onClose={jest.fn()} theme="day" updater={updater({ currentVersion: '0.1.38' })} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('You have the latest version.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Check again' })).toBeOnTheScreen();
});

test('a development build takes any release', async () => {
  await render(<Settings visible onClose={jest.fn()} theme="day" updater={updater({ currentVersion: '0.0.0' })} />);
  expect(screen.getByText('Installed: a development build')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('Version 0.1.38 is available.')).toBeOnTheScreen();
});

test('a failed check can be tried again', async () => {
  const latest = jest.fn().mockRejectedValueOnce(new Error('GitHub answered 403. Try again later.')).mockResolvedValue(release);
  await render(<Settings visible onClose={jest.fn()} theme="day" updater={updater({ latest })} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Check for updates' }));
  expect(await screen.findByText('Update failed: GitHub answered 403. Try again later.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Version 0.1.38 is available.')).toBeOnTheScreen();
});

test('a failed download can be tried again', async () => {
  const download = jest.fn().mockRejectedValueOnce(new Error('No connection')).mockResolvedValue('content://apk');
  const phone = updater({ download });
  await render(<Settings visible onClose={jest.fn()} theme="day" updater={phone} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Check for updates' }));
  await fireEvent.press(await screen.findByRole('button', { name: /Download and install/ }));
  expect(await screen.findByText('Update failed: No connection')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(phone.install).toHaveBeenCalledWith('content://apk');
});
