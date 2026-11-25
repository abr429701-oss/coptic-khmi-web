import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type { DictionaryEntry } from "./useDictionary";
import { INTERNAL_AUDIO_DIR } from "@/contexts/StorageContext";



// ─── Constants ─────────────────────────────────────────────────────────

const KEYS = {
  ENTRIES: "@coptic/entries_v7",
  AUDIO_INDEX: "@coptic/audio_index_v6",
  LAST_SYNC: "@coptic/last_sync_v4",
  SETUP_DONE: "@coptic/setup_done_v4",
  PENDING_QUEUE: "@coptic/pending_audio_queue_v4",
  AUDIO_PAUSED: "@coptic/audio_download_paused_v2",
  AUTO_AUDIO_UPDATES: "@coptic/auto_audio_updates_v1",
};

export interface AudioUpdateJob {
  audioId: string;
  audioUrl: string;
  oldAudioIds: string[];
}


const AUDIO_CACHE_NAME = "coptic-audio-v4";
const ENTRIES_JSON_FILENAME = "coptic-dictionary-v7.json";

/** المسار الداخلي للملفات الصوتية */
const AUDIO_DIR = INTERNAL_AUDIO_DIR;

// ─── AsyncStorage helpers ────────────────────────────────────────────

function getEntriesJsonPath(): string | null {
  if (Platform.OS === "web" || !FileSystem.documentDirectory) return null;
  return `${FileSystem.documentDirectory}${ENTRIES_JSON_FILENAME}`;
}

export async function loadEntries(): Promise<DictionaryEntry[] | null> {
  const filePath = getEntriesJsonPath();
  if (filePath) {
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(filePath);
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fall back to AsyncStorage if the cache file is corrupt.
    }
  }

  try {
    const json = await AsyncStorage.getItem(KEYS.ENTRIES);
    if (!json) return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function stringifyEntriesInChunks(entries: DictionaryEntry[], chunkSize = 400): Promise<string> {
  const chunks: string[] = [];
  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    const chunk = entries.slice(offset, offset + chunkSize).map((entry) => JSON.stringify(entry)).join(",");
    chunks.push(chunk);
    if (offset + chunkSize < entries.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return `[${chunks.join(",")}]`;
}

export async function saveEntries(entries: DictionaryEntry[]): Promise<void> {
  const json = await stringifyEntriesInChunks(entries);
  const filePath = getEntriesJsonPath();
  if (filePath) {
    try {
      await FileSystem.writeAsStringAsync(filePath, json);
      await AsyncStorage.removeItem(KEYS.ENTRIES).catch(() => undefined);
      return;
    } catch {
      // AsyncStorage is the fallback if the device file cannot be written.
    }
  }
  await AsyncStorage.setItem(KEYS.ENTRIES, json);
}

export async function clearEntries(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.ENTRIES).catch(() => undefined);
  const filePath = getEntriesJsonPath();
  if (filePath) {
    await FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => undefined);
  }
}

export async function loadAudioIndex(): Promise<Set<string>> {
  try {
    const json = await AsyncStorage.getItem(KEYS.AUDIO_INDEX);
    if (!json) return new Set();
    return new Set(JSON.parse(json) as string[]);
  } catch {
    return new Set();
  }
}

export async function saveAudioIndex(index: Set<string>): Promise<void> {
  await AsyncStorage.setItem(KEYS.AUDIO_INDEX, JSON.stringify([...index]));
}

export async function getIsSetupDone(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEYS.SETUP_DONE);
    return v === "true";
  } catch {
    return false;
  }
}

export async function markSetupDone(): Promise<void> {
  await AsyncStorage.setItem(KEYS.SETUP_DONE, "true");
}

export async function getLastSync(): Promise<Date | null> {
  try {
    const v = await AsyncStorage.getItem(KEYS.LAST_SYNC);
    if (!v) return null;
    return new Date(v);
  } catch {
    return null;
  }
}

export async function setLastSync(date: Date): Promise<void> {
  await AsyncStorage.setItem(KEYS.LAST_SYNC, date.toISOString());
}

export async function getAudioDownloadPaused(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEYS.AUDIO_PAUSED)) === "true";
  } catch {
    return false;
  }
}

export async function setAudioDownloadPaused(paused: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.AUDIO_PAUSED, paused ? "true" : "false");
  } catch { }
}

// ─── Pending Queue (يصمد بعد إغلاق التطبيق) ──────────────────────────

/**
 * احفظ قائمة الـ IDs المتبقية للتنزيل.
 * لما التطبيق يفتح تاني أو background task يشتغل → يكمل من نفس النقطة.
 */
export async function savePendingQueue(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.PENDING_QUEUE, JSON.stringify(ids));
  } catch { }
}

export async function loadPendingQueue(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(KEYS.PENDING_QUEUE);
    if (!json) return [];
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

export async function clearPendingQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.PENDING_QUEUE);
  } catch { }
}

export async function loadAudioUpdateQueue(): Promise<AudioUpdateJob[]> {
  try {
    const json = await AsyncStorage.getItem(KEYS.AUTO_AUDIO_UPDATES);
    if (!json) return [];
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((job): job is AudioUpdateJob =>
      !!job && typeof job.audioId === "string" && typeof job.audioUrl === "string" &&
      Array.isArray(job.oldAudioIds) && job.oldAudioIds.every((id: unknown) => typeof id === "string")
    );
  } catch {
    return [];
  }
}

export async function saveAudioUpdateQueue(jobs: AudioUpdateJob[]): Promise<void> {
  if (jobs.length === 0) await AsyncStorage.removeItem(KEYS.AUTO_AUDIO_UPDATES);
  else await AsyncStorage.setItem(KEYS.AUTO_AUDIO_UPDATES, JSON.stringify(jobs));
}

