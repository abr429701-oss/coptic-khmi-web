import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { getGithubAudioArchivePath } from "./useDictionary";
import { saveAudioBytes } from "./useOfflineStorage";

const AUDIO_ARCHIVE_URL =
  "https://codeload.github.com/abr429701-oss/coptic-dictionary-bot/zip/refs/heads/audio";
const AUDIO_ARCHIVE_FILENAME = "coptic-audio-archive.zip";
const AUDIO_ARCHIVE_RESUME_KEY = "@coptic/audio_archive_resume_v1";
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_ZIP_COMMENT_BYTES = 65_557;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export type AudioArchiveDownloadTask = FileSystem.DownloadResumable;

export interface AudioArchiveDownloadResult {
  path: string | null;
  paused: boolean;
  downloaded: boolean;
}

export interface AudioArchiveEntry {
  audioId: string;
  audioUrl: string;
}

export interface AudioArchiveExtractionResult {
  savedAudioIds: Set<string>;
  paused: boolean;
}

function getArchivePath(): string {
  if (!FileSystem.documentDirectory) throw new Error("مساحة تخزين التطبيق غير متاحة");
  return `${FileSystem.documentDirectory}${AUDIO_ARCHIVE_FILENAME}`;
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, "");
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outputIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const digit = BASE64_ALPHABET.indexOf(clean[index]);
    if (digit < 0) continue;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outputIndex] = (buffer >> bits) & 0xff;
      outputIndex += 1;
    }
  }
  return output.subarray(0, outputIndex);
}

async function isCompleteZip(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    const size = info.exists ? Number((info as { size?: number }).size) || 0 : 0;
    if (size < 22) return false;

    const head = base64ToBytes(await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    }));
    if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
      return false;
    }

    const tailLength = Math.min(size, MAX_ZIP_COMMENT_BYTES);
    const tail = base64ToBytes(await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
      position: size - tailLength,
      length: tailLength,
    }));
    for (let index = 0; index <= tail.length - 4; index += 1) {
      if (tail[index] === 0x50 && tail[index + 1] === 0x4b && tail[index + 2] === 0x05 && tail[index + 3] === 0x06) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function hasAudioArchiveToResume(): Promise<boolean> {
  if (!FileSystem.documentDirectory) return false;
  const resumeJson = await AsyncStorage.getItem(AUDIO_ARCHIVE_RESUME_KEY).catch(() => null);
  if (resumeJson) {
    try {
      const saved = JSON.parse(resumeJson) as { resumeData?: unknown };
      if (typeof saved.resumeData === "string" && saved.resumeData.length > 0) {
        const info = await FileSystem.getInfoAsync(getArchivePath()).catch(() => null);
        if (info?.exists && (Number((info as { size?: number }).size) || 0) > 0) return true;
      }
    } catch {
      await AsyncStorage.removeItem(AUDIO_ARCHIVE_RESUME_KEY).catch(() => undefined);
    }
  }
  return isCompleteZip(getArchivePath());
}

export async function downloadAudioArchive(options: {
  shouldContinue: () => boolean;
  onTask: (task: AudioArchiveDownloadTask | null) => void;
  onProgress: (bytesWritten: number, totalBytes: number) => void;
}): Promise<AudioArchiveDownloadResult> {
  if (!options.shouldContinue()) return { path: null, paused: true, downloaded: false };
  const path = getArchivePath();
  if (await isCompleteZip(path)) {
    await AsyncStorage.removeItem(AUDIO_ARCHIVE_RESUME_KEY).catch(() => undefined);
    return { path, paused: false, downloaded: false };
  }

  let resumeData: string | undefined;
  const resumeJson = await AsyncStorage.getItem(AUDIO_ARCHIVE_RESUME_KEY).catch(() => null);
  if (resumeJson) {
    try {
      const saved = JSON.parse(resumeJson) as { resumeData?: unknown };
      if (typeof saved.resumeData === "string") resumeData = saved.resumeData;
    } catch {
      await AsyncStorage.removeItem(AUDIO_ARCHIVE_RESUME_KEY).catch(() => undefined);
    }
  }
  if (!resumeData) await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);

  const task = FileSystem.createDownloadResumable(
    AUDIO_ARCHIVE_URL,
    path,
    {},
    (progress) => options.onProgress(progress.totalBytesWritten, progress.totalBytesExpectedToWrite),
    resumeData
  );
  options.onTask(task);

  try {
    const result = resumeData ? await task.resumeAsync() : await task.downloadAsync();
    if (!result) {
      if (options.shouldContinue()) throw new Error("لم يكتمل تنزيل حزمة الصوتيات");
      await AsyncStorage.setItem(AUDIO_ARCHIVE_RESUME_KEY, JSON.stringify(task.savable())).catch(() => undefined);
      return { path: null, paused: true, downloaded: false };
    }
    if (result.status !== 200 || !(await isCompleteZip(path))) {
      throw new Error(`تعذر التحقق من حزمة الصوتيات (${result.status})`);
    }
    await AsyncStorage.removeItem(AUDIO_ARCHIVE_RESUME_KEY).catch(() => undefined);
    return { path, paused: false, downloaded: true };
  } catch (error) {
    if (!options.shouldContinue()) {
      const state = task.savable() as { resumeData?: string };
      if (state.resumeData) {
        await AsyncStorage.setItem(AUDIO_ARCHIVE_RESUME_KEY, JSON.stringify(state)).catch(() => undefined);
      }
      return { path: null, paused: true, downloaded: false };
    }
    await AsyncStorage.removeItem(AUDIO_ARCHIVE_RESUME_KEY).catch(() => undefined);
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    throw error;
  } finally {
    options.onTask(null);
  }
}

