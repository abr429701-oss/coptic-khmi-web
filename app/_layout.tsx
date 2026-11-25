// ⚠️ هذا السطر يجب أن يكون في أعلى الملف قبل أي شيء آخر
// يسجّل مهام الخلفية مع TaskManager فور تحميل التطبيق
import "@/hooks/backgroundTasks";
if (typeof document !== "undefined") {
  const vs = document.createElement("style");
  vs.textContent = "*::-webkit-scrollbar{display:none !important;width:0 !important;height:0 !important}video{object-fit:contain !important;object-position:50% 50% !important;direction:ltr !important;margin-left:auto !important;margin-right:auto !important}[dir=\"auto\"]{unicode-bidi:plaintext !important}";
  document.head.appendChild(vs);
}
if (typeof document !== "undefined") {
  // Inputs: align by the first strong character of the value (or placeholder when empty), like the mobile app.
  const fixInputs = () => {
    document.querySelectorAll("input,textarea").forEach((el: any) => {
      if (el.type && !["text", "search", ""].includes(el.type)) return;
      if (el.dataset.khmiAlignSkip) return;
      // Respect explicitly centered inputs (Android name screen centers its input);
      // never override an input whose own style centers it.
      if (getComputedStyle(el).textAlign === "center") { el.dataset.khmiAlignSkip = "1"; return; }
      const txt = (el.value || el.placeholder || "").replace(/[\u2066-\u2069]/g, "");
      const m = /[A-Za-z\u0590-\u08FF\uFB1D-\uFEFC\u2C80-\u2CFF\u0370-\u03FF]/.exec(txt);
      const rtl = m ? /[\u0590-\u08FF\uFB1D-\uFEFC]/.test(m[0]) : true;
      el.style.setProperty("text-align", rtl ? "right" : "left", "important");
      el.style.setProperty("direction", rtl ? "rtl" : "ltr", "important");
    });
  };
  setInterval(fixInputs, 250);
  document.addEventListener("input", fixInputs, true);
}
import { initAllBackgroundTasks } from "@/hooks/backgroundTasks";
import { registerAudioBackgroundTask } from "@/hooks/audioBackgroundTask";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
} from "@expo-google-fonts/cairo";
import {
  Cinzel_400Regular,
  Cinzel_700Bold,
} from "@expo-google-fonts/cinzel";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState, Suspense } from "react";
import { DeviceEventEmitter, Platform, View, Text, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
// import { SQLiteProvider } from 'expo-sqlite'; // Removed top-level import to prevent crash

// 🚀 منع تأثر التطبيق بإعدادات حجم الخط في الهاتف نهائياً
// @ts-ignore
if (Text.defaultProps == null) Text.defaultProps = {};
// @ts-ignore
Text.defaultProps.allowFontScaling = false;
// @ts-ignore
Text.defaultProps.maxFontSizeMultiplier = 1;

// @ts-ignore
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
// @ts-ignore
TextInput.defaultProps.allowFontScaling = false;
// @ts-ignore
TextInput.defaultProps.maxFontSizeMultiplier = 1;

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { HistoryProvider } from "@/contexts/HistoryContext";
import { useSavedRecordReconcile } from "@/hooks/useSavedRecordReconcile";
import { SplashProvider, useSplash } from "@/contexts/SplashContext";
import { SplashAnimation } from "@/components/SplashAnimation";
import { StorageProvider } from "@/contexts/StorageContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { useUserTracking } from "@/hooks/useUserTracking";
import { useExpoPushNotifications } from "@/hooks/useExpoPushNotifications";
import { NotificationModal } from "@/components/NotificationModal";
import { useEngagementNotifications } from "@/hooks/useEngagementNotifications";
import { useAppUpdate, BACKGROUND_UPDATE_TASK } from "@/hooks/useAppUpdate";
import { UpdateForcedModal } from "@/components/UpdateForcedModal";
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppConfigProvider, useAppConfig } from "@/contexts/AppConfigContext";
import { GlobalMaintenanceScreen } from "@/components/GlobalMaintenanceScreen";
import { useAdmin } from "@/contexts/AdminContext";
// isSQLiteAvailable removed as we are now using SQLite only with manual init

// دالة مقارنة الإصدارات الاحترافية (يجب أن تكون في الأعلى)
const isNewerVersion = (current: string | undefined, latest: string | undefined): boolean => {
  if (!latest || !current) return false;
  const c = String(current).split('.').map(Number);
  const l = String(latest).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
};

let isProcessingUpdate = false;

