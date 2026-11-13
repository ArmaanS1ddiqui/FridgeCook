import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { buildBackup, restoreBackupContent } from './backupService';

// Automatic backups live in a "FridgeCook" folder in the phone's shared storage
// (normally Documents/FridgeCook). Files there are not deleted when the app is
// uninstalled, so a reinstall can find them again and offer to restore.
//
// Android does not let an app create or read a shared folder silently: the user has
// to approve a location once in the system folder picker. After that one tap the app
// creates (or finds) the FridgeCook folder itself and manages the files.

const DIR_KEY = 'auto_backup_dir';
const LAST_KEY = 'auto_backup_last';
const FINGERPRINT_KEY = 'auto_backup_fingerprint';
const ERROR_KEY = 'auto_backup_error';
const PROMPTED_KEY = 'auto_backup_prompted';

export const BACKUP_FOLDER_NAME = 'FridgeCook';
const FILE_PREFIX = 'fridgecook-autobackup-';
const MIN_INTERVAL_MS = 5 * 60 * 1000;

const SAF = FileSystem.StorageAccessFramework;

export const autoBackupSupported = Platform.OS === 'android';

export interface AutoBackupStatus {
  /** A folder has been chosen. */
  enabled: boolean;
  /** A folder was chosen but can no longer be reached (deleted, moved, or permission lost). */
  folderMissing: boolean;
  folder: string | null;
  lastBackup: string | null;
  error: string | null;
}

function decode(uri: string): string {
  try { return decodeURIComponent(uri); } catch { return uri; }
}

/** "content://…/primary%3ADocuments%2FFridgeCook" -> "Documents/FridgeCook" */
function folderLabel(dirUri: string): string {
  const decoded = decode(dirUri);
  const tail = decoded.split('/document/')[1] || decoded.split('/tree/')[1] || decoded;
  const path = tail.includes(':') ? tail.slice(tail.lastIndexOf(':') + 1) : tail;
  return path || 'Phone storage';
}

