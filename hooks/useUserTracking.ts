import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform, AppState, AppStateStatus } from "react-native";
import type { DictionaryEntry } from "@/hooks/useDictionary";
import NetInfo from "@react-native-community/netinfo";
import { getIsSetupDone } from "./useOfflineStorage";

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwDoXHYpnsJMXg5O6XOoU8SQBpjOCFXfEcP2uyYggITJYeR1sdRmBeOMDGMyIVC7JRv/exec";

const STORAGE_KEYS = {
  DEVICE_ID: "@khmi/device_id",
  SESSION_ID: "@khmi/session_id",
  USER_DATA: "@khmi/user_data",
  OFFLINE_QUEUE: "@khmi/offline_queue",
};

// ============================================
// دوال مساعدة (نفس السابق)
// ============================================

function postToSheet(body: object): Promise<any> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", SCRIPT_URL, true);
    xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");
    xhr.timeout = 10000; // 10 ثوانٍ كحد أقصى

    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        resolve(res);
      } catch (e) {
        resolve({ success: false });
      }
    };

    xhr.onerror = () => resolve({ success: false, error: "Network error" });
    xhr.ontimeout = () => resolve({ success: false, error: "Request timeout" });

    xhr.send(JSON.stringify(body));
  });
}


export async function getHardwareDeviceId(): Promise<string> {
  try {
    if (Platform.OS === "android") {
      const androidId = await Application.getAndroidId();
      return `android_${androidId}`;
    } else if (Platform.OS === "ios") {
      const iosId = await Application.getIosIdForVendorAsync();
      return `ios_${iosId}`;
    }
    return `web_${Date.now()}`;
  } catch {
    return `unknown_hw_${Date.now()}`;
  }
}

function generateSessionId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (saved) return saved;
    const hardwareId = await getHardwareDeviceId();
    const restored = await restoreDeviceIdFromSheet(hardwareId);
    let deviceId: string;
    if (restored) {
      deviceId = restored;
      console.log("✅ Device ID restored from sheet:", deviceId);
    } else {
      const randomPart = Math.random().toString(36).substring(2, 15);
      const osPart = (Device.osName || "unknown").replace(/\s/g, "_");
      deviceId = `${osPart}_${randomPart}`;
      console.log("🆕 New device ID generated:", deviceId);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    return deviceId;
  } catch (err) {
    console.warn("getDeviceId error:", err);
    return `fallback_${Date.now()}`;
  }
}

