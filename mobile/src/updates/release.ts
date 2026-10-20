import { strings } from '../i18n';

/** GitHub's newest published release; .github/workflows/android-apk.yml makes one on every push to main. */
export const LATEST_RELEASE_URL = 'https://api.github.com/repos/xitij27/domove/releases/latest';

/** Major, minor, patch. */
export type Version = [number, number, number];

/** A release that has an Android app to install. */
export type Release = {
  /** As the app shows it: "0.1.38". */
  version: string;
  apkUrl: string;
  apkName: string;
  /** In bytes; 0 when GitHub doesn't say. */
  size: number;
};

/** "v0.1.38" or "0.1.38"; null for anything else. */
export function parseVersion(text: string | null | undefined): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((text ?? '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** The release this app was built as; null for a development build, which app.json numbers 0.0.0. */
export function releaseVersion(text: string | null | undefined): Version | null {
  const version = parseVersion(text);
  return version && version.some((part) => part > 0) ? version : null;
}

/** Whether `latest` comes after `current`. An app without a release version takes any release. */
export function isNewer(latest: Version, current: Version | null): boolean {
  if (!current) return true;
  for (let i = 0; i < 3; i++) {
    if (latest[i] !== current[i]) return latest[i] > current[i];
  }
  return false;
}

type GitHubAsset = { name?: unknown; browser_download_url?: unknown; size?: unknown };

/** The release's version and APK, from GitHub's answer. */
export function parseRelease(body: unknown): Release {
  const { tag_name: tag, assets } = (body ?? {}) as { tag_name?: unknown; assets?: unknown };
  const version = typeof tag === 'string' ? parseVersion(tag) : null;
  if (!version) throw new Error(strings().updates.badRelease);
  const apks = (Array.isArray(assets) ? assets as GitHubAsset[] : [])
    .filter((a) => typeof a.name === 'string' && a.name.endsWith('.apk') && typeof a.browser_download_url === 'string');
  // the build is 64-bit only, but prefer the one that says so if there are ever more
  const apk = apks.find((a) => (a.name as string).includes('arm64')) ?? apks[0];
  if (!apk) throw new Error(strings().updates.noApk);
  return {
    version: version.join('.'),
    apkUrl: apk.browser_download_url as string,
    apkName: apk.name as string,
    size: typeof apk.size === 'number' ? apk.size : 0,
  };
}

export async function fetchLatestRelease(fetchFn: typeof fetch = fetch): Promise<Release> {
  const response = await fetchFn(LATEST_RELEASE_URL, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(strings().updates.serverError(response.status));
  return parseRelease(await response.json());
}
