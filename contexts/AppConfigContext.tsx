import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CLOUDFLARE_API_BASE, DEFAULT_NOTIFICATION_SCHEDULE, DEFAULT_REMOTE_SETTINGS, type RemoteAppSettings } from "@/lib/cloudflare";
import { mergeRemoteVisibility } from "@/lib/remoteVisibility";

interface AppConfig {
  marquee: string;
  maintenance: boolean;
  forceUpdate: boolean;
  drawerMsg: string;
  storeLink: string;
  waLink: string;
}

interface AppConfigContextProps {
  config: AppConfig;
  remoteSettings: RemoteAppSettings;
  remoteSettingsReady: boolean;
  refreshConfig: () => Promise<void>;
  refreshRemoteSettings: () => Promise<void>;
  isLoading: boolean;
}

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxyJEYdRlUu2AvuPpJxDQVqx4aN3lDIaox17Fwx6j5mIveWXPvY94GeenPt1kyeMUye/exec";
const REMOTE_SETTINGS_CACHE_KEY = "@coptic/remote_settings_v1";

const asSettingsObject = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

const normalizeNotificationTime = (value: unknown, fallback: string): string => {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return fallback;
  const [hour, minute] = value.split(":").map(Number);
  return hour <= 23 && minute <= 59 ? value : fallback;
};

const normalizeRemoteSettings = (value: unknown): RemoteAppSettings => {
  const remote = asSettingsObject(value);
  return {
    usefulBots: { ...DEFAULT_REMOTE_SETTINGS.usefulBots, ...asSettingsObject(remote.usefulBots) },
    controls: { ...DEFAULT_REMOTE_SETTINGS.controls, ...asSettingsObject(remote.controls) },
    visibility: mergeRemoteVisibility(asSettingsObject(remote.visibility)),
    content: { ...DEFAULT_REMOTE_SETTINGS.content, ...asSettingsObject(remote.content) },
    labels: { ...DEFAULT_REMOTE_SETTINGS.labels, ...asSettingsObject(remote.labels) },
    notificationSchedule: {
      dailyWord: normalizeNotificationTime(asSettingsObject(remote.notificationSchedule).dailyWord, DEFAULT_NOTIFICATION_SCHEDULE.dailyWord),
      copticMonth: normalizeNotificationTime(asSettingsObject(remote.notificationSchedule).copticMonth, DEFAULT_NOTIFICATION_SCHEDULE.copticMonth),
      copticNewYear: normalizeNotificationTime(asSettingsObject(remote.notificationSchedule).copticNewYear, DEFAULT_NOTIFICATION_SCHEDULE.copticNewYear),
      gregorianNewYear: normalizeNotificationTime(asSettingsObject(remote.notificationSchedule).gregorianNewYear, DEFAULT_NOTIFICATION_SCHEDULE.gregorianNewYear),
      audioFirstDownload: normalizeNotificationTime(asSettingsObject(remote.notificationSchedule).audioFirstDownload, DEFAULT_NOTIFICATION_SCHEDULE.audioFirstDownload),
      audioContinueDownload: normalizeNotificationTime(asSettingsObject(remote.notificationSchedule).audioContinueDownload, DEFAULT_NOTIFICATION_SCHEDULE.audioContinueDownload),
    },
    updatedAt: typeof remote.updatedAt === "number" ? remote.updatedAt : undefined,
  };
};

const AppConfigContext = createContext<AppConfigContextProps | undefined>(undefined);