export async function discardAudioArchive(): Promise<void> {
  if (FileSystem.documentDirectory) {
    await FileSystem.deleteAsync(getArchivePath(), { idempotent: true }).catch(() => undefined);
  }
  await AsyncStorage.removeItem(AUDIO_ARCHIVE_RESUME_KEY).catch(() => undefined);
}

function stripArchiveRoot(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/").replace(/^\.\//, "");
  const firstSlash = normalized.indexOf("/");
  return firstSlash >= 0 ? normalized.slice(firstSlash + 1) : normalized;
}

function concatenateChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function extractAudioArchive(
  archivePath: string,
  entries: AudioArchiveEntry[],
  options: {
    shouldContinue: () => boolean;
    onAudioSaved: (audioId: string) => Promise<void>;
  }
): Promise<AudioArchiveExtractionResult> {
  if (!(await isCompleteZip(archivePath))) throw new Error("حزمة الصوتيات غير مكتملة");

  const idsByPath = new Map<string, string[]>();
  for (const entry of entries) {
    const archiveRelativePath = getGithubAudioArchivePath(entry.audioUrl);
    if (!archiveRelativePath) continue;
    const current = idsByPath.get(archiveRelativePath) ?? [];
    current.push(entry.audioId);
    idsByPath.set(archiveRelativePath, current);
  }

  const savedAudioIds = new Set<string>();
  if (idsByPath.size === 0) return { savedAudioIds, paused: false };

  const info = await FileSystem.getInfoAsync(archivePath);
  const archiveSize = Number((info as { size?: number }).size) || 0;
  let writeQueue = Promise.resolve();
  let queuedFiles = 0;
  let extractionError: Error | null = null;

  const unzip = new Unzip((file) => {
    if (!file.name || file.name.endsWith("/")) return;
    const relativePath = stripArchiveRoot(file.name);
    const audioIds = idsByPath.get(relativePath);
    if (!audioIds) return;

    const chunks: Uint8Array[] = [];
    let outputLength = 0;
    file.ondata = (error, data, final) => {
      if (error) {
        extractionError = error;
        return;
      }
      if (data?.length) {
        chunks.push(data);
        outputLength += data.length;
      }
      if (!final) return;

      const bytes = concatenateChunks(chunks, outputLength);
      writeQueue = writeQueue.then(async () => {
        if (!options.shouldContinue()) return;
        for (const audioId of audioIds) {
          if (!options.shouldContinue()) return;
          if (await saveAudioBytes(audioId, bytes)) {
            savedAudioIds.add(audioId);
            await options.onAudioSaved(audioId);
          }
        }
      });
      queuedFiles += 1;
    };

    try {
      file.start();
    } catch (error) {
      extractionError = error instanceof Error ? error : new Error(String(error));
    }
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  for (let position = 0; position < archiveSize; position += READ_CHUNK_BYTES) {
    if (!options.shouldContinue()) {
      await writeQueue;
      return { savedAudioIds, paused: true };
    }
    const length = Math.min(READ_CHUNK_BYTES, archiveSize - position);
    const base64 = await FileSystem.readAsStringAsync(archivePath, {
      encoding: FileSystem.EncodingType.Base64,
      position,
      length,
    });
    const chunk = base64ToBytes(base64);
    if (chunk.length !== length) throw new Error("تعذر قراءة حزمة الصوتيات كاملة");
    unzip.push(chunk, position + length >= archiveSize);
    if (extractionError) throw extractionError;
    if (queuedFiles > 0) {
      await writeQueue;
      queuedFiles = 0;
    }
    if (extractionError) throw extractionError;
    if (!options.shouldContinue()) return { savedAudioIds, paused: true };
  }

  await writeQueue;
  if (extractionError) throw extractionError;
  return { savedAudioIds, paused: false };
}
