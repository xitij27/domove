import { useCallback, useRef, useState } from 'react';
import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { strings } from '../i18n';
import { fetchLatestRelease, isNewer, parseVersion, releaseVersion, type Release } from './release';

/** What the update check needs from the phone; tests pass their own. */
export type Updater = {
  /** The installed app's version name, as the release build set it. */
  currentVersion: string | null;
  latest: () => Promise<Release>;
  /** Downloads the release's APK; `onProgress` gets a share from 0 to 1, or null while the size is unknown. */
  download: (release: Release, onProgress: (share: number | null) => void) => Promise<string>;
  /** Opens Android's installer on a downloaded APK, which asks the user to confirm. */
  install: (apk: string) => Promise<void>;
};

const APK_TYPE = 'application/vnd.android.package-archive';
// Intent.FLAG_GRANT_READ_URI_PERMISSION: lets the installer read the file through the app's content URI.
const GRANT_READ = 1;

export const androidUpdater: Updater = {
  currentVersion: Application.nativeApplicationVersion,
  latest: () => fetchLatestRelease(),
  download: async (release, onProgress) => {
    // In the cache, which the app's file provider shares; an earlier download is of no use any more.
    const folder = new Directory(Paths.cache, 'updates');
    if (folder.exists) folder.delete();
    folder.create();
    const apk = await File.downloadFileAsync(release.apkUrl, new File(folder, release.apkName), {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : release.size;
        onProgress(total > 0 ? Math.min(1, bytesWritten / total) : null);
      },
    });
    return apk.contentUri;
  },
  install: async (apk) => {
    await startActivityAsync('android.intent.action.VIEW', { data: apk, type: APK_TYPE, flags: GRANT_READ });
  },
};

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'current' }
  | { status: 'available'; release: Release }
  | { status: 'downloading'; release: Release; share: number | null }
  /** The installer was opened; if the user backed out, it can be opened again without downloading. */
  | { status: 'installing'; release: Release }
  | { status: 'failed'; error: string; release?: Release };

/** Checks GitHub for a newer release when asked, and installs it through Android's installer. */
export function useUpdates(updater: Updater) {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const apk = useRef<{ version: string; uri: string } | null>(null);
  const message = (e: unknown) => (e instanceof Error ? e.message : strings().updates.unknownError);

  const check = useCallback(() => {
    setState({ status: 'checking' });
    updater.latest().then(
      (release) => {
        const latest = parseVersion(release.version)!;
        setState(isNewer(latest, releaseVersion(updater.currentVersion)) ? { status: 'available', release } : { status: 'current' });
      },
      (e: unknown) => setState({ status: 'failed', error: message(e) }),
    );
  }, [updater]);

  const install = useCallback(async (release: Release) => {
    try {
      let uri = apk.current?.version === release.version ? apk.current.uri : null;
      if (!uri) {
        setState({ status: 'downloading', release, share: null });
        // whole percents, so the progress doesn't render on every chunk
        let shown: number | null = -1;
        uri = await updater.download(release, (share) => {
          const rounded = share === null ? null : Math.floor(share * 100) / 100;
          if (rounded === shown) return;
          shown = rounded;
          setState({ status: 'downloading', release, share: rounded });
        });
        apk.current = { version: release.version, uri };
      }
      setState({ status: 'installing', release });
      await updater.install(uri);
    } catch (e) {
      setState({ status: 'failed', error: message(e), release });
    }
  }, [updater]);

  return { state, check, install };
}
