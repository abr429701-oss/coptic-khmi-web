import React, { useEffect, useState } from "react";
import { Platform, View, Text, Pressable, Linking, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { APP_VERSION } from "@/lib/appVersion";

// Per-platform update metadata lives in the public metadata-only repo coptic-khmi-updates.
const METADATA_BASE = "https://raw.githubusercontent.com/abr429701-oss/coptic-khmi-updates/main";
const DISMISS_KEY = "@coptic/desktop-update-notice-dismissed-v1";

type PlatformKey = "windows" | "linux" | "macos";
type PerArch = string | { x64?: string; arm64?: string };
type UpdateMetadata = { version?: string; notes?: string; url?: PerArch; sha256?: PerArch };

const isNewerVersion = (current: string, latest: string): boolean => {
  const c = String(current).split(".").map(Number);
  const l = String(latest).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
};

// Desktop builds are the web bundle running inside Electron; the PWA/browser path is excluded here.
const detectDesktopPlatform = (): PlatformKey | null => {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  if (!ua.includes("Electron")) return null;
  if (ua.includes("Windows NT")) return "windows";
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macos";
  if (ua.includes("Linux")) return "linux";
  return null;
};

// Real build architecture: the Electron preload bridge exposes process.arch.
// Returns null only outside Electron (this notice renders inside Electron
// only), where we must never guess x64 on an arm64 machine.
const detectBuildArch = (): "x64" | "arm64" | null => {
  const a = (globalThis as { khmiUpdate?: { arch?: string } }).khmiUpdate?.arch;
  return a === "x64" || a === "arm64" ? a : null;
};

export function DesktopUpdateNotice() {
  const [info, setInfo] = useState<UpdateMetadata | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const key = detectDesktopPlatform();
    if (!key) return;
    let cancelled = false;
    (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${METADATA_BASE}/latest-${key}.json?cb=${Date.now()}`, {
          signal: controller.signal,
          cache: "no-store" as any,
        });
        clearTimeout(timer);
        if (!res.ok) return;
        const data: UpdateMetadata = await res.json();
        const latest = String(data.version || "").trim();
        const current = APP_VERSION;
        if (!latest || !isNewerVersion(current, latest)) return;
        const dismissedVersion = await AsyncStorage.getItem(DISMISS_KEY);
        if (cancelled || dismissedVersion === latest) return;
        setInfo({ ...data, version: latest });
        setVisible(true);
      } catch {
        // Offline or blocked: stay silent (offline-first app, never nag about network).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible || !info) return null;
  const arch = detectBuildArch();
  const pickPerArch = (value: UpdateMetadata["url"]): string => {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    // Never guess an architecture: use the real build arch, or stay empty and
    // let the UI offer explicit per-arch choices instead of a wrong download.
    if (arch && value[arch]) return value[arch]!.trim();
    return "";
  };
  const url = pickPerArch(info.url);
  const urlIsMap = !!info.url && typeof info.url !== "string";
  const altArch = arch === "arm64" ? "x64" : arch === "x64" ? "arm64" : null;

  // In-app download+install is available only inside Electron (preload exposes khmiUpdate).
  // In-app install requires a sha256 in the feed: installing remote executables
  // without integrity verification is not acceptable; without it we open the browser.
  const khmiUpdate: any = (globalThis as any).khmiUpdate;
  const hasHash = typeof info.sha256 === "string" ? !!info.sha256.trim() : !!(info.sha256 && (info.sha256.x64 || info.sha256.arm64));
  const inApp = !!khmiUpdate && hasHash;

  const handleDownload = async () => {
    if (!inApp) { Linking.openURL(url); return; }
    setBusy(true);
    try {
      const staged = await khmiUpdate.downloadAndStage(info.url, info.sha256 || null);
      await khmiUpdate.relaunch(staged); // quits the app; swap script completes install
    } catch (e) {
      setBusy(false);
      setError("تعذر التنزيل داخل التطبيق — افتح الرابط في المتصفح");
    }
  };

  const dismiss = async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(DISMISS_KEY, String(info.version));
    } catch {}
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>متوفر إصدار جديد من التطبيق ({info.version})</Text>
        {!!info.notes && <Text style={styles.notes}>{info.notes}</Text>}
        {!!error && <Text style={styles.notes}>{error}</Text>}
        <View style={styles.row}>
          {(inApp || !!url) && (
            <Pressable style={[styles.btn, styles.btnPrimary]} disabled={busy} onPress={handleDownload}>
              <Text style={styles.btnTextPrimary}>{busy ? "جاري التنزيل..." : inApp ? "تنزيل وتثبيت" : "تنزيل"}</Text>
            </Pressable>
          )}
          {!inApp && !url && urlIsMap && (() => {
            const map = info.url as { x64?: string; arm64?: string };
            return (
              <>
                {!!map.x64 && (
                  <Pressable style={styles.btn} onPress={() => Linking.openURL(map.x64!)}>
                    <Text style={styles.btnText}>تنزيل نسخة Intel (x64)</Text>
                  </Pressable>
                )}
                {!!map.arm64 && (
                  <Pressable style={styles.btn} onPress={() => Linking.openURL(map.arm64!)}>
                    <Text style={styles.btnText}>تنزيل نسخة Apple Silicon (arm64)</Text>
                  </Pressable>
                )}
              </>
            );
          })()}
          <Pressable style={styles.btn} onPress={dismiss}>
            <Text style={styles.btnText}>لاحقًا</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Viewport-fixed so the notice stays centered even when the Electron
    // document is wider than the window (zoom) - absolute would center on the document.
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 12,
    zIndex: 9999,
  } as any,
  card: {
    marginTop: 12,
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#8B1A1A",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  title: { color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "right" },
  notes: { color: "#FDE8E8", fontSize: 13, marginTop: 4, textAlign: "right" },
  row: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, gap: 8 } as any,
  btn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#F5C2C2" },
  btnPrimary: { backgroundColor: "#fff", borderColor: "#fff" },
  btnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  btnTextPrimary: { color: "#8B1A1A", fontSize: 13, fontWeight: "700" },
});