// ─── Audio directory ──────────────────────────────────────────────────


export function getAudioLocalPath(entryId: string): string {
  return `${AUDIO_DIR}${entryId}.mp3`;
}

export async function ensureAudioDir(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const info = await FileSystem.getInfoAsync(AUDIO_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
    }
  } catch {
    try {
      await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
    } catch { }
  }
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    output += BASE64_ALPHABET[first >> 2];
    output += BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)];
    output += hasSecond ? BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)] : "=";
    output += hasThird ? BASE64_ALPHABET[third & 63] : "=";
  }
  return output;
}

export async function saveAudioBytes(entryId: string, bytes: Uint8Array): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const destination = getAudioLocalPath(entryId);
  const temporaryPath = `${destination}.archive-tmp`;
  try {
    await ensureAudioDir();
    if (await isValidMp3(destination)) return true;
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true });
    await FileSystem.writeAsStringAsync(temporaryPath, bytesToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!(await isValidMp3(temporaryPath))) {
      await FileSystem.deleteAsync(temporaryPath, { idempotent: true });
      return false;
    }
    await FileSystem.deleteAsync(destination, { idempotent: true });
    await FileSystem.moveAsync({ from: temporaryPath, to: destination });
    return true;
  } catch {
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true }).catch(() => undefined);
    return false;
  }
}

export async function isAudioFileExists(entryId?: string): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      if (!("caches" in window)) return false;
      const cache = await caches.open(AUDIO_CACHE_NAME);
      if (entryId) {
        const match = await cache.match(`audio-${entryId}`);
        return !!match;
      }
      const keys = await cache.keys();
      return keys.length > 0;
    } catch {
      return false;
    }
  }
  if (entryId) {
    const info = await FileSystem.getInfoAsync(getAudioLocalPath(entryId));
    return info.exists;
  }
  const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
  return dirInfo.exists;
}

// ─── Google Drive: حل الـ redirect واستخراج رابط مباشر ──────────────

function buildDriveDirectUrl(url: string): string {
  const fileIdMatch =
    url.match(/drive\.google\.com\/file\/d\/([^\/\?&]+)/) ||
    url.match(/[?&]id=([^&]+)/);

  if (!fileIdMatch) return url;
  const fileId = fileIdMatch[1];
  return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
}

async function isValidMp3(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return false;
    const size = (info as any).size ?? 0;
    if (size < 128) return false;

    const textHead = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
      length: 64,
      position: 0,
    }).catch(() => "");

    if (
      textHead.includes("<!DOCTYPE") ||
      textHead.includes("<html") ||
      textHead.includes("Google") ||
      textHead.includes("confirm")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Individual Download (مع إصلاح Google Drive) ──────────────────────

export async function downloadAndSaveAudio(
  entryId: string,
  audioUrl: string
): Promise<boolean> {
  try {
    if (Platform.OS === "web") return await _saveAudioWeb(entryId, audioUrl);
    return await _saveAudioNative(entryId, audioUrl);
  } catch {
    return false;
  }
}

async function _saveAudioWeb(entryId: string, url: string): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return false;
    const ct = response.headers.get("content-type") || "";
    if (ct.includes("text/html")) return false;
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.put(`audio-${entryId}`, response.clone());
    return true;
  } catch {
    return false;
  }
}

async function _saveAudioNative(entryId: string, audioUrl: string): Promise<boolean> {
  try {
    await ensureAudioDir();
    const dest = getAudioLocalPath(entryId);

    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists) {
      const valid = await isValidMp3(dest);
      if (valid) return true;
      await FileSystem.deleteAsync(dest, { idempotent: true });
    }

    const downloadUrl = audioUrl.includes("drive.google.com")
      ? buildDriveDirectUrl(audioUrl)
      : audioUrl;

    // timeout أسرع: 10 ثانية لكل ملف فردي
    const downloadPromise = FileSystem.downloadAsync(downloadUrl, dest);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 10_000)
    );

    const result = await Promise.race([downloadPromise, timeoutPromise]) as FileSystem.FileSystemDownloadResult;

    if (result.status !== 200) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      return false;
    }

    const valid = await isValidMp3(dest);
    if (!valid) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      return false;
    }

    return true;
  } catch {
    try {
      await FileSystem.deleteAsync(getAudioLocalPath(entryId), { idempotent: true });
    } catch { }
    return false;
  }
}

// ─── Get local audio URL/path ─────────────────────────────────────────

export async function getLocalAudioBlobUrl(entryId: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      if (!("caches" in window)) return null;
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const match = await cache.match(`audio-${entryId}`);
      if (!match) return null;
      const blob = await match.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  const filePath = getAudioLocalPath(entryId);
  const info = await FileSystem.getInfoAsync(filePath);
  if (info.exists) return filePath;
  return null;
}

export async function deleteAudioById(entryId: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if ("caches" in window) {
        const cache = await caches.open(AUDIO_CACHE_NAME);
        await cache.delete(`audio-${entryId}`);
      }
    } catch { }
    return;
  }
  try {
    await FileSystem.deleteAsync(getAudioLocalPath(entryId), { idempotent: true });
  } catch { }
}

// ─── Delete all audio ─────────────────────────────────────────────────

export async function deleteAllAudio(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if ("caches" in window) await caches.delete(AUDIO_CACHE_NAME);
    } catch { }
    return;
  }
  try {
    await FileSystem.deleteAsync(AUDIO_DIR, { idempotent: true });
  } catch { }
}
