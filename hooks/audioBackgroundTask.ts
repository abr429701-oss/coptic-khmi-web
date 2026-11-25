import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import { Platform } from "react-native";
import { fetchDictionaryData } from "./useDictionary";
import {
  loadEntries,
  saveEntries,
  loadAudioIndex,
  saveAudioIndex,
  ensureAudioDir,
  downloadAndSaveAudio,
  loadPendingQueue,
  savePendingQueue,
  clearPendingQueue,
  getAudioDownloadPaused,
  loadAudioUpdateQueue,
  saveAudioUpdateQueue,
  setLastSync,
} from "./useOfflineStorage";
import {
  dictionariesEqual,
  findDownloadedAudioUpdates,
  mergeAudioUpdateJobs,
  processAudioUpdateQueue,
} from "./audioUpdateUtils";

export const AUDIO_BACKGROUND_TASK = "COPTIC_AUDIO_DOWNLOAD";
const BACKGROUND_BATCH_SIZE = 48;
const BACKGROUND_CONCURRENCY = 8;

async function runConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

if (!TaskManager.isTaskDefined(AUDIO_BACKGROUND_TASK)) {
  TaskManager.defineTask(AUDIO_BACKGROUND_TASK, async () => {
    if (Platform.OS === "web") return BackgroundFetch.BackgroundFetchResult.NoData;

    try {
      await ensureAudioDir();
      let allEntries = (await loadEntries()) ?? [];
      let changedSheetData = false;

      // Poll the public sheet directly; no Apps Script or server-side relay is used.
      try {
        const freshEntries = await fetchDictionaryData();
        const [audioIndexBeforeSync, existingAudioQueue] = await Promise.all([
          loadAudioIndex(),
          loadAudioUpdateQueue(),
        ]);
        const discoveredJobs = findDownloadedAudioUpdates(
          allEntries,
          freshEntries,
          audioIndexBeforeSync,
          existingAudioQueue
        );
        await saveAudioUpdateQueue(
          mergeAudioUpdateJobs(existingAudioQueue, discoveredJobs, freshEntries)
        );

        changedSheetData = !dictionariesEqual(allEntries, freshEntries);
        if (changedSheetData) await saveEntries(freshEntries);
        allEntries = freshEntries;
        await setLastSync(new Date());
      } catch {
        // Keep the last local dictionary and retry the sheet on the next run.
      }

      const audioUpdateResult = await processAudioUpdateQueue(allEntries, {
        maxItems: BACKGROUND_BATCH_SIZE,
        concurrency: BACKGROUND_CONCURRENCY,
      });
      const updatedChangedAudio = audioUpdateResult.completed > 0;

      // Previously downloaded changed files refresh independently; the user's
      // paused full-library download remains paused.
      if (await getAudioDownloadPaused()) {
        return changedSheetData || updatedChangedAudio
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const pending = await loadPendingQueue();
      if (pending.length === 0) {
        return changedSheetData || updatedChangedAudio
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const latestAudioIndex = await loadAudioIndex();
      const entryMap = new Map(
        allEntries
          .filter((entry) => !!entry.audioUrl)
          .map((entry) => [entry.audioId || entry.id, entry])
      );
      const remaining = pending.filter((id) => !latestAudioIndex.has(id) && entryMap.has(id));
      const batch = remaining.slice(0, BACKGROUND_BATCH_SIZE);
      const nextIndex = new Set(latestAudioIndex);
      let downloadedCount = 0;

      await runConcurrent(batch, BACKGROUND_CONCURRENCY, async (id) => {
        if (await getAudioDownloadPaused()) return;
        const entry = entryMap.get(id);
        if (!entry?.audioUrl) return;
        if (await downloadAndSaveAudio(id, entry.audioUrl)) {
          nextIndex.add(id);
          downloadedCount += 1;
        }
      });

      if (downloadedCount > 0) await saveAudioIndex(nextIndex);
      const stillMissing = remaining.filter((id) => !nextIndex.has(id));
      if (stillMissing.length === 0) await clearPendingQueue();
      else await savePendingQueue(stillMissing);

      return downloadedCount > 0 || changedSheetData || updatedChangedAudio
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerAudioBackgroundTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) return;

    const registered = await TaskManager.isTaskRegisteredAsync(AUDIO_BACKGROUND_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(AUDIO_BACKGROUND_TASK, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    // Background Fetch is optional; foreground sync and automatic refresh still work.
  }
}
