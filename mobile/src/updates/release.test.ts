import { fetchLatestRelease, isNewer, LATEST_RELEASE_URL, parseRelease, parseVersion, releaseVersion } from './release';

const apk = (name: string, size = 48_000_000) => ({ name, size, browser_download_url: `https://github.com/xitij27/domove/releases/download/v0.1.38/${name}` });

test('reads release tags with or without the v', () => {
  expect(parseVersion('v0.1.38')).toEqual([0, 1, 38]);
  expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  expect(parseVersion('1.0')).toBeNull();
  expect(parseVersion('latest')).toBeNull();
  expect(parseVersion(null)).toBeNull();
});

test('a development build has no release version', () => {
  expect(releaseVersion('0.0.0')).toBeNull();
  expect(releaseVersion(null)).toBeNull();
  expect(releaseVersion('0.1.37')).toEqual([0, 1, 37]);
});

test('only a later release is an update', () => {
  expect(isNewer([0, 1, 38], [0, 1, 37])).toBe(true);
  expect(isNewer([0, 2, 0], [0, 1, 99])).toBe(true);
  expect(isNewer([1, 0, 0], [0, 9, 9])).toBe(true);
  expect(isNewer([0, 1, 37], [0, 1, 37])).toBe(false);
  // Android refuses to install an older version over a newer one
  expect(isNewer([0, 1, 36], [0, 1, 37])).toBe(false);
  expect(isNewer([0, 1, 1], null)).toBe(true);
});

test('takes the version and the APK from the release', () => {
  expect(parseRelease({ tag_name: 'v0.1.38', assets: [{ name: 'notes.txt', browser_download_url: 'x' }, apk('domove-v0.1.38-arm64.apk')] })).toEqual({
    version: '0.1.38',
    apkName: 'domove-v0.1.38-arm64.apk',
    apkUrl: 'https://github.com/xitij27/domove/releases/download/v0.1.38/domove-v0.1.38-arm64.apk',
    size: 48_000_000,
  });
  expect(parseRelease({ tag_name: 'v0.1.38', assets: [apk('other.apk'), apk('domove-arm64.apk')] }).apkName).toBe('domove-arm64.apk');
});

test('a release without an APK or a version tag is no update', () => {
  expect(() => parseRelease({ tag_name: 'v0.1.38', assets: [] })).toThrow('The latest release has no Android app.');
  expect(() => parseRelease({ tag_name: 'nightly', assets: [apk('a.apk')] })).toThrow(/version/);
  expect(() => parseRelease(null)).toThrow();
});

test('asks GitHub for the latest release', async () => {
  const fetchFn = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v0.1.38', assets: [apk('domove-v0.1.38-arm64.apk')] }) });
  await expect(fetchLatestRelease(fetchFn)).resolves.toMatchObject({ version: '0.1.38' });
  expect(fetchFn).toHaveBeenCalledWith(LATEST_RELEASE_URL, expect.anything());
});

test('says when GitHub turns the check down', async () => {
  const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
  await expect(fetchLatestRelease(fetchFn)).rejects.toThrow(/403/);
});
