/**
 * StorageContext — مدير التخزين المركزي لتطبيق KHMI
 *
 * يضمن:
 * 1. إنشاء المجلد الداخلي فور بدء التطبيق (ليس عند أول تحميل)
 * 2. دعم SAF لاختيار مجلد مرئي في مدير الملفات (اختياري)
 * 3. نقطة وصول واحدة لجميع عمليات التخزين
 * 4. معالجة الأخطاء وضمان وجود المسار دائماً
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

// ─── Constants ────────────────────────────────────────────────────────────────

const SAF_URI_KEY = "@khmi/saf_dir_uri_v1";
const SAF_MAP_KEY = "@khmi/saf_file_map_v1"; // entryId → content URI

/** المجلد الداخلي الخاص (للتشغيل الموثوق مع expo-av) */
export const INTERNAL_AUDIO_DIR =
  `${FileSystem.documentDirectory ?? ""}khmi_audio/`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type StorageMode = "internal" | "saf";

export interface StorageState {
  /** هل المخزن جاهز للاستخدام؟ */
  ready: boolean;
  /** هل المجلد الداخلي موجود وجاهز؟ */
  internalReady: boolean;
  /** نمط التخزين الحالي */
  mode: StorageMode;
  /** URI الـ SAF المختار (إذا كان المستخدم قد اختار مجلداً خارجياً) */
  safUri: string | null;
  /** مسار عرض للمستخدم */
  displayPath: string;
  /** هل يجري الإعداد الآن؟ */
  initializing: boolean;
}

interface StorageContextValue extends StorageState {
  /** اطلب من المستخدم اختيار مجلد خارجي مرئي (SAF) */
  requestPublicDirectory: () => Promise<{ success: boolean; path: string }>;
  /** احذف إعداد SAF والعودة للتخزين الداخلي */
  resetToInternal: () => Promise<void>;
  /** تأكد من وجود المجلد قبل أي عملية (يُستدعى من useOfflineStorage) */
  ensureInternalDir: () => Promise<void>;
  /** احفظ نسخة في مجلد SAF بعد التحميل الداخلي */
  mirrorToSaf: (entryId: string) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** حول SAF URI إلى مسار مقروء للمستخدم */
function parseSafPath(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    // مثال: content://com.android.externalstorage.documents/tree/primary:Download/KHMI
    const match = decoded.match(/tree\/([^:]+):?(.*)/);
    if (!match) return "مجلد خارجي";
    const root = match[1] === "primary" ? "الذاكرة الداخلية" : "بطاقة SD";
    const subPath = (match[2] || "").trim();
    return subPath ? `/${root}/${subPath}` : `/${root}`;
  } catch {
    return "مجلد خارجي مُختار";
  }
}

/** تأكد من أن المجلد الداخلي موجود — ينشئه إذا لم يكن موجوداً */
async function createInternalDirIfNeeded(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const info = await FileSystem.getInfoAsync(INTERNAL_AUDIO_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(INTERNAL_AUDIO_DIR, {
        intermediates: true,
      });
    }
  } catch (err) {
    // حاول مرة ثانية بمسار مختلف كـ fallback
    console.warn("[Storage] Failed to create internal dir:", err);
    try {
      await FileSystem.makeDirectoryAsync(INTERNAL_AUDIO_DIR, {
        intermediates: true,
      });
    } catch {
      // إذا فشل مرتين، التطبيق سيعمل بدون تخزين صوتي
    }
  }
}

