import { useState, useEffect, useCallback, useRef } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  AUDIO_SIZE_IS_KNOWN,
  AUDIO_TOTAL_SIZE_BYTES,
  BUNDLED_DICTIONARY_SEED,
  calculateAudioLibrarySize,
  estimateAudioLibrarySize,
  fetchDictionaryData,
  getGithubAudioArchivePath,
} from "./useDictionary";
import type { DictionaryEntry } from "./useDictionary";
import {
  loadEntries,
  saveEntries,
  loadAudioIndex,
  saveAudioIndex,
  markSetupDone,
  getLastSync,
  setLastSync,
  ensureAudioDir,
  downloadAndSaveAudio,
  getLocalAudioBlobUrl,
  savePendingQueue,
  loadPendingQueue,
  clearPendingQueue,
  getAudioDownloadPaused,
  setAudioDownloadPaused,
  loadAudioUpdateQueue,
  saveAudioUpdateQueue,
} from "./useOfflineStorage";
import {
  discardAudioArchive,
  downloadAudioArchive,
  extractAudioArchive,
  hasAudioArchiveToResume,
} from "./audioArchive";
import type { AudioArchiveDownloadTask } from "./audioArchive";
import {
  findDownloadedAudioUpdates,
  mergeAudioUpdateJobs,
  processAudioUpdateQueue,
} from "./audioUpdateUtils";
import { updateUserInfo } from "./useUserTracking";
import { useAppConfig } from "@/contexts/AppConfigContext";
import type { DictionarySourceConfig } from "./useDictionary";

export interface DownloadProgress {
  phase: "idle" | "data" | "audio" | "paused" | "done" | "error";
  current: number;
  total: number;
  currentWord: string;
  stage?: "archive" | "extract" | "individual";
  overallProgress?: number;
  resumable?: boolean;
  errorMsg?: string;
}

export interface OfflineDictionary {
  entries: DictionaryEntry[];
  isLoading: boolean;
  isSetupDone: boolean;
  isOfflineReady: boolean;
  isOnline: boolean;
  lastSync: Date | null;
  downloadProgress: DownloadProgress;
  audioIndex: Set<string>;
  audioSizeBytes: number;
  audioSizeKnown: boolean;
  startDownload: (opts?: { audioOnly?: boolean; automatic?: boolean }) => Promise<void>;
  cachePlayedAudio: (entry: DictionaryEntry) => Promise<void>;
  sync: () => Promise<{ newCount: number; audioCount: number }>;
  getAudioSource: (entry: DictionaryEntry) => Promise<string | null>;
  refetchOnline: () => Promise<void>;
  skipSetup: () => Promise<void>;
}

const SYNC_INTERVAL_MS = 2 * 60 * 1000;
// Larger checkpoints avoid repeatedly serializing the full audio index/queue during bulk setup.
const AUDIO_CHUNK_SIZE = 256;
const AUDIO_CONCURRENCY = Platform.OS === "android" ? 16 : Platform.OS === "web" ? 8 : 12;
const PROGRESS_THROTTLE_MS = 250;
const ARCHIVE_PROGRESS_FALLBACK_BYTES = 35_000_000;
const EMPTY_PROGRESS: DownloadProgress = {
  phase: "idle",
  current: 0,
  total: 0,
  currentWord: "",
};

function audioIdFor(entry: DictionaryEntry): string {
  return entry.audioId || entry.id;
}

function uniqueAudioEntries(entries: DictionaryEntry[]): DictionaryEntry[] {
  const unique = new Map<string, DictionaryEntry>();
  for (const entry of entries) {
    if (!entry.audioUrl) continue;
    const id = audioIdFor(entry);
    if (!unique.has(id)) unique.set(id, entry);
  }
  return Array.from(unique.values());
}

