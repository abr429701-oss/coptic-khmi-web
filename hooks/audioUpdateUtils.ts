import type { DictionaryEntry } from "./useDictionary";
import {
  deleteAudioById,
  downloadAndSaveAudio,
  isAudioFileExists,
  loadAudioIndex,
  loadAudioUpdateQueue,
  saveAudioIndex,
  saveAudioUpdateQueue,
  type AudioUpdateJob,
} from "./useOfflineStorage";

function audioIdFor(entry: DictionaryEntry): string {
  return entry.audioId || entry.id;
}

function pairKey(entry: DictionaryEntry): string {
  return `${entry.coptic}\u0000${entry.arabic}`;
}

function fullTextKey(entry: DictionaryEntry): string {
  return `${pairKey(entry)}\u0000${entry.english ?? ""}\u0000${entry.french ?? ""}\u0000${entry.german ?? ""}`;
}

/**
 * Find changed sheet audio URLs only for words whose previous audio is already
 * stored locally (or is already being replaced from such a local file).
 */
export function findDownloadedAudioUpdates(
  previousEntries: DictionaryEntry[],
  nextEntries: DictionaryEntry[],
  downloadedAudioIds: Set<string>,
  pendingJobs: AudioUpdateJob[] = []
): AudioUpdateJob[] {
  const oldByPair = new Map<string, DictionaryEntry[]>();
  const oldByFullText = new Map<string, DictionaryEntry[]>();
  const oldByCoptic = new Map<string, DictionaryEntry[]>();
  for (const entry of previousEntries) {
    const pair = pairKey(entry);
    const group = oldByPair.get(pair) ?? [];
    group.push(entry);
    oldByPair.set(pair, group);
    const full = fullTextKey(entry);
    const fullGroup = oldByFullText.get(full) ?? [];
    fullGroup.push(entry);
    oldByFullText.set(full, fullGroup);
    const copticGroup = oldByCoptic.get(entry.coptic) ?? [];
    copticGroup.push(entry);
    oldByCoptic.set(entry.coptic, copticGroup);
  }
  const nextCopticCounts = new Map<string, number>();
  for (const entry of nextEntries) nextCopticCounts.set(entry.coptic, (nextCopticCounts.get(entry.coptic) ?? 0) + 1);

  const pendingByAudioId = new Map<string, AudioUpdateJob>();
  for (const job of pendingJobs) pendingByAudioId.set(job.audioId, job);

  const usedOldEntries = new Set<DictionaryEntry>();
  const jobsByNewAudioId = new Map<string, AudioUpdateJob>();

  for (const next of nextEntries) {
    if (!next.audioUrl) continue;
    const fullCandidates = oldByFullText.get(fullTextKey(next)) ?? [];
    const pairCandidates = oldByPair.get(pairKey(next)) ?? [];
    const uniqueCopticCandidates = oldByCoptic.get(next.coptic) ?? [];
    const previous =
      fullCandidates.find((candidate) => !usedOldEntries.has(candidate)) ??
      pairCandidates.find((candidate) => !usedOldEntries.has(candidate)) ??
      (uniqueCopticCandidates.length === 1 && nextCopticCounts.get(next.coptic) === 1
        ? uniqueCopticCandidates[0]
        : undefined);
    if (!previous) continue;
    usedOldEntries.add(previous);
    if (!previous.audioUrl || previous.audioUrl === next.audioUrl) continue;

    const previousAudioId = audioIdFor(previous);
    const nextAudioId = audioIdFor(next);
    if (previousAudioId === nextAudioId) continue;

    // Preserve the original local file ID if another sheet edit arrives before
    // the first replacement finishes downloading.
    const alreadyQueued = pendingByAudioId.get(previousAudioId);
    const oldAudioIds = [
      ...(downloadedAudioIds.has(previousAudioId) ? [previousAudioId] : []),
      ...(alreadyQueued?.oldAudioIds ?? []),
    ];
    if (oldAudioIds.length === 0) continue;

    const existing = jobsByNewAudioId.get(nextAudioId);
    const mergedOldIds = new Set([...(existing?.oldAudioIds ?? []), ...oldAudioIds]);
    jobsByNewAudioId.set(nextAudioId, {
      audioId: nextAudioId,
      audioUrl: next.audioUrl,
      oldAudioIds: [...mergedOldIds],
    });
  }

  return [...jobsByNewAudioId.values()];
}

