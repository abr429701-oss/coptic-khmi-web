import { useQuery } from "@tanstack/react-query";
import bundledMetaJson from "../assets/dictionary.seed.meta.json";
import bundledRowsJson from "../assets/dictionary.seed.json"; // Desktop: offline first-run snapshot; live sheet data replaces it after sync

export interface DictionaryEntry {
  id: string;
  coptic: string;
  arabic: string;
  english?: string;
  french?: string;
  german?: string;
  origin?: string;
  gender?: string;
  wordType?: string;
  audioUrl?: string;
  audioId?: string;
  rawText: string;
  arabicMeanings: string[];
}

const DEFAULT_DICTIONARY_SOURCE: DictionarySourceConfig = {
  spreadsheet: "14pUNXtrHoMSU9lBWhKQZyspe-DDTMDudSiuL2sJQRUI",
  sheetName: "dictionary",
  columns: { coptic: "A", arabic: "C", english: "D", french: "E", german: "F", origin: "J", wordType: "K", audio: "L", gender: "" },
};
export interface DictionarySourceConfig {
  spreadsheet: string;
  sheetName: string;
  columns: { coptic: string; arabic: string; english: string; french: string; german: string; origin: string; wordType: string; audio: string; gender: string };
}
const SYNC_TIMEOUT_MS = 45_000;
export const GITHUB_AUDIO_BASE =
  "https://raw.githubusercontent.com/abr429701-oss/coptic-dictionary-bot/audio/";

/** Returns the decoded path for audio files hosted by the bulk-download branch. */
export function getGithubAudioArchivePath(audioUrl: string): string | null {
  if (!audioUrl.startsWith(GITHUB_AUDIO_BASE)) return null;
  const encodedPath = audioUrl.slice(GITHUB_AUDIO_BASE.length).split(/[?#]/, 1)[0];
  if (!encodedPath) return null;
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

const bundledMeta = bundledMetaJson as {
  entryCount?: number;
  audioFileCount?: number;
  audioSizeBytes?: number | null;
  audioSizeKnown?: boolean;
};

/** حجم وعدد الروابط الصوتية الفريدة المحسوبة بواسطة مولّد البذرة المحلي. */
export const AUDIO_TOTAL_SIZE_BYTES = Number(bundledMeta.audioSizeBytes) || 0;
export const AUDIO_TOTAL_FILE_COUNT = Number(bundledMeta.audioFileCount) || 0;
export const AUDIO_SIZE_IS_KNOWN = bundledMeta.audioSizeKnown === true && AUDIO_TOTAL_SIZE_BYTES > 0;

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeAudioUrl(value: string): string | undefined {
  const audio = value.trim();
  if (!audio) return undefined;
  if (audio.startsWith("gh:")) return `${GITHUB_AUDIO_BASE}${audio.slice(3)}`;
  if (!isUrl(audio)) return undefined;

  const fileMatch = audio.match(/drive\.google\.com\/file\/d\/([^/?&]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  }

  const openMatch = audio.match(/[?&]id=([^&]+)/);
  if (audio.includes("drive.google.com") && openMatch) {
    return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
  }

  return audio;
}

function splitArabicMeanings(value: string): string[] {
  return value
    .split(/[،,;؛/\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hashId(value: string): string {
  // Two independent 32-bit hashes provide a stable, compact ID across row inserts/deletes.
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/**
 * يحوّل صفوف JSON المختصرة إلى بنية القاموس التي تستخدمها الشاشات.
 * ترتيب الصف: قبطي، عربي، إنجليزي، فرنسي، ألماني، خانة متجاهلة، أصل J، نوع K، رابط الصوت L.
 */
function parseDictionaryRowsChunk(
  rows: unknown[][],
  occurrences: Map<string, number>
): DictionaryEntry[] {
  const entries: DictionaryEntry[] = [];

  for (const row of rows) {
    const value = (index: number): string => {
      const item = row[index];
      return item === null || item === undefined ? "" : String(item).trim();
    };

    const coptic = value(0);
    const arabic = value(1);
    if (!coptic && !arabic) continue;

    const english = value(2);
    const french = value(3);
    const german = value(4);
    const origin = value(6);
    const wordType = value(7);
    const audioUrl = normalizeAudioUrl(value(8));
    const gender = value(9);

    // Identity uses only the headword text. Mutable metadata (audioUrl and
    // other admin-editable fields) must not re-id an entry: that orphans saved
    // favorites/history when an admin edits a cell.
    const identity = `${coptic}\u0000${arabic}`;
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);

    entries.push({
      id: `dictionary-${hashId(`${identity}\u0000${occurrence}`)}`,
      coptic,
      arabic,
      english: english || undefined,
      french: french || undefined,
      german: german || undefined,
      origin: origin || undefined,
      wordType: wordType || undefined,
      gender: gender || undefined,
      audioUrl,
      audioId: audioUrl ? `audio-${hashId(audioUrl)}` : undefined,
      rawText: [coptic, arabic].filter(Boolean).join(". "),
      arabicMeanings: splitArabicMeanings(arabic),
    });
  }

  return entries;
}

export function parseDictionaryRows(rows: unknown[][]): DictionaryEntry[] {
  return parseDictionaryRowsChunk(rows, new Map<string, number>());
}

export const BUNDLED_DICTIONARY_SEED: DictionaryEntry[] = parseDictionaryRows(bundledRowsJson as unknown as unknown[][]);

export interface AudioLibrarySize {
  bytes: number;
  known: boolean;
}

export function estimateAudioLibrarySize(entries: DictionaryEntry[]): number {
  if (AUDIO_TOTAL_FILE_COUNT <= 0 || AUDIO_TOTAL_SIZE_BYTES <= 0) return 0;
  const uniqueAudioCount = new Set(entries.map((entry) => entry.audioUrl).filter((url): url is string => !!url)).size;
  return Math.round((AUDIO_TOTAL_SIZE_BYTES / AUDIO_TOTAL_FILE_COUNT) * uniqueAudioCount);
}

const remoteAudioSizeCache = new Map<string, Promise<number | null>>();

async function getRemoteAudioSize(url: string): Promise<number | null> {
  const cached = remoteAudioSizeCache.get(url);
  if (cached) return cached;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { method: "HEAD", signal: controller.signal });
      const length = Number(response.headers.get("content-length"));
      if (response.ok && Number.isFinite(length) && length > 0) return length;
      const contentRange = response.headers.get("content-range") ?? "";
      const rangeMatch = contentRange.match(/\/(\d+)$/);
      if (rangeMatch) return Number(rangeMatch[1]);
    } catch {
    } finally {
      clearTimeout(timeout);
    }

    const rangeController = new AbortController();
    const rangeTimeout = setTimeout(() => rangeController.abort(), 8_000);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: rangeController.signal,
      });
      const contentRange = response.headers.get("content-range") ?? "";
      const rangeMatch = contentRange.match(/\/(\d+)$/);
      return response.status === 206 && rangeMatch ? Number(rangeMatch[1]) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(rangeTimeout);
    }
  })();
  remoteAudioSizeCache.set(url, request);
  const result = await request;
  if (result === null) remoteAudioSizeCache.delete(url);
  return result;
}

