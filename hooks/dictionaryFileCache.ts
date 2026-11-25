// ─── كاش ملفّي للقاموس الكبير (8.5MB) ──────────────────────────
// AsyncStorage لا يتحمّل هذا الحجم → نخزّن JSON في ملف.
// الويب: Cache Storage. الموبايل: expo-file-system.
import { Platform } from "react-native";
import type { DictionaryEntry } from "./useDictionary";

let FS: {
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
  readAsStringAsync: (uri: string) => Promise<string>;
  writeAsStringAsync: (uri: string, text: string) => Promise<void>;
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
} | null = null;

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FS = require("expo-file-system/legacy");
  } catch {
    FS = null;
  }
}

const WEB_CACHE = "coptic-dict-v1";
const WEB_KEY = "dictionary-entries.json";

function fileUri(): string | null {
  try {
    const base = FS?.documentDirectory ?? FS?.cacheDirectory ?? null;
    // ملف منفصل عن كاش الـ raw في useDictionary (حتى لا يتعارضا)
    return base ? `${base}dictionary_entries.json` : null;
  } catch {
    return null;
  }
}

export async function readFileEntries(): Promise<DictionaryEntry[] | null> {
  try {
    let text: string | null = null;
    if (Platform.OS === "web") {
      if (!("caches" in window)) return null;
      const c = await caches.open(WEB_CACHE);
      const m = await c.match(WEB_KEY);
      if (!m) return null;
      text = await m.text();
    } else {
      const uri = fileUri();
      if (!uri || !FS) return null;
      const info = await FS.getInfoAsync(uri);
      if (!info.exists) return null;
      text = await FS.readAsStringAsync(uri);
    }
    if (!text) return null;
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? (arr as DictionaryEntry[]) : null;
  } catch {
    return null;
  }
}

export async function writeFileEntries(entries: DictionaryEntry[]): Promise<void> {
  // أعد بناء الحقول المحسوبة لو ناقصة (للبحث الفوري)
  const text = JSON.stringify(entries);
  if (Platform.OS === "web") {
    if (!("caches" in window)) throw new Error("no cache api");
    const c = await caches.open(WEB_CACHE);
    await c.put(WEB_KEY, new Response(text, { headers: { "Content-Type": "application/json" } }));
    return;
  }
  const uri = fileUri();
  if (!uri || !FS) throw new Error("no fs");
  await FS.writeAsStringAsync(uri, text);
}