async function fingerprintEntries(entries: DictionaryEntry[], chunkSize = 500): Promise<string> {
  // Compact dual hash avoids serialization and yields between batches to keep UI interactions responsive.
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const add = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193);
      h2 = Math.imul(h2 ^ code, 0x85ebca6b);
    }
    h1 = Math.imul(h1 ^ 31, 0x01000193);
    h2 = Math.imul(h2 ^ 31, 0x85ebca6b);
  };

  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    const end = Math.min(entries.length, offset + chunkSize);
    for (let index = offset; index < end; index += 1) {
      const entry = entries[index];
      add(entry.coptic);
      add(entry.arabic);
      add(entry.english ?? "");
      add(entry.french ?? "");
      add(entry.german ?? "");
      add(entry.gender ?? "");
      add(entry.origin ?? "");
      add(entry.wordType ?? "");
      add(entry.audioUrl ?? "");
    }
    if (end < entries.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return `${entries.length}:${h1 >>> 0}:${h2 >>> 0}`;
}

const initialEntries: DictionaryEntry[] = BUNDLED_DICTIONARY_SEED; // Desktop: offline first-run snapshot (mobile 1.3.1 starts empty)

async function runConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function downloadAudioBatch(
  batch: DictionaryEntry[],
  initialIndex: Set<string>,
  onProgress: (downloadedCount: number) => void,
  abortRef: { current: boolean }
): Promise<Set<string>> {
  const downloaded = new Set(initialIndex);
  await runConcurrent(batch, AUDIO_CONCURRENCY, async (entry) => {
    if (abortRef.current || !entry.audioUrl) return;
    const id = audioIdFor(entry);
    if (downloaded.has(id)) return;
    const ok = await downloadAndSaveAudio(id, entry.audioUrl);
    if (ok) {
      downloaded.add(id);
      onProgress(downloaded.size);
    }
  });
  return downloaded;
}