async function restoreDeviceIdFromSheet(hardwareId: string): Promise<string | null> {
  try {
    const url = `${SCRIPT_URL}?action=getUser&hardwareId=${encodeURIComponent(hardwareId)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.success && data.deviceId) return data.deviceId;
    return null;
  } catch {
    return null;
  }
}

// ============================================
// أوفلاين كيو (تخزين الأحداث مؤقتاً)
// ============================================

interface OfflineEvent {
  timestamp: string;
  deviceId: string;
  sessionId: string;
  activityAction: string;
  wordId?: string;
  wordCoptic?: string;
  wordArabic?: string;
  details?: string;
  durationMs?: number;
  eventId: string;
  hardwareId?: string; // أضفنا المعرف الصلب للتعريف الموثوق
}

async function addToOfflineQueue(event: OfflineEvent) {
  try {
    const queue = await getOfflineQueue();
    queue.push(event);
    await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  } catch (err) {
    console.warn("Failed to add to offline queue:", err);
  }
}

async function getOfflineQueue(): Promise<OfflineEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function clearOfflineQueue() {
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify([]));
}

let isSyncing = false;

async function syncOfflineQueue() {
  if (isSyncing) return;
  const queue = await getOfflineQueue();
  if (queue.length === 0) return;

  isSyncing = true;
  try {
    // Attempt batch sync first
    const result = await postToSheet({
      action: "batchActivities",
      activities: queue,
    });

    if (result.success) {
      await clearOfflineQueue();
      console.log(`✅ Batch synced ${queue.length} events`);
    } else {
      // Fallback: Send individually if batch fails (for scripts without batch support)
      console.log("⚠️ Batch sync failed, attempting individual sync...");
      let successCount = 0;
      for (const event of queue) {
        const res = await postToSheet(event);
        if (res && res.success) successCount++;
      }
      if (successCount === queue.length) {
        await clearOfflineQueue();
      } else {
        // Remove only successfully sent items
        // (Simplified: keep queue and try again later)
      }
    }
  } catch (err) {
    console.warn("⚠️ syncOfflineQueue error:", err);
  } finally {
    isSyncing = false;
  }
}

// ============================================
// التسجيل (مع إضافة IP واللغة والثيم)
// ============================================

async function getLocation(): Promise<{ ip: string; country: string }> {
  try {
    // الحصول على الـ IP فقط بشكل موثوق جداً، وسيتولى السيرفر جلب الدولة والعلم
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return {
      ip: data.ip || "unknown",
      country: "detecting..." // سيقوم السيرفر بتحديثها فوراً
    };
  } catch (err) {
    console.warn("📍 IP Fetch Error:", err);
    return { ip: "unknown", country: "unknown" };
  }
}

async function registerDevice(): Promise<boolean> {
  try {
    const deviceId = await getDeviceId();
    const hardwareId = await getHardwareDeviceId();
    const deviceModel = `${Device.manufacturer || ""} ${Device.modelName || ""}`.trim() || "unknown";
    const appVersion = Constants.expoConfig?.version || "1.0.0";
    const { ip, country } = await getLocation();
    const offlineSynced = await getIsSetupDone();
    // اللغة والثيم سيتم تحديثهما لاحقاً من خلال useUserTracking بعد تحميل الإعدادات
    console.log("📡 Registering device:", deviceId, "Country:", country, "Offline:", offlineSynced);
    const result = await postToSheet({
      action: "register",
      deviceId,
      hardwareId,
      deviceModel,
      appVersion,
      ip,
      country,
      offlineSynced,
      userCode: await AsyncStorage.getItem("@user_email") || "",
      userName: await AsyncStorage.getItem("@user_name") || "",
    });
    console.log("✅ Register result:", result);
    return result.success === true;
  } catch (err) {
    console.warn("⚠️ registerDevice error:", err);
    return false;
  }
}

// ============================================
// تحديث معلومات المستخدم (اللغة، الثيم، نقرات التواصل)
// ============================================

export async function updateUserInfo(data: {
  language?: string;
  theme?: boolean;
  social?: { whatsapp?: boolean; facebook?: boolean; telegram?: boolean };
  offlineSynced?: boolean;
}) {
  try {
    const deviceId = await getDeviceId();
    await postToSheet({
      action: "updateUserInfo",
      deviceId,
      ...data,
    });
  } catch (err) {
    console.warn("updateUserInfo error:", err);
  }
}

// ============================================
// الجلسة
// ============================================

export async function startSession(): Promise<string> {
  const sessionId = generateSessionId();
  await AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
  console.log("🟢 Session started:", sessionId);
  return sessionId;
}

async function getSessionId(): Promise<string> {
  const saved = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_ID);
  if (saved) return saved;
  return await startSession();
}

// ============================================
// النسخ الاحتياطي والاستعادة (نفس السابق)
// ============================================

export async function restoreUserData(): Promise<{ favorites: any[]; history: any[] } | null> {
  try {
    const deviceId = await getDeviceId();
    const url = `${SCRIPT_URL}?action=getUserData&deviceId=${encodeURIComponent(deviceId)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.success && data.userData) {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(data.userData));
      console.log("✅ User data restored from sheet");
      return data.userData;
    }
    return null;
  } catch (err) {
    console.warn("restoreUserData error:", err);
    return null;
  }
}

export async function backupUserData(favorites: any[], history: any[], suggestions: any[] = []): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await postToSheet({
      action: "backup",
      deviceId,
      userData: { favorites, history, suggestions, backupTime: Date.now() },
    });
  } catch (err) {
    console.warn("⚠️ backupUserData error:", err);
  }
}

// ============================================
// تسجيل النشاطات (مع أوفلاين كيو)
// ============================================

let cachedDeviceId: string | null = null;
let cachedSessionId: string | null = null;

