import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = "/coptic-khmi-web/";
const DONE_KEY = "@coptic/bible-offline-done-v2";
const PROGRESS_KEY = "@coptic/bible-offline-progress-v2";

type OfflineManifest = { resources?: string[]; bible?: string[] };

let running = false;

async function readManifest(): Promise<OfflineManifest | null> {
  try {
    const res = await fetch(BASE + "offline-manifest.json", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as OfflineManifest;
  } catch {
    return null;
  }
}

// Full check: every Bible chapter file present in any cache. Used for the honest badge.
export async function verifyBibleCached(): Promise<{ total: number; cached: number }> {
  if (typeof caches === "undefined") return { total: 0, cached: 0 };
  const manifest = await readManifest();
  const files = manifest?.bible || [];
  if (!files.length) return { total: 0, cached: 0 };
  const cachedPaths = new Set<string>();
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) cachedPaths.add(new URL(req.url).pathname);
  }
  let cached = 0;
  for (const f of files) if (cachedPaths.has(f)) cached++;
  return { total: files.length, cached };
}

// Background full-Bible download after first online setup. The service worker's
// runtime cache stores each same-origin response, so plain fetch() fills it.
// Runs at most once per session; resumes across launches via the progress flag.
export async function ensureBibleOffline(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (running) return;
  if (typeof navigator === "undefined" || !("caches" in window)) return;
  running = true;
  try {
    // Best effort: ask the browser not to evict cached data under storage pressure.
    try { await (navigator as any).storage?.persist?.(); } catch { }

    const done = await AsyncStorage.getItem(DONE_KEY);
    if (done === "1") {
      // Trust but verify cheaply: eviction or partial cleanup drops us back to downloading.
      const v = await verifyBibleCached();
      if (v.total > 0 && v.cached === v.total) {
        onProgress?.(v.total, v.total);
        return;
      }
      await AsyncStorage.removeItem(DONE_KEY);
    }

    const manifest = await readManifest();
    const files = manifest?.bible || [];
    if (!files.length) return;

    let completed = 0;
    const saved = Number((await AsyncStorage.getItem(PROGRESS_KEY)) || 0);
    if (saved > 0) { completed = Math.min(saved, files.length); onProgress?.(completed, files.length); }

    const remaining = files.slice(completed);
    const CONCURRENCY = 6;
    for (let i = 0; i < remaining.length; i += CONCURRENCY) {
      if (!navigator.onLine) return; // offline mid-setup: resume next launch
      const batch = remaining.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); })));
      const okCount = results.filter((r) => r.status === "fulfilled").length;
      if (okCount === 0) return; // network failing: stop, resume later
      completed += okCount;
      await AsyncStorage.setItem(PROGRESS_KEY, String(completed));
      onProgress?.(completed, files.length);
    }

    const v = await verifyBibleCached();
    if (v.total > 0 && v.cached === v.total) {
      await AsyncStorage.setItem(DONE_KEY, "1");
      await AsyncStorage.removeItem(PROGRESS_KEY);
    }
  } finally {
    running = false;
  }
}