/** تحقق من أن SAF URI لا يزال صالحاً */
async function isSafAccessible(uri: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const StorageContext = createContext<StorageContextValue>({
  ready: false,
  internalReady: false,
  mode: "internal",
  safUri: null,
  displayPath: INTERNAL_AUDIO_DIR,
  initializing: true,
  requestPublicDirectory: async () => ({ success: false, path: "" }),
  resetToInternal: async () => { },
  ensureInternalDir: async () => { },
  mirrorToSaf: async () => { },
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StorageState>({
    ready: false,
    internalReady: false,
    mode: "internal",
    safUri: null,
    displayPath: INTERNAL_AUDIO_DIR,
    initializing: true,
  });

  // منع التهيئة المزدوجة
  const initDone = useRef(false);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    initStorage();
  }, []);

  /**
   * التهيئة الإجبارية عند بدء التطبيق:
   * 1. أنشئ المجلد الداخلي فوراً
   * 2. تحقق من SAF المحفوظ مسبقاً
   */
  async function initStorage() {
    setState((s) => ({ ...s, initializing: true }));

    // الخطوة 1: إنشاء المجلد الداخلي (إلزامي دائماً)
    await createInternalDirIfNeeded();

    let mode: StorageMode = "internal";
    let safUri: string | null = null;
    let displayPath: string = INTERNAL_AUDIO_DIR;

    // الخطوة 2: تحقق من SAF محفوظ مسبقاً (Android فقط)
    if (Platform.OS === "android") {
      try {
        const saved = await AsyncStorage.getItem(SAF_URI_KEY);
        if (saved) {
          const accessible = await isSafAccessible(saved);
          if (accessible) {
            mode = "saf";
            safUri = saved;
            displayPath = parseSafPath(saved);
          } else {
            // SAF انتهى صلاحيته — احذفه وارجع للداخلي
            await AsyncStorage.removeItem(SAF_URI_KEY);
          }
        }
      } catch {
        // الخطأ هنا لا يوقف التطبيق
      }
    }

    setState({
      ready: true,
      internalReady: true,
      mode,
      safUri,
      displayPath,
      initializing: false,
    });
  }

  /** اطلب من المستخدم اختيار مجلد خارجي مرئي */
  async function requestPublicDirectory(): Promise<{ success: boolean; path: string }> {
    if (Platform.OS !== "android") {
      return { success: false, path: "" };
    }

    try {
      const result =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (!result.granted) {
        return { success: false, path: "" };
      }

      const uri = result.directoryUri;
      const path = parseSafPath(uri);

      await AsyncStorage.setItem(SAF_URI_KEY, uri);

      setState((s) => ({
        ...s,
        mode: "saf",
        safUri: uri,
        displayPath: path,
      }));

      return { success: true, path };
    } catch {
      return { success: false, path: "" };
    }
  }

  /** ارجع للتخزين الداخلي وامسح SAF */
  async function resetToInternal(): Promise<void> {
    await AsyncStorage.multiRemove([SAF_URI_KEY, SAF_MAP_KEY]);
    setState((s) => ({
      ...s,
      mode: "internal",
      safUri: null,
      displayPath: INTERNAL_AUDIO_DIR,
    }));
  }

  /** تأكد من وجود المجلد الداخلي — يُستدعى قبل كل عملية تحميل */
  async function ensureInternalDir(): Promise<void> {
    if (Platform.OS === "web") return;
    await createInternalDirIfNeeded();
  }

  /**
   * انسخ ملف صوتي من المجلد الداخلي إلى مجلد SAF المختار
   * يُستدعى بعد اكتمال التحميل الداخلي
   */
  async function mirrorToSaf(entryId: string): Promise<void> {
    if (Platform.OS !== "android" || !state.safUri) return;

    const internalPath = `${INTERNAL_AUDIO_DIR}${entryId}.mp3`;
    try {
      // اقرأ الملف الداخلي بـ base64
      const b64 = await FileSystem.readAsStringAsync(internalPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // احذف الملف القديم من SAF إن وُجد (تجنّب التكرار)
      // نحاول قراءة الـ map المحفوظة
      const mapJson = await AsyncStorage.getItem(SAF_MAP_KEY);
      const map: Record<string, string> = mapJson ? JSON.parse(mapJson) : {};

      if (map[entryId]) {
        try {
          await FileSystem.deleteAsync(map[entryId], { idempotent: true });
        } catch { }
      }

      // أنشئ ملف جديد في SAF
      const fileUri =
        await FileSystem.StorageAccessFramework.createFileAsync(
          state.safUri,
          `${entryId}.mp3`,
          "audio/mpeg",
        );

      // اكتب المحتوى
      await FileSystem.writeAsStringAsync(fileUri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // احفظ URI في الـ map
      map[entryId] = fileUri;
      await AsyncStorage.setItem(SAF_MAP_KEY, JSON.stringify(map));
    } catch (err) {
      // إذا فشلت المزامنة مع SAF، الملف الداخلي لا يزال سليماً
      console.warn("[Storage] mirrorToSaf failed for", entryId, err);
    }
  }

  return (
    <StorageContext.Provider
      value={{
        ...state,
        requestPublicDirectory,
        resetToInternal,
        ensureInternalDir,
        mirrorToSaf,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStorage() {
  return useContext(StorageContext);
}