export async function logActivity(
  action:
    | "search" | "open" | "favorite" | "audio_play" | "share" | "copy" | "name_coptic"
    | "training_session" | "save_image" | "save_name_image" | "suggestion"
    | "lesson_view" | "exam_submit" | "download_content" | "notif_click_daily"
    | "notif_click_engagement" | "notif_click_update" | "app_share_attempt"
    | "search_query" | "settings_change" | "error_event" | "screen_view"
    | "favorite_toggle" | "session_start" | "session_end" | "network_status"
    | "list_end_reached" | "social_click" | "modal_open" | "clipboard_copy" | "qr_view"
    // --- تتبعات جديدة دقيقة ---
    | "video_seek" | "video_fullscreen_enter" | "video_fullscreen_exit" | "video_playback_speed"
    | "long_press_word" | "double_tap_word" | "scroll_depth" | "scroll_to_top"
    | "battery_low" | "brightness_high" | "memory_warning" | "app_background" | "app_foreground"
    | "exam_start" | "exam_abandoned" | "question_view" | "question_skip" | "exam_hint_used"
    | "audio_stop" | "audio_pause" | "audio_resume" | "audio_volume_change"
    | "offline_sync_start" | "offline_sync_complete" | "offline_sync_fail"
    | "notif_permission_denied" | "notif_permission_granted"
    | "font_size_change" | "theme_swap" | "language_manual_sync"
    | "screenshot_taken" | "certificate_view" | "certificate_download"
    | "daily_word_dismiss" | "daily_word_share" | "link_open_external"
    | "notif_navigation_triggered",
  entry?: DictionaryEntry,
  details?: string,
  durationMs?: number,
  customDeviceId?: string
): Promise<void> {
  // Resolve IDs once and cache them
  if (!cachedDeviceId) cachedDeviceId = await getDeviceId();
  if (!cachedSessionId) cachedSessionId = await getSessionId();
  const hId = await getHardwareDeviceId();

  // تحديد الأكشن المناسب للسيرفر الموحد
  let finalAction = "activity";
  if (action === "lesson_view") finalAction = "lesson_view";
  else if (action === "exam_submit") finalAction = "exam_submit";
  else if (action === "download_content") finalAction = "download";
  else if (action === "share" || action === "app_share_attempt") finalAction = "share";
  else if (action === "search") finalAction = "search";

  const body = {
    action: finalAction,
    activityAction: action, // نحتفظ بالأكشن الأصلي للتفاصيل
    eventId: generateUUID(),
    timestamp: new Date().toISOString(),
    deviceId: customDeviceId || cachedDeviceId,
    sessionId: cachedSessionId,
    wordId: entry?.id || "",
    wordCoptic: entry?.coptic || "",
    wordArabic: entry?.arabic || "",
    details: details || "",
    durationMs: durationMs || 0,
    hardwareId: hId,
    userCode: await AsyncStorage.getItem("@user_email") || "",
    userName: await AsyncStorage.getItem("@user_name") || "",
    // لضمان التوافق مع دالة logSearch و logLesson
    query: action === "search" ? details : "",
    lesson_title: action === "lesson_view" ? details : "",
    exam_details: action === "exam_submit" ? details : "",
  };

  try {
    postToSheet(body).then(res => {
      if (!res || !res.success) {
        addToOfflineQueue(body as any);
      }
    });
    console.log(`📊 Logged [${action} -> ${finalAction}] for user: ${body.userCode}`);
  } catch (err) { }

}

/**
 * دالة مخصصة لتسجيل عمليات البحث لتبويب الرؤى (Insights)
 */
export async function logSearch(query: string, resultsCount: number): Promise<void> {
  const hId = await getHardwareDeviceId();
  const dId = await getDeviceId();

  const body = {
    action: "search",
    query: query,
    resultsCount: resultsCount,
    deviceId: dId,
    hardwareId: hId,
    eventId: generateUUID(),
    userCode: await AsyncStorage.getItem("@user_email") || "",
    userName: await AsyncStorage.getItem("@user_name") || "",
  };

  try {
    postToSheet(body).then(res => {
      if (!res || !res.success) {
        addToOfflineQueue(body as any);
      }
    });
    console.log(`🔍 Search Logged: "${query}" (${resultsCount} results)`);
  } catch (err) {
    addToOfflineQueue(body as any);
  }
}

// ============================================
// Hook الرئيسي (مع استماع لتغير الاتصال ومزامنة الكيو)
// ============================================

export function useUserTracking() {
  const initialized = useRef(false);
  const sessionStartTime = useRef(Date.now());
  const [restoredData, setRestoredData] = useState<{
    favorites: any[];
    history: any[];
  } | null>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    sessionStartTime.current = Date.now();

    const init = async () => {
      try {
        await registerDevice();
        await startSession();
        const data = await restoreUserData();
        if (data) {
          setRestoredData(data);
          console.log("✅ Restored:", data.favorites?.length, "favorites");
        }
        // مزامنة الأحداث المعلقة عند بدء التشغيل
        await syncOfflineQueue();
      } catch (err) {
        console.warn("⚠️ useUserTracking init error:", err);
      }
    };

    init();

    // الاستماع لحالة التطبيق (خلفية/أمامية) لتتبع مدة الجلسة بدقة
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        const duration = Date.now() - sessionStartTime.current;
        logActivity("session_end", undefined, `duration_seconds: ${Math.floor(duration / 1000)}`, duration);
      } else if (nextAppState === 'active') {
        sessionStartTime.current = Date.now();
        logActivity("session_start", undefined, "foreground_resume");
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // الاستماع لتغير حالة الاتصال بالإنترنت
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected) {
        console.log("🌐 Internet restored, syncing offline queue...");
        await syncOfflineQueue();
      }
      logActivity("network_status", undefined, `type: ${state.type}, connected: ${state.isConnected}`);
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, []);

  return { restoredData };
}