// 🔥 الميزان الموحد: نفس المنطق الذي يظهر شاشة التحديث داخل التطبيق
const checkUpdateAndNotify = async () => {
  if (isProcessingUpdate) return;
  isProcessingUpdate = true;

  try {
    const SHEET_ID = '1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY';
    const APP_CONFIG_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=APP_CONFIG&range=A2:G&headers=0`;

    const response = await fetch(APP_CONFIG_URL + `&cb=${Date.now()}`);
    if (!response.ok) return;

    const text = await response.text();
    const jsonString = text.replace(/^[^{]+/, '').replace(/\);?$/, '');
    const json = JSON.parse(jsonString);
    const rows = json.table.rows || [];

    if (rows.length > 0) {
      let lastRowIndex = rows.length - 1;
      while (lastRowIndex >= 0) {
        const rowData = rows[lastRowIndex].c;
        if (rowData && (rowData[1]?.v || rowData[1]?.f)) break;
        lastRowIndex--;
      }

      if (lastRowIndex >= 0) {
        const data = rows[lastRowIndex].c;
        const latestVersion = (data[0]?.v || data[0]?.f) ? String(data[0]?.v || data[0]?.f).trim() : '0.0.0';
        const currentVersion = Constants.expoConfig?.version || '1.0.0';

        if (isNewerVersion(currentVersion, latestVersion)) {
          console.log("ℹ️ Update available: " + latestVersion + " (current: " + currentVersion + "). Server handles notifications.");
        } else {
          console.log("ℹ️ App is up to date: " + currentVersion);
        }
      }
    }
  } catch (e) {
    // لا داعي لإزعاجك بأخطاء الشبكة المتوقعة عند فصل الإنترنت
    if (e instanceof Error && e.message.includes('Network request failed')) {
      console.log("ℹ️ Unified Check: No internet connection.");
    } else {
      console.warn("Unified Check Failed:", e);
    }
  } finally {
    isProcessingUpdate = false;
  }
};


// 🔥 الحكم الذكي: يفحص الإشعار قبل عرضه (نفس منطق شاشة التحديث)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;

    // لو الإشعار من نوع "تحديث"، نفحص: هل النسخة أحدث من المثبتة؟
    if (data && data.type === 'update' && data.version) {
      const currentVersion = Constants.expoConfig?.version || '1.0.0';
      const notifVersion = String(data.version).trim();

      // نفس المنطق بالظبط اللي بتستخدمه شاشة التحديث
      if (!isNewerVersion(currentVersion, notifVersion)) {
        // النسخة مش أحدث → اكتم الإشعار تماماً
        console.log("🔕 Notification suppressed: version " + notifVersion + " is not newer than " + currentVersion);
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }
    }

    // لو الإشعار عادي أو النسخة أحدث → اعرضه
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
    },
  },
});

function RootLayoutNav() {
  const router = useRouter();
  const recentlyHandled = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    const detailKey = (id: string) => `@coptic/cloudflare-notification/${id}`;
    const lastResponseKey = "@coptic/last-cloudflare-notification-response";
    const openDetail = async (payload: any, responseId?: string) => {
      const id = String(payload?.notificationId || payload?.id || "").trim();
      const imageUrl = String(payload?.imageUrl || "").trim();
      if (!/^[A-Za-z0-9._:-]{1,160}$/.test(id)) return;
      try { if (new URL(imageUrl).protocol !== "https:") return; } catch { return; }
      if (responseId) {
        const previous = recentlyHandled.current;
        if (previous?.id === responseId && Date.now() - previous.at < 3000) return;
        recentlyHandled.current = { id: responseId, at: Date.now() };
        await AsyncStorage.setItem(lastResponseKey, responseId);
      }
      const detail = {
        id,
        title: String(payload?.title || "إشعار جديد").slice(0, 120),
        body: String(payload?.body || "").slice(0, 4000),
        imageUrl,
        receivedAt: Date.now(),
      };
      await AsyncStorage.setItem(detailKey(id), JSON.stringify(detail));
      router.push({ pathname: "/notifications/[id]", params: { id } } as any);
    };
    const eventSubscription = DeviceEventEmitter.addListener("open_cloudflare_notification_page", (payload) => {
      void openDetail(payload);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      const data = content.data || {};
      if (data.type !== "cloudflare_notification" || typeof data.imageUrl !== "string") return;
      void openDetail({ ...data, title: content.title, body: content.body }, response.notification.request.identifier);
    });
    let active = true;
    void Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (!active || !response) return;
      const content = response.notification.request.content;
      const data = content.data || {};
      if (data.type !== "cloudflare_notification" || typeof data.imageUrl !== "string") return;
      const responseId = response.notification.request.identifier;
      if (responseId && await AsyncStorage.getItem(lastResponseKey) === responseId) return;
      await openDetail({ ...data, title: content.title, body: content.body }, responseId);
    }).catch((error) => console.warn("Could not restore notification details:", error));
    return () => {
      active = false;
      eventSubscription.remove();
      responseSubscription.remove();
    };
  }, [router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

// Runs hooks that need the query client, inside QueryClientProvider.
function PostLoadEffects() {
  useSavedRecordReconcile();
  return null;
}

function AppContent() {
  const { isAdminMode, isLoaded: isAdminLoaded } = useAdmin();
  const { config, remoteSettings } = useAppConfig();
  const updateAdminOnly = remoteSettings.content.appUpdateAdminOnly === "true";
  const [isBypassed, setIsBypassed] = useState(false);

  useEffect(() => {
    const checkBypass = async () => {
      const val = await AsyncStorage.getItem("@coptic/maintenance_bypass");
      setIsBypassed(val === "true");
    };
    checkBypass();
  }, [isAdminMode]);

  useEffect(() => {
    const setupNotifications = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('khmi-notifications', {
          name: 'ⲭⲏⲙⲓ Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'notification.wav',
        });
      }
      initAllBackgroundTasks();
      void registerAudioBackgroundTask();
    };
    setupNotifications();
  }, []);

  const { splashDone, markSplashDone } = useSplash();
  useUserTracking();
  useEngagementNotifications();
  const { notification, clearNotification } = useExpoPushNotifications(splashDone);
  const { updateInfo, skipUpdate } = useAppUpdate();

  const isMaintenanceActive = config.maintenance && !isAdminMode && isAdminLoaded && !isBypassed;

  return (
    <QueryClientProvider client={queryClient}>
      <PostLoadEffects />
      <View
        style={{ flex: 1, opacity: splashDone ? 1 : 0 }}
        pointerEvents={splashDone ? "auto" : "none"}
      >
        {isMaintenanceActive ? (
          <GlobalMaintenanceScreen waLink={config.waLink} />
        ) : (
          <RootLayoutNav />
        )}
      </View>

      {!splashDone && (
        <SplashAnimation onFinish={markSplashDone} />
      )}

      {/* Desktop: mobile push-notification modal disabled */}

      {/* Desktop: mobile store update prompt disabled */}
    </QueryClientProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Cinzel_400Regular,
    Cinzel_700Bold,
    "CSAvaVeni-Regular": require("../assets/fonts/CSAvaVeni-Regular.ttf"),
    "ava_arsany": require("../assets/fonts/ava_arsany.ttf"),
    "ava_our": require("../assets/fonts/ava_our.ttf"),
    "cairoNormal": require("../assets/fonts/cairoNormal.ttf"),
    "coptic": require("../assets/fonts/coptic.ttf"),
    "gabriel_arshiagelos": require("../assets/fonts/gabriel_arshiagelos.ttf"),
    "nishti": require("../assets/fonts/nishti.ttf"),
  });

  const [fontTimeout, setFontTimeout] = useState(Platform.OS === "web");

  useEffect(() => {
    if (Platform.OS === "web") return;
    const t = setTimeout(() => setFontTimeout(true), 1200);
    // 🔔 مستمع الإشعارات الموحد: يستجيب لإشارة الشيت
    const notificationListener = Notifications.addNotificationReceivedListener(async (notification: Notifications.Notification) => {
      const data = notification.request.content.data;
      if (data && data.type === 'update') {
        console.log("📡 Remote update notification received. (Already visible, no need to trigger local one)");
      }
    });

    return () => {
      notificationListener.remove();
      clearTimeout(t);
    };
  }, []);

  const fontsReady = fontsLoaded || !!fontError || fontTimeout;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync().catch(() => { });
    }
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <SplashProvider>
        <LanguageProvider>
          <AdminProvider>
            <AppConfigProvider>
              <ThemeProvider>
                <FavoritesProvider>
                  <HistoryProvider>
                    <StorageProvider>
                      <ErrorBoundary>
                        <Suspense fallback={<View style={{ flex: 1, backgroundColor: '#000' }} />}>
                          <AppContent />
                        </Suspense>
                      </ErrorBoundary>
                    </StorageProvider>
                  </HistoryProvider>
                </FavoritesProvider>
              </ThemeProvider>
            </AppConfigProvider>
          </AdminProvider>
        </LanguageProvider>
      </SplashProvider>
    </SafeAreaProvider>
  );
}
