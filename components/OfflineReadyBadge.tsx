import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ensureBibleOffline, verifyBibleCached } from "@/lib/offlineBible";

type BadgeState = "hidden" | "preparing" | "ready";

const BASE = "/coptic-khmi-web/";

/**
 * Web-only pill that tells the user when the app is durably saved on the device.
 * "Ready" is shown only after the service worker controls the page, every
 * resource in offline-manifest.json (app shell, fonts, and the JS bundle that
 * carries the dictionary snapshot) is present in Cache Storage, AND the full
 * Bible JSON set is cached - so closing and reopening the app genuinely works
 * without internet, including books never opened before. If the browser evicts
 * cached data later, the badge drops back to "preparing" instead of lying.
 */
async function verifyOfflineReady(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return false;
  if (typeof caches === "undefined") return false;
  try {
    const res = await caches.match(BASE + "offline-manifest.json");
    if (!res) return false;
    const manifest = await res.json();
    const resources: string[] = manifest.resources || [];
    const cachedPaths = new Set<string>();
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        cachedPaths.add(new URL(req.url).pathname);
      }
    }
    return resources.every((r) => cachedPaths.has(r));
  } catch {
    return false;
  }
}

export default function OfflineReadyBadge() {
  const [state, setState] = useState<BadgeState>("hidden");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    let cancelled = false;
    const update = async () => {
      const shellOk = await verifyOfflineReady();
      if (!shellOk) {
        if (!cancelled) setState("preparing");
        return;
      }
      // Shell ready: fill the full Bible in the background (first online setup),
      // then verify every chapter file is cached before saying "ready".
      void ensureBibleOffline((done, total) => { if (!cancelled) setProgress({ done, total }); });
      const bible = await verifyBibleCached();
      if (!cancelled) {
        setProgress({ done: bible.cached, total: bible.total });
        setState(bible.total > 0 && bible.cached === bible.total ? "ready" : "preparing");
      }
    };
    update();
    navigator.serviceWorker.addEventListener("controllerchange", update);
    navigator.serviceWorker.ready.then(update).catch(() => undefined);
    // Precache fills asynchronously after install; poll until ready, then keep a
    // slower heartbeat so cache eviction is reflected honestly.
    const fast = setInterval(update, 2000);
    const slow = setInterval(update, 30000);
    const stopFast = setTimeout(() => clearInterval(fast), 60000);
    return () => {
      cancelled = true;
      clearInterval(fast);
      clearInterval(slow);
      clearTimeout(stopFast);
      navigator.serviceWorker.removeEventListener("controllerchange", update);
    };
  }, []);

  if (state === "hidden") return null;
  const ready = state === "ready";
  return (
    <View style={[styles.pill, ready ? styles.ready : styles.preparing]}>
      <Feather name={ready ? "check-circle" : "download-cloud"} size={13} color={ready ? "#7CFC9A" : "#F5C96B"} />
      <Text style={[styles.text, { color: ready ? "#7CFC9A" : "#F5C96B" }]}>
        {ready
          ? "جاهزة للعمل بدون إنترنت"
          : progress && progress.total > 0
            ? `جاري تجهيز النسخة للعمل بدون إنترنت… ${Math.floor((progress.done / progress.total) * 100)}%`
            : "جاري تجهيز النسخة للعمل بدون إنترنت…"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "center",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  ready: { borderWidth: 1, borderColor: "rgba(124,252,154,0.35)" },
  preparing: { borderWidth: 1, borderColor: "rgba(245,201,107,0.35)" },
  text: { fontSize: 12, fontFamily: "cairoNormal" },
});