function isFridgeCookFolder(uri: string): boolean {
  return new RegExp(`[/:]${BACKUP_FOLDER_NAME}$`).test(decode(uri));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Sortable local timestamp: 20261113-153000 */
function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fileStamp(uri: string): string | null {
  const match = /fridgecook-autobackup-(\d{8}-\d{6})/.exec(decode(uri));
  return match ? match[1] : null;
}

function stampToDate(s: string): Date {
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
}

async function listBackups(dir: string): Promise<Array<{ uri: string; stamp: string }>> {
  return (await SAF.readDirectoryAsync(dir))
    .map(uri => ({ uri, stamp: fileStamp(uri) }))
    .filter((f): f is { uri: string; stamp: string } => f.stamp !== null)
    .sort((a, b) => b.stamp.localeCompare(a.stamp));
}

export async function getAutoBackupStatus(): Promise<AutoBackupStatus> {
  const [[, dir], [, last], [, error]] = await AsyncStorage.multiGet([DIR_KEY, LAST_KEY, ERROR_KEY]);
  let folderMissing = false;
  if (dir && autoBackupSupported) {
    try {
      await SAF.readDirectoryAsync(dir);
    } catch {
      folderMissing = true;
    }
  }
  return {
    enabled: !!dir,
    folderMissing,
    folder: dir ? folderLabel(dir) : null,
    lastBackup: last,
    error,
  };
}

/**
 * Open the system folder picker (starting in Documents), then create or find the
 * FridgeCook folder inside whatever the user approves.
 * Returns null if they cancelled; otherwise the newest backup already in the folder, if any.
 */
async function connectBackupFolder(): Promise<{ existing: { uri: string; date: Date } | null } | null> {
  let initial: string | null = null;
  try { initial = SAF.getUriForDirectoryInRoot('Documents'); } catch { /* picker opens at its default */ }
  const permission = await SAF.requestDirectoryPermissionsAsync(initial);
  if (!permission.granted) return null;

  let dir = permission.directoryUri;
  if (!isFridgeCookFolder(dir)) {
    const children = await SAF.readDirectoryAsync(dir);
    const found = children.find(isFridgeCookFolder);
    dir = found || await SAF.makeDirectoryAsync(dir, BACKUP_FOLDER_NAME);
  }

  const backups = await listBackups(dir);
  await AsyncStorage.setItem(DIR_KEY, dir);
  await AsyncStorage.multiRemove([FINGERPRINT_KEY, ERROR_KEY, LAST_KEY]);
  return { existing: backups[0] ? { uri: backups[0].uri, date: stampToDate(backups[0].stamp) } : null };
}

/** Stops automatic backups. Files already saved are left where they are. */
export async function disableAutoBackup(): Promise<void> {
  await AsyncStorage.multiRemove([DIR_KEY, LAST_KEY, FINGERPRINT_KEY, ERROR_KEY]);
  await AsyncStorage.setItem(PROMPTED_KEY, '1');
}

const ask = (title: string, message: string, yes: string, no: string) =>
  new Promise<boolean>(resolve => {
    Alert.alert(title, message, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

/**
 * The whole "connect the FridgeCook folder" conversation: pick a location, find or
 * create the folder, and if this is a fresh install with a backup waiting, offer to restore it.
 * `onRestored` is called after data was restored so screens can reload.
 * Returns true when a folder is connected.
 */
export async function setUpBackupFolder(onRestored?: () => void | Promise<void>): Promise<boolean> {
  if (!autoBackupSupported) return false;
  try {
    const connected = await connectBackupFolder();
    if (!connected) return false;

    const { rowCount } = await buildBackup();
    if (connected.existing && rowCount === 0) {
      const when = connected.existing.date.toLocaleString();
      const restore = await ask(
        'Backup found',
        `Found a FridgeCook backup from ${when}. Restore it now?`,
        'Restore',
        'Not now',
      );
      if (restore) {
        const content = await FileSystem.readAsStringAsync(connected.existing.uri);
        if (await restoreBackupContent(content)) {
          await onRestored?.();
          Alert.alert('Backup restored', 'Your fridge, recipes, history and preferences are back.');
        }
      }
      // With nothing restored the app is still empty, and empty data never overwrites backups.
      return true;
    }

    if (rowCount > 0) {
      const result = await runAutoBackup({ force: true });
      if (result === 'failed') {
        const status = await getAutoBackupStatus();
        Alert.alert('Backup failed', status.error || 'Could not write to that folder.');
        return true;
      }
    }
    Alert.alert(
      'Automatic backup is on',
      `Backups are kept in the ${BACKUP_FOLDER_NAME} folder and refreshed whenever your data changes. The folder stays on your phone if the app is uninstalled.`,
    );
    return true;
  } catch (error: any) {
    Alert.alert('Could not set up the backup folder', `${error?.message || error}\n\nTry choosing Documents.`);
    return false;
  }
}

let promptedThisLaunch = false;

/**
 * Called once when the app opens. On a new install (or a reinstall, which looks the
 * same to the app) it offers to connect the FridgeCook folder; if a connected folder
 * has gone missing it says so.
 */
export async function promptForBackupFolderIfNeeded(onRestored?: () => void | Promise<void>): Promise<void> {
  if (!autoBackupSupported || promptedThisLaunch) return;
  promptedThisLaunch = true;
  const status = await getAutoBackupStatus();

  if (status.enabled && !status.folderMissing) return;

  if (status.enabled && status.folderMissing) {
    const fix = await ask(
      'FridgeCook folder not found',
      'The backup folder was moved, deleted, or is no longer accessible, so automatic backups have stopped.',
      'Find folder',
      'Later',
    );
    if (fix) await setUpBackupFolder(onRestored);
    return;
  }

  if (await AsyncStorage.getItem(PROMPTED_KEY)) return;
  const setUp = await ask(
    'Keep your data safe',
    `FridgeCook can keep a backup in a "${BACKUP_FOLDER_NAME}" folder on your phone. It survives reinstalling the app, and if a backup is already there you can restore it.\n\nAndroid will ask you to approve a location once — just tap "Use this folder" on Documents.`,
    'Set up',
    'Not now',
  );
  await AsyncStorage.setItem(PROMPTED_KEY, '1');
  if (setUp) await setUpBackupFolder(onRestored);
}

let running = false;

export type AutoBackupResult = 'saved' | 'unchanged' | 'skipped' | 'off' | 'failed';

/**
 * Write a backup into the FridgeCook folder if anything changed.
 * Safe to call often: it does nothing when off, when called again within a few
 * minutes, or when the data is identical to the last backup.
 */
export async function runAutoBackup(options: { force?: boolean } = {}): Promise<AutoBackupResult> {
  if (!autoBackupSupported || running) return 'skipped';
  running = true;
  try {
    const [[, dir], [, last], [, lastFingerprint]] = await AsyncStorage.multiGet([DIR_KEY, LAST_KEY, FINGERPRINT_KEY]);
    if (!dir) return 'off';
    if (!options.force && last && Date.now() - new Date(last).getTime() < MIN_INTERVAL_MS) return 'skipped';

    const { json, fingerprint, rowCount } = await buildBackup();
    // Never add an empty backup (a fresh install, or right after everything was deleted).
    if (rowCount === 0) return 'skipped';
    if (!options.force && fingerprint === lastFingerprint) return 'unchanged';

    const now = new Date();
    const fileUri = await SAF.createFileAsync(dir, `${FILE_PREFIX}${stamp(now)}`, 'application/json');
    await FileSystem.writeAsStringAsync(fileUri, json);

    await AsyncStorage.multiSet([[LAST_KEY, now.toISOString()], [FINGERPRINT_KEY, fingerprint]]);
    await AsyncStorage.removeItem(ERROR_KEY);

    // Tidy up: keep the two newest files plus the newest one from an earlier day,
    // so a mistake made today can still be undone from yesterday's copy.
    try {
      const today = stamp(now).slice(0, 8);
      const files = await listBackups(dir);
      const keep = new Set(files.slice(0, 2).map(f => f.uri));
      const earlier = files.find(f => f.stamp.slice(0, 8) < today);
      if (earlier) keep.add(earlier.uri);
      for (const file of files) {
        if (!keep.has(file.uri)) await FileSystem.deleteAsync(file.uri, { idempotent: true });
      }
    } catch {
      // Cleanup is best-effort; the new backup is already saved.
    }
    return 'saved';
  } catch (error: any) {
    const message = String(error?.message || error || '');
    await AsyncStorage.setItem(ERROR_KEY, `Last automatic backup failed: ${message.slice(0, 140)}`);
    return 'failed';
  } finally {
    running = false;
  }
}