/** Retain only jobs that still match the current sheet, merging old-file aliases. */
export function mergeAudioUpdateJobs(
  existingJobs: AudioUpdateJob[],
  newJobs: AudioUpdateJob[],
  currentEntries: DictionaryEntry[]
): AudioUpdateJob[] {
  const currentUrls = new Map<string, string>();
  for (const entry of currentEntries) {
    if (entry.audioUrl) currentUrls.set(audioIdFor(entry), entry.audioUrl);
  }

  const merged = new Map<string, AudioUpdateJob>();
  const add = (job: AudioUpdateJob) => {
    if (currentUrls.get(job.audioId) !== job.audioUrl) return;
    const old = merged.get(job.audioId);
    merged.set(job.audioId, {
      audioId: job.audioId,
      audioUrl: job.audioUrl,
      oldAudioIds: [...new Set([...(old?.oldAudioIds ?? []), ...job.oldAudioIds])],
    });
  };
  existingJobs.forEach(add);
  newJobs.forEach(add);
  return [...merged.values()];
}

export function dictionariesEqual(a: DictionaryEntry[], b: DictionaryEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.coptic !== right.coptic ||
      left.arabic !== right.arabic ||
      left.english !== right.english ||
      left.french !== right.french ||
      left.german !== right.german ||
      left.gender !== right.gender ||
      left.origin !== right.origin ||
      left.wordType !== right.wordType ||
      left.audioUrl !== right.audioUrl
    ) return false;
  }
  return true;
}

export interface AudioUpdateProcessResult {
  attempted: number;
  completed: number;
  remaining: number;
  paused: boolean;
}

/** Download a bounded group of queued replacements, then atomically checkpoint. */
export async function processAudioUpdateQueue(
  currentEntries: DictionaryEntry[],
  options: {
    maxItems?: number;
    concurrency?: number;
    shouldContinue?: () => boolean;
  } = {}
): Promise<AudioUpdateProcessResult> {
  const maxItems = Math.max(1, options.maxItems ?? 48);
  const concurrency = Math.max(1, options.concurrency ?? 8);
  const shouldContinue = options.shouldContinue ?? (() => true);
  const storedQueue = await loadAudioUpdateQueue();
  const currentUrls = new Map<string, string>();
  const currentAudioIds = new Set<string>();
  for (const entry of currentEntries) {
    if (!entry.audioUrl) continue;
    const id = audioIdFor(entry);
    currentUrls.set(id, entry.audioUrl);
    currentAudioIds.add(id);
  }

  const validQueue = storedQueue.filter((job) => currentUrls.get(job.audioId) === job.audioUrl);
  if (validQueue.length !== storedQueue.length) await saveAudioUpdateQueue(validQueue);
  const batch = validQueue.slice(0, maxItems);
  if (batch.length === 0) {
    return { attempted: 0, completed: 0, remaining: validQueue.length, paused: !shouldContinue() };
  }

  const audioIndex = await loadAudioIndex();
  const successfulIds = new Set<string>();
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (shouldContinue()) {
      const index = nextIndex++;
      if (index >= batch.length) return;
      const job = batch[index];
      const indexedFileExists = audioIndex.has(job.audioId) && await isAudioFileExists(job.audioId);
      if (indexedFileExists || await downloadAndSaveAudio(job.audioId, job.audioUrl)) {
        successfulIds.add(job.audioId);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));

  const remainingQueue = validQueue.filter((job) => !successfulIds.has(job.audioId));
  const stillNeededOldIds = new Set(remainingQueue.flatMap((job) => job.oldAudioIds));
  for (const job of batch) {
    if (!successfulIds.has(job.audioId)) continue;
    audioIndex.add(job.audioId);
    for (const oldAudioId of job.oldAudioIds) {
      if (!currentAudioIds.has(oldAudioId) && !stillNeededOldIds.has(oldAudioId)) {
        await deleteAudioById(oldAudioId);
        audioIndex.delete(oldAudioId);
      }
    }
  }

  // Persist the new file index before retiring queued work. If the app exits
  // between these writes, the next run safely recognizes the completed file.
  await saveAudioIndex(audioIndex);
  await saveAudioUpdateQueue(remainingQueue);
  return {
    attempted: batch.length,
    completed: successfulIds.size,
    remaining: remainingQueue.length,
    paused: !shouldContinue(),
  };
}