/**
 * The bundled byte count is exact for the bundled URL set. When sheet links
 * differ, request sizes only for added/removed URLs instead of probing every
 * audio file in the 16k-entry dictionary.
 */
export async function calculateAudioLibrarySize(entries: DictionaryEntry[]): Promise<AudioLibrarySize> {
  const estimatedBytes = estimateAudioLibrarySize(entries);
  const currentUrls = new Set(entries.map((entry) => entry.audioUrl).filter((url): url is string => !!url));
  if (currentUrls.size === 0) return { bytes: 0, known: false };
  if (!AUDIO_SIZE_IS_KNOWN || currentUrls.size > 100) return { bytes: estimatedBytes, known: false };

  const urls = [...currentUrls];
  const sizes: Array<number | null> = new Array(urls.length).fill(null);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= urls.length) return;
      sizes[index] = await getRemoteAudioSize(urls[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, urls.length) }, worker));
  if (sizes.some((size) => size === null)) return { bytes: estimatedBytes, known: false };
  return { bytes: sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0), known: true };
}

function parseGvizResponse(text: string): unknown[] {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("استجابة الشيت غير صالحة");
  }

  const response = JSON.parse(text.slice(firstBrace, lastBrace + 1));
  const rows = response?.table?.rows;
  if (!Array.isArray(rows)) throw new Error("لم يعُد الشيت بصفوف بيانات");

  return rows;
}

async function parseGvizRowsInChunks(rows: unknown[], selectedColumns: string[], columns: DictionarySourceConfig["columns"], chunkSize = 400): Promise<DictionaryEntry[]> {
  const entries: DictionaryEntry[] = [];
  const occurrences = new Map<string, number>();
  const positions = new Map(selectedColumns.map((column, index) => [column, index]));
  const fieldOrder: Array<keyof DictionarySourceConfig["columns"]> = ["coptic", "arabic", "english", "french", "german", "origin", "wordType", "audio", "gender"];
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize).map((rowValue) => {
      const row = rowValue as { c?: Array<{ v?: unknown; f?: unknown } | null> };
      const cells = row?.c ?? [];
      const values = new Map<string, string>();
      for (const field of fieldOrder) {
        const column = columns[field].trim().toUpperCase();
        const position = positions.get(column);
        const cell = position === undefined ? null : cells[position];
        const value = cell?.v ?? cell?.f;
        values.set(field, value === null || value === undefined ? "" : String(value).trim());
      }
      return [values.get("coptic"), values.get("arabic"), values.get("english"), values.get("french"), values.get("german"), "", values.get("origin"), values.get("wordType"), values.get("audio"), values.get("gender")];
    });
    entries.push(...parseDictionaryRowsChunk(chunk, occurrences));
    // Yield to the UI between batches; the controlled search field and buttons remain responsive.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return entries;
}