export function useOfflineDictionary(): OfflineDictionary {
  const { remoteSettings } = useAppConfig();
  const dictionarySource: DictionarySourceConfig = {
    spreadsheet: remoteSettings.content.dictionarySpreadsheet,
    sheetName: remoteSettings.content.dictionarySheetName,
    columns: {
      coptic: remoteSettings.content.dictionaryColumnCoptic,
      arabic: remoteSettings.content.dictionaryColumnArabic,
      english: remoteSettings.content.dictionaryColumnEnglish,
      french: remoteSettings.content.dictionaryColumnFrench,
      german: remoteSettings.content.dictionaryColumnGerman,
      origin: remoteSettings.content.dictionaryColumnOrigin,
      wordType: remoteSettings.content.dictionaryColumnWordType,
      audio: remoteSettings.content.dictionaryColumnAudio,
      gender: remoteSettings.content.dictionaryColumnGender,
    },
  };
  const dictionarySourceRef = useRef(dictionarySource);
  dictionarySourceRef.current = dictionarySource;
  const sourceSignature = JSON.stringify(dictionarySource);
  const sourceSignatureRef = useRef(sourceSignature);
  // Cached entries are restored from device storage; a fresh install syncs online once.
  const [entries, setEntries] = useState<DictionaryEntry[]>(initialEntries);
  const [isLoading, setIsLoading] = useState(true);
  const [isSetupDoneState, setIsSetupDoneState] = useState(true);
  const [isOfflineReady, setIsOfflineReady] = useState(initialEntries.length > 0);
  const [isOnline, setIsOnline] = useState(false);
  const [lastSync, setLastSyncState] = useState<Date | null>(null);
  const [audioIndex, setAudioIndex] = useState<Set<string>>(new Set());
  const [audioSizeBytes, setAudioSizeBytes] = useState(AUDIO_TOTAL_SIZE_BYTES);
  const [audioSizeKnown, setAudioSizeKnown] = useState(AUDIO_SIZE_IS_KNOWN);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>(EMPTY_PROGRESS);

  const abortRef = useRef(false);
  const downloadingRef = useRef(false);
  const archiveDownloadTaskRef = useRef<AudioArchiveDownloadTask | null>(null);
  const autoUpdatingRef = useRef(false);
  const autoDownloadAttemptedRef = useRef(false);
  const audioSizeRequestRef = useRef(0);
  const entriesRef = useRef<DictionaryEntry[]>(initialEntries);
  // لا تحسب بصمة 16 ألف سجل داخل render؛ useRef يحفظ القيمة لكن وسيطته كانت تُنفّذ كل render.
  const signatureRef = useRef<string | null>(null);
  const audioIndexRef = useRef<Set<string>>(new Set());
  const audioCacheTasksRef = useRef<Map<string, Promise<void>>>(new Map());
  const syncInFlightRef = useRef<Promise<{ newCount: number; audioCount: number }> | null>(null);
  const lastSyncRef = useRef<Date | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<DownloadProgress | null>(null);

  const publishProgress = useCallback((progress: DownloadProgress, immediate = false) => {
    pendingProgressRef.current = progress;
    if (immediate) {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
      pendingProgressRef.current = null;
      setDownloadProgress(progress);
      return;
    }
    if (progressTimerRef.current) return;
    progressTimerRef.current = setTimeout(() => {
      progressTimerRef.current = null;
      const pending = pendingProgressRef.current;
      pendingProgressRef.current = null;
      if (pending) setDownloadProgress(pending);
    }, PROGRESS_THROTTLE_MS);
  }, []);

  const refreshAudioSize = useCallback((sourceEntries: DictionaryEntry[]) => {
    const requestId = ++audioSizeRequestRef.current;
    setAudioSizeBytes(estimateAudioLibrarySize(sourceEntries));
    setAudioSizeKnown(false);
    void calculateAudioLibrarySize(sourceEntries).then((result) => {
      if (requestId !== audioSizeRequestRef.current) return;
      setAudioSizeBytes(result.bytes);
      setAudioSizeKnown(result.known);
    }).catch(() => {
      if (requestId === audioSizeRequestRef.current) setAudioSizeKnown(false);
    });
  }, []);

  const runPendingAudioUpdates = useCallback(async (sourceEntries: DictionaryEntry[] = entriesRef.current) => {
    if (downloadingRef.current || autoUpdatingRef.current) return;
    const initialQueue = await loadAudioUpdateQueue();
    if (initialQueue.length === 0) return;

    autoUpdatingRef.current = true;
    downloadingRef.current = true;
    abortRef.current = false;
    const total = initialQueue.length;
    publishProgress({ phase: "audio", current: 0, total, currentWord: "" }, true);

    try {
      while (!abortRef.current) {
        const result = await processAudioUpdateQueue(sourceEntries, {
          maxItems: 48,
          concurrency: Platform.OS === "android" ? 8 : 6,
          shouldContinue: () => !abortRef.current,
        });
        const pending = await loadAudioUpdateQueue();
        const currentIndex = await loadAudioIndex();
        audioIndexRef.current = currentIndex;
        setAudioIndex(new Set(currentIndex));

        const completed = Math.max(0, total - pending.length);
        if (abortRef.current || result.paused) {
          await setAudioDownloadPaused(true);
          publishProgress({ phase: "paused", current: completed, total, currentWord: "" }, true);
          break;
        }
        if (pending.length === 0) {
          publishProgress({ phase: "done", current: total, total, currentWord: "" }, true);
          break;
        }
        if (result.completed === 0) {
          publishProgress({
            phase: "error",
            current: completed,
            total,
            currentWord: "",
            errorMsg: "Some changed audio files could not be refreshed yet; they will be retried while online.",
          }, true);
          break;
        }
        publishProgress({ phase: "audio", current: completed, total, currentWord: "" }, true);
      }
    } finally {
      downloadingRef.current = false;
      autoUpdatingRef.current = false;
    }
  }, [publishProgress]);

  useEffect(() => {
    entriesRef.current = entries;
    autoDownloadAttemptedRef.current = false;
  }, [entries]);

  useEffect(() => {
    audioIndexRef.current = audioIndex;
  }, [audioIndex]);

  const runSync = useCallback((showProgress: boolean) => {
    if (syncInFlightRef.current) return syncInFlightRef.current;

    if (showProgress) {
      setDownloadProgress((current) => current.phase === "audio" || current.phase === "paused"
        ? current
        : { phase: "data", current: 0, total: 0, currentWord: "" });
    }

    const task = (async () => {
      try {
        const freshEntries = await fetchDictionaryData(dictionarySourceRef.current);
        const nextSignature = await fingerprintEntries(freshEntries);
        const hasChanges = nextSignature !== signatureRef.current;
        let queuedAudioCount = 0;

        // Full replacement handles additions, edits, and deletions in the sheet.
        if (hasChanges) {
          const [downloadedIds, existingAudioQueue] = await Promise.all([
            loadAudioIndex(),
            loadAudioUpdateQueue(),
          ]);
          const newAudioJobs = findDownloadedAudioUpdates(
            entriesRef.current,
            freshEntries,
            downloadedIds,
            existingAudioQueue
          );
          const nextAudioQueue = mergeAudioUpdateJobs(existingAudioQueue, newAudioJobs, freshEntries);
          queuedAudioCount = newAudioJobs.length;
          await saveAudioUpdateQueue(nextAudioQueue);

          entriesRef.current = freshEntries;
          signatureRef.current = nextSignature;
          setEntries(freshEntries);
          setIsOfflineReady(freshEntries.length > 0);
          await saveEntries(freshEntries).catch(() => undefined);
          refreshAudioSize(freshEntries);
        }

        const latestAudioIndex = await loadAudioIndex();
        const audioIndexChanged =
          latestAudioIndex.size !== audioIndexRef.current.size ||
          [...latestAudioIndex].some((id) => !audioIndexRef.current.has(id));
        if (audioIndexChanged) {
          audioIndexRef.current = latestAudioIndex;
          setAudioIndex(latestAudioIndex);
        }

        const syncedAt = new Date();
        lastSyncRef.current = syncedAt;
        setLastSyncState(syncedAt);
        await setLastSync(syncedAt).catch(() => undefined);
        setIsOnline(true);
        void runPendingAudioUpdates(freshEntries).catch(() => undefined);

        if (showProgress) {
          setDownloadProgress((current) => current.phase === "audio" || current.phase === "paused"
            ? current
            : { phase: "done", current: 0, total: 0, currentWord: "" });
        }
        return { newCount: hasChanges ? freshEntries.length : 0, audioCount: queuedAudioCount };
      } catch (error) {
        setIsOnline(false);
        if (showProgress) {
          setDownloadProgress((current) => current.phase === "audio" || current.phase === "paused"
            ? current
            : {
                phase: "error",
                current: 0,
                total: 0,
                currentWord: "",
                errorMsg: error instanceof Error ? error.message : String(error),
              });
        }
        throw error;
      } finally {
        syncInFlightRef.current = null;
      }
    })();

    syncInFlightRef.current = task;
    return task;
  }, [refreshAudioSize, runPendingAudioUpdates]);

  useEffect(() => {
    if (sourceSignatureRef.current === sourceSignature) return;
    sourceSignatureRef.current = sourceSignature;
    if (entriesRef.current.length > 0) void runSync(false).catch(() => undefined);
  }, [sourceSignature, runSync]);

  // Restore the saved dictionary first, then refresh it online in the background.
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const [localEntries, lastSyncDate, localAudioIndex, pendingIds, wasPaused, hasArchiveProgress] = await Promise.all([
        loadEntries(),
        getLastSync(),
        loadAudioIndex(),
        loadPendingQueue(),
        getAudioDownloadPaused(),
        hasAudioArchiveToResume(),
      ]);
      if (cancelled) return;
      setIsLoading(false);

      const activeEntries = localEntries?.length ? localEntries : initialEntries;
      if (localEntries?.length) {
        entriesRef.current = localEntries;
        setEntries(localEntries);
        setIsOfflineReady(true);
        signatureRef.current = await fingerprintEntries(localEntries);
        refreshAudioSize(localEntries);
      } else {
        signatureRef.current = await fingerprintEntries(initialEntries);
      }

      lastSyncRef.current = lastSyncDate;
      setLastSyncState(lastSyncDate);
      const mergedLocalAudioIndex = new Set([...localAudioIndex, ...audioIndexRef.current]);
      audioIndexRef.current = mergedLocalAudioIndex;
      setAudioIndex(mergedLocalAudioIndex);
      setIsSetupDoneState(true);
      void markSetupDone().catch(() => undefined);

      const audioEntries = uniqueAudioEntries(activeEntries);
      const pendingAudioIds = new Set(pendingIds);
      const completedAudioCount = audioEntries.reduce(
        (count, entry) => count + (localAudioIndex.has(audioIdFor(entry)) ? 1 : 0),
        0
      );
      const hasAudioBacklog = completedAudioCount < audioEntries.length;
      const hasPendingAudio = audioEntries.some(
        (entry) => pendingAudioIds.has(audioIdFor(entry)) && !localAudioIndex.has(audioIdFor(entry))
      );
      if (hasPendingAudio) {
        // Preserve only an explicit pause; otherwise let automatic downloads resume.
        setDownloadProgress({
          phase: wasPaused ? "paused" : "audio",
          current: completedAudioCount,
          total: audioEntries.length,
          currentWord: "",
          resumable: hasArchiveProgress || completedAudioCount > 0,
        });
      } else if (activeEntries.length > 0) {
        if (pendingIds.length > 0) await clearPendingQueue();
        if (wasPaused) {
          await setAudioDownloadPaused(false);
        }
      }

      // Avoid refetching and rehashing 16k rows on every launch when the cached sync is still fresh.
      const syncAgeMs = lastSyncDate ? Date.now() - lastSyncDate.getTime() : Number.POSITIVE_INFINITY;
      const needsDictionarySync = !activeEntries.length || !Number.isFinite(syncAgeMs) || syncAgeMs >= SYNC_INTERVAL_MS;
      const audioDownloadHasPriority = activeEntries.length > 0 && hasAudioBacklog;
      if (needsDictionarySync && !audioDownloadHasPriority) {
        void runSync(false).catch(() => undefined);
      }
    };

    void initialize().catch(() => {
      // The automatic sync can still populate the local dictionary when connectivity is available.
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [runSync, refreshAudioSize]);

  // Poll the sheet while active; each successful refresh replaces local data atomically.
  useEffect(() => {
    const refreshIfDue = () => {
      if (downloadingRef.current) return;
      const last = lastSyncRef.current;
      const due = !last || !Number.isFinite(last.getTime()) || Date.now() - last.getTime() >= SYNC_INTERVAL_MS;
      if (due) void runSync(false).catch(() => undefined);
    };

    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        void loadAudioIndex().then((latestAudioIndex) => {
          const changed =
            latestAudioIndex.size !== audioIndexRef.current.size ||
            [...latestAudioIndex].some((id) => !audioIndexRef.current.has(id));
          if (changed) {
            audioIndexRef.current = latestAudioIndex;
            setAudioIndex(latestAudioIndex);
          }
        });
        refreshIfDue();
      }
      else if (state === "background" || state === "inactive") setIsOnline(false);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") refreshIfDue();
    }, 30_000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [runSync]);

  // Calling the same action during a download pauses it. Completed files are checkpointed;
  // calling again after pause skips indexed files and resumes from the first missing one.
  const startDownload = useCallback(async (opts?: { audioOnly?: boolean; automatic?: boolean }) => {
    if (downloadingRef.current) {
      abortRef.current = true;
      const archiveTask = archiveDownloadTaskRef.current;
      if (archiveTask) await archiveTask.pauseAsync().catch(() => undefined);
      await setAudioDownloadPaused(true);
      while (downloadingRef.current) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    if (entriesRef.current.length === 0) {
      try {
        await runSync(true);
      } catch {
        // The progress state below reports that an online dictionary sync is required.
      }
      if (entriesRef.current.length === 0) {
        publishProgress({
          phase: "error",
          current: 0,
          total: 0,
          currentWord: "",
          errorMsg: "Connect to the internet once to download the dictionary for offline use.",
        }, true);
        return;
      }
    }

    downloadingRef.current = true;
    abortRef.current = false;
    await Promise.all([...audioCacheTasksRef.current.values()]);
    await setAudioDownloadPaused(false);

    try {
      const allAudio = uniqueAudioEntries(entriesRef.current);
      const allAudioIds = new Set(allAudio.map(audioIdFor));
      let currentIndex = new Set(
        [...await loadAudioIndex()].filter((id) => allAudioIds.has(id))
      );
      await saveAudioIndex(currentIndex);
      const missing = allAudio.filter((entry) => !currentIndex.has(audioIdFor(entry)));
      const total = allAudio.length;
      const completedAtStart = total - missing.length;

      await savePendingQueue(missing.map(audioIdFor));
      await ensureAudioDir();
      publishProgress({
        phase: "audio",
        current: completedAtStart,
        total,
        currentWord: "",
      }, true);

      let archiveFailureMessage: string | null = null;
      // Restore the original per-audio-file download flow; never fetch the whole archive.
      const canUseArchive = false;
      if (canUseArchive && missing.length > 0) {
        const archiveWeight = missing.length * 0.45;
        try {
          publishProgress({
            phase: "audio",
            current: currentIndex.size,
            total,
            currentWord: "",
            stage: "archive",
            overallProgress: total > 0 ? currentIndex.size / total : 0,
          }, true);

          const archive = await downloadAudioArchive({
            shouldContinue: () => !abortRef.current,
            onTask: (task) => { archiveDownloadTaskRef.current = task; },
            onProgress: (bytesWritten, expectedBytes) => {
              const progressTotal = expectedBytes > 0 ? expectedBytes : ARCHIVE_PROGRESS_FALLBACK_BYTES;
              const fraction = Math.max(0, Math.min(1, bytesWritten / progressTotal));
              const overallProgress = total > 0
                ? Math.min(1, (completedAtStart + archiveWeight * fraction) / total)
                : 0;
              publishProgress({
                phase: "audio",
                current: currentIndex.size,
                total,
                currentWord: "",
                stage: "archive",
                overallProgress,
                resumable: true,
              });
            },
          });

          if (archive.paused) {
            const remaining = allAudio.filter((entry) => !currentIndex.has(audioIdFor(entry)));
            await saveAudioIndex(currentIndex);
            await savePendingQueue(remaining.map(audioIdFor));
            audioIndexRef.current = new Set(currentIndex);
            setAudioIndex(new Set(currentIndex));
            await setAudioDownloadPaused(true);
            publishProgress({
              phase: "paused",
              current: currentIndex.size,
              total,
              currentWord: "",
              resumable: (await hasAudioArchiveToResume()) || currentIndex.size > 0,
            }, true);
            return;
          }

          if (archive.path) {
            publishProgress({
              phase: "audio",
              current: currentIndex.size,
              total,
              currentWord: "",
              stage: "extract",
              overallProgress: total > 0 ? Math.min(1, (completedAtStart + archiveWeight) / total) : 0,
            }, true);

            const extraction = await extractAudioArchive(
              archive.path,
              missing.map((entry) => ({ audioId: audioIdFor(entry), audioUrl: entry.audioUrl! })),
              {
                shouldContinue: () => !abortRef.current,
                onAudioSaved: async (audioId) => {
                  currentIndex.add(audioId);
                  const newlySaved = Math.max(0, currentIndex.size - completedAtStart);
                  const extractionFraction = missing.length > 0 ? Math.min(1, newlySaved / missing.length) : 1;
                  const overallProgress = total > 0
                    ? Math.min(1, (completedAtStart + archiveWeight + (missing.length - archiveWeight) * extractionFraction) / total)
                    : 1;
                  publishProgress({
                    phase: "audio",
                    current: currentIndex.size,
                    total,
                    currentWord: "",
                    stage: "extract",
                    overallProgress,
                  });
                  if (currentIndex.size % AUDIO_CHUNK_SIZE === 0) {
                    await saveAudioIndex(currentIndex);
                    audioIndexRef.current = new Set(currentIndex);
                    setAudioIndex(new Set(currentIndex));
                  }
                },
              }
            );

            if (
              extraction.savedAudioIds.size === 0 &&
              missing.some((entry) => !!entry.audioUrl && !!getGithubAudioArchivePath(entry.audioUrl))
            ) {
              throw new Error("لم يعثر الأرشيف على ملفات تطابق روابط الصوت في الشيت.");
            }

            if (extraction.paused) {
              const remaining = allAudio.filter((entry) => !currentIndex.has(audioIdFor(entry)));
              await saveAudioIndex(currentIndex);
              await savePendingQueue(remaining.map(audioIdFor));
              audioIndexRef.current = new Set(currentIndex);
              setAudioIndex(new Set(currentIndex));
              await setAudioDownloadPaused(true);
              publishProgress({
                phase: "paused",
                current: currentIndex.size,
                total,
                currentWord: "",
                resumable: (await hasAudioArchiveToResume()) || currentIndex.size > 0,
              }, true);
              return;
            }

            await saveAudioIndex(currentIndex);
            audioIndexRef.current = new Set(currentIndex);
            setAudioIndex(new Set(currentIndex));
            await discardAudioArchive();
          }
        } catch (error) {
          archiveFailureMessage = error instanceof Error ? error.message : String(error);
          console.warn("Audio archive download/extraction failed", error);
          await saveAudioIndex(currentIndex).catch(() => undefined);
          audioIndexRef.current = new Set(currentIndex);
          setAudioIndex(new Set(currentIndex));
          await discardAudioArchive().catch(() => undefined);
        }
      }

      if (archiveFailureMessage && currentIndex.size === completedAtStart) {
        const remaining = allAudio.filter((entry) => !currentIndex.has(audioIdFor(entry)));
        await saveAudioIndex(currentIndex);
        await savePendingQueue(remaining.map(audioIdFor));
        await setAudioDownloadPaused(true);
        publishProgress({
          phase: "error",
          current: currentIndex.size,
          total,
          currentWord: "",
          stage: "archive",
          errorMsg: `تعذر تنزيل حزمة الصوتيات: ${archiveFailureMessage}`,
        }, true);
        return;
      }

      const remainingBeforeIndividual = allAudio.filter((entry) => !currentIndex.has(audioIdFor(entry)));
      for (let offset = 0; offset < remainingBeforeIndividual.length; offset += AUDIO_CHUNK_SIZE) {
        if (abortRef.current) break;
        const chunk = remainingBeforeIndividual.slice(offset, offset + AUDIO_CHUNK_SIZE);
        currentIndex = await downloadAudioBatch(
          chunk,
          currentIndex,
          (downloadedCount) => {
            publishProgress({
              phase: "audio",
              current: Math.min(total, downloadedCount),
              total,
              currentWord: "",
              stage: "individual",
              overallProgress: total > 0 ? Math.min(1, downloadedCount / total) : 0,
            });
          },
          abortRef
        );

        // Checkpoint after every small group: process termination will not restart the set.
        await saveAudioIndex(currentIndex);
        audioIndexRef.current = new Set(currentIndex);
        setAudioIndex(new Set(currentIndex));
        publishProgress({ phase: "audio", current: Math.min(total, currentIndex.size), total, currentWord: "" }, true);
        if (abortRef.current) break;
      }

      const remaining = allAudio.filter((entry) => !currentIndex.has(audioIdFor(entry)));
      await savePendingQueue(remaining.map(audioIdFor));

      if (abortRef.current && remaining.length > 0) {
        await setAudioDownloadPaused(true);
        publishProgress({
          phase: "paused",
          current: total - remaining.length,
          total,
          currentWord: "",
        }, true);
        return;
      }

      if (remaining.length > 0) {
        // Keep failed URLs in the persisted queue so the user can retry without redownloading successes.
        if (opts?.automatic) {
          await setAudioDownloadPaused(false);
          autoDownloadAttemptedRef.current = false;
          publishProgress({
            phase: "error",
            current: total - remaining.length,
            total,
            currentWord: "",
            errorMsg: `${remaining.length} audio files remain; background retry is queued.`,
          }, true);
        } else {
          await setAudioDownloadPaused(true);
          publishProgress({
            phase: "paused",
            current: total - remaining.length,
            total,
            currentWord: "",
            errorMsg: `${remaining.length} audio files remain and can be retried.`,
          }, true);
        }
        return;
      }

      await clearPendingQueue();
      await setAudioDownloadPaused(false);
      if (!opts?.audioOnly) {
        await markSetupDone();
        setIsSetupDoneState(true);
        updateUserInfo({ offlineSynced: true }).catch(() => undefined);
      }
      setIsOfflineReady(true);
      publishProgress({ phase: "done", current: total, total, currentWord: "" }, true);
    } catch (error) {
      if (opts?.automatic) {
        await setAudioDownloadPaused(false).catch(() => undefined);
        autoDownloadAttemptedRef.current = false;
      }
      publishProgress({
        phase: "error",
        current: 0,
        total: 0,
        currentWord: "",
        errorMsg: error instanceof Error ? error.message : String(error),
      }, true);
    } finally {
      downloadingRef.current = false;
    }
    if (!abortRef.current) void runPendingAudioUpdates(entriesRef.current).catch(() => undefined);
  }, [publishProgress, runPendingAudioUpdates, runSync]);

  const startAutomaticAudioDownload = useCallback(async () => {
    if (entries.length === 0 || entriesRef.current.length === 0 || downloadingRef.current || autoDownloadAttemptedRef.current) return;

    const network = await NetInfo.fetch().catch(() => null);
    if (network?.isConnected !== true || network.isInternetReachable === false) return;

    const allAudio = uniqueAudioEntries(entriesRef.current);
    if (allAudio.length === 0) {
      autoDownloadAttemptedRef.current = true;
      return;
    }

    const [wasPaused, storedIndex] = await Promise.all([getAudioDownloadPaused(), loadAudioIndex()]);
    const currentIndex = new Set(storedIndex);
    audioIndexRef.current = currentIndex;
    setAudioIndex(new Set(currentIndex));
    const completed = allAudio.reduce((count, entry) => count + (currentIndex.has(audioIdFor(entry)) ? 1 : 0), 0);
    const missingCount = allAudio.length - completed;

    if (missingCount === 0) {
      autoDownloadAttemptedRef.current = true;
      return;
    }
    if (wasPaused) {
      autoDownloadAttemptedRef.current = true;
      setDownloadProgress({ phase: "paused", current: completed, total: allAudio.length, currentWord: "" });
      return;
    }

    autoDownloadAttemptedRef.current = true;
    await startDownload({ automatic: true });
  }, [entries, startDownload]);

  useEffect(() => {
    let active = true;
    const tryStart = () => {
      if (active) void startAutomaticAudioDownload().catch(() => {
        autoDownloadAttemptedRef.current = false;
      });
    };
    tryStart();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected === true && state.isInternetReachable !== false) tryStart();
    });
    const retryInterval = setInterval(() => {
      if (!autoDownloadAttemptedRef.current) tryStart();
    }, 60_000);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(retryInterval);
    };
  }, [startAutomaticAudioDownload]);

  const sync = useCallback(() => runSync(true), [runSync]);

  const cachePlayedAudio = useCallback(async (entry: DictionaryEntry): Promise<void> => {
    if (!entry.audioUrl) return;
    const audioId = audioIdFor(entry);
    if (audioIndexRef.current.has(audioId) || downloadingRef.current) return;

    const existingTask = audioCacheTasksRef.current.get(audioId);
    if (existingTask) return existingTask;

    const task = (async () => {
      const storedIndex = await loadAudioIndex();
      for (const cachedId of audioIndexRef.current) storedIndex.add(cachedId);
      if (storedIndex.has(audioId)) {
        audioIndexRef.current = storedIndex;
        setAudioIndex(new Set(storedIndex));
        return;
      }
      if (downloadingRef.current) return;

      const saved = await downloadAndSaveAudio(audioId, entry.audioUrl!);
      if (!saved) return;

      const nextIndex = new Set([...storedIndex, ...audioIndexRef.current, audioId]);
      await saveAudioIndex(nextIndex);
      audioIndexRef.current = nextIndex;
      setAudioIndex(new Set(nextIndex));
    })()
      .catch(() => undefined)
      .finally(() => audioCacheTasksRef.current.delete(audioId));

    audioCacheTasksRef.current.set(audioId, task);
    return task;
  }, []);

  const getAudioSource = useCallback(async (entry: DictionaryEntry): Promise<string | null> => {
    if (!entry.audioUrl) return null;
    const audioId = audioIdFor(entry);
    const local = await getLocalAudioBlobUrl(audioId).catch(() => null);
    if (local) return local;
    if (entry.id !== audioId) {
      const legacyLocal = await getLocalAudioBlobUrl(entry.id).catch(() => null);
      if (legacyLocal) return legacyLocal;
    }
    return entry.audioUrl;
  }, []);

  const refetchOnline = useCallback(async () => {
    try {
      await runSync(true);
    } catch {
      // Keep the local dictionary on network errors.
    }
  }, [runSync]);

  const skipSetup = useCallback(async () => {
    await markSetupDone().catch(() => undefined);
    setIsSetupDoneState(true);
  }, []);

  return {
    entries,
    isLoading,
    isSetupDone: isSetupDoneState,
    isOfflineReady,
    isOnline,
    lastSync,
    downloadProgress,
    audioIndex,
    audioSizeBytes,
    audioSizeKnown,
    startDownload,
    cachePlayedAudio,
    sync,
    getAudioSource,
    refetchOnline,
    skipSetup,
  };
}