export const AppConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const lastRemoteUpdatedAtRef = useRef(0);
  const [config, setConfig] = useState<AppConfig>({
    marquee: "",
    maintenance: false,
    forceUpdate: false,
    drawerMsg: "",
    storeLink: "",
    waLink: ""
  });
  const [isLoading, setIsLoading] = useState(true);
  const [remoteSettings, setRemoteSettings] = useState<RemoteAppSettings>(DEFAULT_REMOTE_SETTINGS);
  const [remoteSettingsReady, setRemoteSettingsReady] = useState(false);

  const restoreRemoteSettingsCache = async () => {
    try {
      const cached = await AsyncStorage.getItem(REMOTE_SETTINGS_CACHE_KEY);
      if (cached) {
        const normalized = normalizeRemoteSettings(JSON.parse(cached));
        setRemoteSettings(normalized);
        lastRemoteUpdatedAtRef.current = normalized.updatedAt || 0;
        console.log(`[NotificationSchedule] Remote schedule: restored cached version updatedAt=${normalized.updatedAt || 0}; ${JSON.stringify(normalized.notificationSchedule)}.`);
      }
    } catch {
      // Ignore an absent or invalid cache; network settings or defaults will be used.
    } finally {
      setRemoteSettingsReady(true);
    }
  };

  const refreshRemoteSettings = async () => {
    try {
      const response = await fetch(`${CLOUDFLARE_API_BASE}/v1/settings`, { cache: "no-store" });
      if (!response.ok) return;
      const remote = await response.json();
      const normalized = normalizeRemoteSettings(remote);
      const receivedVersion = normalized.updatedAt || 0;
      if (receivedVersion < lastRemoteUpdatedAtRef.current) {
        console.warn(`[NotificationSchedule] Remote schedule: skipped stale response updatedAt=${receivedVersion}; current=${lastRemoteUpdatedAtRef.current}.`);
        return;
      }
      lastRemoteUpdatedAtRef.current = receivedVersion;
      setRemoteSettings(normalized);
      console.log(`[NotificationSchedule] Remote schedule: received from Cloudflare updatedAt=${normalized.updatedAt || 0}; ${JSON.stringify(normalized.notificationSchedule)}.`);
      try { await AsyncStorage.setItem(REMOTE_SETTINGS_CACHE_KEY, JSON.stringify(normalized)); }
      catch (error) { console.warn('[NotificationSchedule] Remote schedule: received but local cache save failed; keeping it in memory.', error); }
    } catch {
      // Preserve defaults/last successful settings if Cloudflare is unreachable.
    } finally {
      setRemoteSettingsReady(true);
    }
  };

  const refreshConfig = async () => {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getAppConfig`, { cache: "no-store" });
      const text = await res.text();
      
      // فحص سريع للتأكد أن الرد هو JSON وليس صفحة خطأ HTML
      if (text.trim().startsWith("<")) {
        console.warn("Server returned HTML instead of JSON. Check script deployment.");
        return;
      }

      const data = JSON.parse(text);
      if (data.success) {
        setConfig(data.config);

        // فحص وتنفيذ الأوامر التقنية المباشرة من مركز الأوامر
        if (data.config.system_command) {
          try {
            const cmd = JSON.parse(data.config.system_command);
            const lastExecuted = await AsyncStorage.getItem("@coptic/last_command_time");

            // ننفذ الأمر فقط إذا كان جديداً (وقته أكبر من آخر أمر نفذناه)
            if (cmd.time && (!lastExecuted || Number(cmd.time) > Number(lastExecuted))) {
              await AsyncStorage.setItem("@coptic/last_command_time", String(cmd.time));

              if (cmd.id === "REFRESH_ALL") {
                // إعادة تحميل البيانات فوراً
                refreshConfig();
              } else if (cmd.id === "CLEAR_CACHE") {
                // مسح الكاش والصور
                await AsyncStorage.clear(); // تحذير: هذا سيمسح كل شيء، يمكن تخصيصه لمسح الكاش فقط
                Alert.alert("تنبيه النظام", "تم تحديث ذاكرة التطبيق بنجاح.");
              }
            }
          } catch (e) { }
        }
      }
    } catch (e) {
      // نستخدم warn بدل error لتجنب الشاشة الحمراء المزعجة في وضع التطوير عند انقطاع النت
      console.warn("Failed to fetch app config - Network Issue");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await restoreRemoteSettingsCache();
      void refreshRemoteSettings();
      void refreshConfig();
    })();

    // فحص دوري كل 30 ثانية لتحديث الإعدادات (وضع الصيانة، الإعلانات، إلخ)
    const interval = setInterval(() => {
      refreshConfig();
    }, 30000);
    const remoteInterval = setInterval(() => { void refreshRemoteSettings(); }, 30000);

    return () => { clearInterval(interval); clearInterval(remoteInterval); };
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, remoteSettings, remoteSettingsReady, refreshConfig, refreshRemoteSettings, isLoading }}>
      {remoteSettingsReady ? children : null}
    </AppConfigContext.Provider>
  );
};

export const useAppConfig = () => {
  const context = useContext(AppConfigContext);
  if (context === undefined) {
    throw new Error("useAppConfig must be used within an AppConfigProvider");
  }
  return context;
};