function spreadsheetIdFromSource(value: string): string {
  const input = value.trim();
  const match = input.match(/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  const id = match?.[1] || input;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error("أدخل رابط Google Sheets صحيحًا أو معرّف الشيت.");
  return id;
}

function normalizeSource(source?: DictionarySourceConfig): { spreadsheetId: string; sheetName: string; columns: DictionarySourceConfig["columns"]; selectedColumns: string[] } {
  const supplied = source || DEFAULT_DICTIONARY_SOURCE;
  const columns = { ...DEFAULT_DICTIONARY_SOURCE.columns, ...(supplied.columns || {}) };
  for (const key of Object.keys(columns) as Array<keyof typeof columns>) {
    columns[key] = String(columns[key] || "").trim().toUpperCase();
    if (columns[key] && !/^[A-Z]{1,3}$/.test(columns[key])) throw new Error(`رقم/حرف عمود غير صالح: ${key}`);
  }
  if (!columns.coptic || !columns.arabic) throw new Error("يجب تحديد عمودي الكلمة القبطية والمعنى العربي على الأقل.");
  const sheetName = String(supplied.sheetName || "").trim();
  if (!sheetName) throw new Error("اسم ورقة القاموس مطلوب.");
  const selectedColumns = [...new Set(Object.values(columns).filter(Boolean))];
  return { spreadsheetId: spreadsheetIdFromSource(supplied.spreadsheet), sheetName, columns, selectedColumns };
}

/** جلب المصدر والأعمدة المعيّنة؛ البيانات المحلية تبقى ظاهرة عند فشل الشبكة. */
export async function fetchDictionaryData(source?: DictionarySourceConfig, minimumEntries = 1_000): Promise<DictionaryEntry[]> {
  const normalized = normalizeSource(source);
  const cacheBuster = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const query = `select ${normalized.selectedColumns.join(",")}`;
  const url =
    `https://docs.google.com/spreadsheets/d/${normalized.spreadsheetId}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(normalized.sheetName)}` +
    `&headers=1&tq=${encodeURIComponent(query)}&nocache=${cacheBuster}&_=${cacheBuster}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`فشل جلب القاموس (${response.status})`);
    }

    const rows = parseGvizResponse(await response.text());
    const entries = await parseGvizRowsInChunks(rows, normalized.selectedColumns, normalized.columns);
    if (entries.length < minimumEntries) {
      throw new Error(`استجابة الشيت غير مكتملة (${entries.length} كلمة؛ الحد الأدنى ${minimumEntries})`);
    }
    return entries;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("انتهت مهلة تحميل القاموس؛ حاول مرة أخرى عند توفر الإنترنت");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function previewDictionarySource(source: DictionarySourceConfig): Promise<{ entryCount: number; sample: DictionaryEntry[] }> {
  const entries = await fetchDictionaryData(source, 1);
  return { entryCount: entries.length, sample: entries.slice(0, 5) };
}

/**
 * يبني خريطة من المعرّف القديم (الذي كان يتضمّن رابط الصوت) إلى المعرّف الحالي،
 * حتى تستمر المفضلة والسجل المحفوظان قبل هذا التغيير دون حذف أو ترحيل.
 */
export function buildLegacyIdAliasMap(entries: DictionaryEntry[]): Map<string, string> {
  const occurrences = new Map<string, number>();
  const alias = new Map<string, string>();
  for (const entry of entries) {
    const legacyIdentity = `${entry.coptic}\u0000${entry.arabic}\u0000${entry.audioUrl ?? ""}`;
    const occurrence = occurrences.get(legacyIdentity) ?? 0;
    occurrences.set(legacyIdentity, occurrence + 1);
    const legacyId = `dictionary-${hashId(`${legacyIdentity}\u0000${occurrence}`)}`;
    if (legacyId !== entry.id) alias.set(legacyId, entry.id);
  }
  return alias;
}

export function useDictionary() {
  return useQuery<DictionaryEntry[]>({
    queryKey: ["dictionary_v4"],
    queryFn: () => fetchDictionaryData(),
    initialData: BUNDLED_DICTIONARY_SEED, // Desktop fallback; new mobile starts empty until first sync
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
