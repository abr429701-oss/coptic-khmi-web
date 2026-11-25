import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus, Linking } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import NetInfo from '@react-native-community/netinfo';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { getDeviceId, getHardwareDeviceId, logActivity } from '@/hooks/useUserTracking';

// ==== إعدادات Google Sheet ==== //
const SHEET_ID = '1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY';
export const APPS_SCRIPT_URL_NOTIF =
  'https://script.google.com/macros/s/AKfycbwpEogzSMIaFRowDIIdb8DF-EZFclIiFcqAm8hRSzFdCtt7rKTrJt_qRPWJUzlbZURYqg/exec';
export const CLOUDFLARE_NOTIFICATIONS_URL = 'https://coptic-app-notifications.abraammerzik56.workers.dev';
const CACHE_KEY = 'internal_notif_cache_v10'; // لتجنب تكرار النافذة
const SENT_DATA_KEY = 'last_sent_notif_data_v13'; // لتجنب تكرار التسجيل في الشيت
const NOTIF_REGISTRATION_TASK = 'NOTIF_TOKEN_SYNC';
const TOKEN_VERIFICATION_TASK = 'TOKEN_VERIFICATION_TASK';
const RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // العودة لنظام الـ 24 ساعة لمنع تكرار السجلات
const TOKEN_VALIDITY_CHECK_MS = 12 * 60 * 60 * 1000; // التحقق من الصحة كل 12 ساعة
const SYNC_SUCCESS_FLAG = '@notif/last_sync_success_v1';

// ==== ضبط سلوك إشعارات Expo عندما يكون التطبيق مفتوحاً ==== //
let isSplashDoneGlobal = false;

// ==== إعدادات الإشعارات ==== //
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: isSplashDoneGlobal,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/* ------------------------------------------------------------
 * 0️⃣ التحقق المباشر من الشيت عبر الـ Apps Script (بدون Cache)
 * ------------------------------------------------------------ */
async function verifyTokenExistsInSheet(): Promise<boolean> {
  try {
    const hardwareId = await getHardwareDeviceId();

    // دائماً نحاول الحصول على توكن فريش للمقارنة
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    let currentToken = 'no_token';
    try {
      const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
      currentToken = tokenRes.data;
    } catch (e) {
      console.log('⚠️ Failed to get fresh token for verification, using storage...');
      currentToken = (await getCurrentTokenFromStorage()) || 'no_token';
    }

    if (currentToken === 'no_token') return false;

    // طلب التحقق مباشرة من السكربت (أسرع وأدق من GVIZ)
    const response = await fetch(APPS_SCRIPT_URL_NOTIF, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'verify',
        hardware_id: hardwareId,
        expo_token: currentToken,
      }),
    });

    const resJson = await response.json();
    if (resJson.status === 'success') {
      if (resJson.exists && resJson.matches) {
        console.log('✅ Token verified and matches in sheet');
        return true;
      } else {
        console.log('🔴 Token mismatch or missing in sheet:', resJson);
        return false;
      }
    }
    return true; // في حالة خطأ السكربت، نفترض الصحة لتجنب الضغط
  } catch (error) {
    console.warn('⚠️ Failed to verify token via API:', error);
    return true;
  }
}

/* ------------------------------------------------------------
 * الحصول على التوكن الحالي من التخزين
 * ------------------------------------------------------------ */
async function getCurrentTokenFromStorage(): Promise<string | null> {
  try {
    const lastSentDataStr = await AsyncStorage.getItem(SENT_DATA_KEY);
    if (lastSentDataStr) {
      const lastSentData = JSON.parse(lastSentDataStr);
      return lastSentData.token || null;
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------
 * 0️⃣ وظيفة المزامنة الأساسية (تعمل في المقدمة والخلفية)
 * ------------------------------------------------------------ */
export async function syncDeviceTokenWithSheet(forceResync: boolean = false) {
  // المحاكيات غالباً ما تفشل في جلب التوكن، لكننا سنحاول على أي حال للأجهزة اللوحية
  const isPhysical = Device.isDevice;

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    let token: string | undefined;

    // محاولة الحصول على التوكن مع إعادة المحاولة (3 مرات)
    for (let i = 0; i < 3; i++) {
      try {
        const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
        token = tokenRes.data;
        if (token) {
          // حفظ التوكن في الكاش لاستخدامه لاحقاً إذا انقطع النت في الخلفية
          await AsyncStorage.setItem('@khmi/last_valid_expo_token', token);
          break;
        }
      } catch (e) {
        console.warn(`⚠️ محاولة ${i + 1} لفشل الحصول على التوكن:`, e);
        // في حالة الفشل، نحاول استرجاع آخر توكن نجحنا في جلب مسبقاً
        const cachedToken = await AsyncStorage.getItem('@khmi/last_valid_expo_token');
        if (cachedToken) {
          token = cachedToken;
          console.log('✅ Using cached token as fallback');
          break;
        }
        if (i < 2) await new Promise(r => setTimeout(r, 2000));
      }
    }

    const deviceId = await getDeviceId();
    const hardwareId = await getHardwareDeviceId();
    const lang = (await AsyncStorage.getItem('coptic_dictionary_language')) || 'ar';
    const currentToken = token || 'no_token';

    if (currentToken === 'no_token') {
      await AsyncStorage.setItem(SYNC_SUCCESS_FLAG, 'false');
      console.warn('⚠️ No Expo push token available; skipping Sheet registration.');
      return false;
    }

    const lastSentDataStr = await AsyncStorage.getItem(SENT_DATA_KEY);
    const lastSentData = lastSentDataStr ? JSON.parse(lastSentDataStr) : null;
    const now = Date.now();
    const appVersion = Constants.expoConfig?.version || '1.0.0';

    const isDataSame =
      lastSentData &&
      lastSentData.token === currentToken &&
      lastSentData.lang === lang &&
      lastSentData.hardware_id === hardwareId &&
      lastSentData.version === appVersion;

    // المزامنة الإجبارية إذا مر وقت طويل (ساعتان بدلاً من 12 ساعة لزيادة الضمان)
    const timeToResync = !lastSentData || (now - (lastSentData.timestamp || 0)) > (2 * 60 * 60 * 1000);

    if (!forceResync && isDataSame && !timeToResync && currentToken !== 'no_token') {
      console.log('ℹ️ Token likely up to date, skipping sync.');
      return true;
    }

    console.log('📡 Syncing device with sheet...', { token: currentToken, forceResync });
    const response = await fetch(APPS_SCRIPT_URL_NOTIF, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'register',
        device_id: deviceId,
        hardware_id: hardwareId,
        expo_token: currentToken,
        language: lang,
        app_version: appVersion,
      }),
    });

    const resJson = await response.json();
    if (resJson.status === 'success') {
      console.log('✅ Sync Success:', resJson);
    } else {
      console.warn('⚠️ Sync Partial Failure (Script Error):', resJson);
    }

    await AsyncStorage.setItem(
      SENT_DATA_KEY,
      JSON.stringify({
        token: currentToken,
        lang: lang,
        hardware_id: hardwareId,
        version: appVersion,
        timestamp: now,
      })
    );
    
    // نعتبر المزامنة ناجحة فقط إذا حصلنا على توكين حقيقي
    if (currentToken !== 'no_token') {
      await AsyncStorage.setItem(SYNC_SUCCESS_FLAG, 'true');
    } else {
      await AsyncStorage.setItem(SYNC_SUCCESS_FLAG, 'false');
    }
    
    return true;
  } catch (err) {
    console.warn('❌ Sync Failed:', err);
    await AsyncStorage.setItem(SYNC_SUCCESS_FLAG, 'false');
    return false;
  }
}





async function syncTokenWithCloudflare(token: string): Promise<boolean> {
  if (!token || token === 'no_token') return false;

  try {
    const language = (await AsyncStorage.getItem('coptic_dictionary_language')) || 'ar';
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const response = await fetch(`${CLOUDFLARE_NOTIFICATIONS_URL}/v1/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expoToken: token,
        language: language.toLowerCase().startsWith('en') ? 'en' : 'ar',
        appVersion,
        platform: Platform.OS,
      }),
    });

    if (!response.ok) {
      console.warn('⚠️ Cloudflare notification registration failed:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    // Cloudflare registration is deliberately independent from the existing Sheet flow.
    console.warn('⚠️ Cloudflare notification sync unavailable:', error);
    return false;
  }
}



export function useExpoPushNotifications(splashDone: boolean = true) {
  // توكن الـ Push (خارجي)
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();

  // إشعار داخلي (Modal) – نفس شكل إشعار Expo
  const [notification, setNotification] = useState<{ body: string; title?: string; imageUrl?: string; notificationId?: string } | null>(null);

  // لتجنب تشغيل الـ effect أكثر من مرة
  const initialized = useRef(false);
  const isRegisteredInSession = useRef(false);
  const isRegistering = useRef(false);
  const appState = useRef(AppState.currentState);
  const networkRetryInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRadicalSyncDone = useRef(false);

  /* ------------------------------------------------------------
   * 1️⃣ تسجيل الجهاز وإرسال التوكن إلى Google Sheet (مع إعادة المحاولة عند قطع النت)
   * ------------------------------------------------------------ */
  async function registerForPushNotificationsAsync(force: boolean = false) {
    if (isRegistering.current) {
      console.log('⏳ Registration already in progress, skipping...');
      return false;
    }

    isRegistering.current = true;

    try {
      // إجبار المزامنة الجذرية في أول مرة في الجلسة لضمان تنظيف الشيت
      const shouldForce = force || !isRadicalSyncDone.current;
      if (!isRadicalSyncDone.current) isRadicalSyncDone.current = true;
      // إعداد قنوات Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });

        await Notifications.setNotificationChannelAsync('khmi-notifications', {
          name: 'تنبيهات خمي',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#C8A951',
          sound: 'notification.wav',
        });
      }

      if (!Device.isDevice) {
        isRegistering.current = false;
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        isRegistering.current = false;
        return false;
      }

      // التحقق من الاتصال بالإنترنت أولاً
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected || !netInfo.isInternetReachable) {
        console.log('📱 No internet connection, will retry when online...');
        isRegistering.current = false;

        // إعداد إعادة المحاولة عند عودة الإنترنت
        if (networkRetryInterval.current) {
          clearInterval(networkRetryInterval.current);
        }

        networkRetryInterval.current = setInterval(async () => {
          const currentNetInfo = await NetInfo.fetch();
          if (currentNetInfo.isConnected && currentNetInfo.isInternetReachable) {
            console.log('🌐 Internet restored, retrying registration...');
            if (networkRetryInterval.current) {
              clearInterval(networkRetryInterval.current);
              networkRetryInterval.current = null;
            }
            await registerForPushNotificationsAsync(true);
          }
        }, 5000); // التحقق كل 5 ثوانٍ

        return false;
      }

      // المزامنة الفعلية مع force لضمان التسجيل
      const success = await syncDeviceTokenWithSheet(shouldForce);
      const cachedToken = await AsyncStorage.getItem('@khmi/last_valid_expo_token');
      if (cachedToken && cachedToken !== 'no_token') {
        // Fire-and-forget: the new backend must never delay or block the existing one.
        void syncTokenWithCloudflare(cachedToken);
      }

      if (success) {
        const lastSentDataStr = await AsyncStorage.getItem(SENT_DATA_KEY);
        const lastSentData = lastSentDataStr ? JSON.parse(lastSentDataStr) : null;
        if (lastSentData?.token && lastSentData.token !== 'no_token') {
          setExpoPushToken(lastSentData.token);
          isRegisteredInSession.current = true;
          console.log('✅ Successfully registered and synced token');
        }
      }

      isRegistering.current = false;
      return success;
    } catch (err) {
      console.warn('❌ Registration error:', err);
      isRegistering.current = false;
      return false;
    }
  }

  /* ------------------------------------------------------------
   * التحقق الدوري من صحة التوكن وإعادة التسجيل إذا لزم الأمر
   * ------------------------------------------------------------ */
  const verifyAndReRegister = useCallback(async () => {
    try {
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected || !netInfo.isInternetReachable) {
        console.log('📱 No internet, skipping verification');
        return;
      }

      console.log('🔍 Periodic token verification check...');
      const isValid = await verifyTokenExistsInSheet();

      if (!isValid) {
        console.log('🔄 Token invalid or missing in sheet, re-registering immediately...');
        await registerForPushNotificationsAsync(true);
      } else {
        console.log('✅ Token is valid in sheet');
      }
    } catch (error) {
      console.warn('⚠️ Verification failed:', error);
    }
  }, []);

  // تسجيل مهمة الخلفية لضمان استمرار المزامنة بدقة عالية
  useEffect(() => {
    // المهام يتم تسجيلها الآن عبر backgroundTasks.ts
  }, []);

  /* ------------------------------------------------------------
   * 2️⃣ مراقبة Google Sheet (Polling) لإظهار النافذة الداخلية
   * ------------------------------------------------------------ */
  const checkSheet = useCallback(async (isInitialFetch: boolean = false) => {
    try {
      // قراءة الأعمدة A‑F من شيت KHMI_NOFICATION تحديداً
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=KHMI_NOFICATION&range=A:F&headers=0`;
      const res = await fetch(url);
      const text = await res.text();
      const json = JSON.parse(text.replace(/^[^{]+/, '').replace(/\);?$/, ''));
      const rows = json.table.rows || [];

      const myHardwareId = await getHardwareDeviceId();

      // نبحث من الأسفل (أحدث تعديل)
      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i]?.c;
        if (!row) continue;

        const rowHardwareId = String(row[1]?.v ?? ''); // العمود B
        const individualMsg = row[4]?.v; // العمود E
        const broadcastMsg = row[5]?.v; // العمود F

        let targetMessage = '';

        // 1️⃣ رسالة جماعية (العمود F) تُرسل للجميع
        if (broadcastMsg && String(broadcastMsg).trim() !== '' && String(broadcastMsg) !== 'null') {
          targetMessage = String(broadcastMsg).trim();
        }
        // 2️⃣ رسالة فردية (العمود E) إذا كان hardware_id يطابق جهازنا
        else if (
          rowHardwareId === myHardwareId &&
          individualMsg &&
          String(individualMsg).trim() !== '' &&
          String(individualMsg) !== 'null'
        ) {
          targetMessage = String(individualMsg).trim();
        }

        if (targetMessage) {
          const msgId = `msg_${targetMessage.length}_${targetMessage.slice(0, 20)}`;
          const stored = await AsyncStorage.getItem(CACHE_KEY);
          const shownIds = stored ? JSON.parse(stored) : [];

          if (!shownIds.includes(msgId)) {
            // حفظ المعرف لتجنب التكرار
            await AsyncStorage.setItem(
              CACHE_KEY,
              JSON.stringify([...shownIds, msgId].slice(-20))
            );

            // إظهار الإشعار حتى في الفتحة الأولى إذا كانت الرسالة جديدة ولم يقرأها مسبقاً
            setNotification({ body: targetMessage });

            // لا نشغل الصوت للرسائل التي تم التقاطها وقت الفتح الأول الصامت لأن المستخدم لم يتفاعل معها
            if (!isInitialFetch) {
              try {
                const { sound } = await Audio.Sound.createAsync(
                  require('@/assets/sounds/notification.wav')
                );
                await sound.playAsync();
              } catch (e) {
                console.warn('⚠️ فشل تشغيل الصوت', e);
              }
            }
            break; // نكتفي بأحدث رسالة صالحة
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ فشل قراءة Google Sheet', e);
    }
  }, []);

  /* ------------------------------------------------------------
   * 3️⃣ مساعدة لحفظ وتوليد الإشعارات وتجنب التكرار
   * ------------------------------------------------------------ */
  const showAndCacheNotification = useCallback(async (bodyText: string, details?: { title?: string; imageUrl?: string; notificationId?: string }) => {
    if (!bodyText) return;
    const cleanText = String(bodyText).trim();
    if (!cleanText) return;

    // إنشاء نفس الـ ID الذي يستخدمه checkSheet
    const msgId = details?.notificationId ? `push_${details.notificationId}` : `msg_${cleanText.length}_${cleanText.slice(0, 20)}`;
    const stored = await AsyncStorage.getItem(CACHE_KEY);
    const shownIds = stored ? JSON.parse(stored) : [];

    if (!shownIds.includes(msgId)) {
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify([...shownIds, msgId].slice(-20))
      );

      setNotification({ body: cleanText, ...details });
    }
  }, []);

  /* ------------------------------------------------------------
   * 4️⃣ استماع لإشعارات Expo Push (خارجي) – تحويلها إلى Modal
   * ------------------------------------------------------------ */
  const listenExpoPush = useCallback(() => {
    // عندما يكون التطبيق مفتوحاً والمستخدم يستلم إشعار
    const subscription = Notifications.addNotificationReceivedListener((notif) => {
      const data = notif?.request?.content?.data;
      // إذا كان الإشعار محلياً أو إشعار تحديث، لا نظهره في المودال الداخلي
      if (data?.isLocal || data?.type === 'update') {
        return;
      }

      const bdy = notif?.request?.content?.body;
      if (bdy) {
        const imageUrl = typeof data?.imageUrl === 'string' && data.imageUrl.startsWith('https://') ? data.imageUrl : undefined;
        showAndCacheNotification(bdy, imageUrl ? {
          title: String(notif.request.content.title || ''),
          imageUrl,
          notificationId: String(data.notificationId || ''),
        } : undefined);
      }
    });

    // عندما يضغط المستخدم على الإشعار من الخارج (خلفية)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const bdy = response.notification.request.content.body;

      // صفحة تفاصيل الإشعار تُفتح بواسطة جسر التنقل في layout؛ لا نعرض مودالًا فوقها.
      if (data?.type === 'cloudflare_notification' && typeof data.imageUrl === 'string' && data.imageUrl.startsWith('https://')) {
        setNotification(null);
        return;
      }
      
      // [تتبع جذري] تتبع الضغط على الإشعارات حسب النوع قبل أي فلترة
      if (data?.type === 'retention' || data?.type === 'learning_reminder' || data?.type === 'progress') {
        logActivity("notif_click_engagement", undefined, `Type: ${data.type} | Body: ${bdy}`);
        
        // إذا كان إشعار تذكير بالدراسة، نقوم بإرسال حدث للتنقل
        if (data?.type === 'learning_reminder') {
          import('react-native').then(({ DeviceEventEmitter }) => {
            DeviceEventEmitter.emit('navigate_to_learn', data);
          });
        }
      } else if (data?.type === 'update') {
        logActivity("notif_click_update", undefined, `Version: ${data.version} | Body: ${bdy}`);
        if (typeof data.updateUrl === 'string' && data.updateUrl) {
          void Linking.openURL(data.updateUrl).catch((error) => console.warn('Could not open app update URL:', error));
        }
      } else if (data?.type === 'daily_word') {
        // يتم التعامل معه في useDailyWord ولكن كاحتياط هنا أيضاً
        logActivity("notif_click_daily", undefined, `Clicked Daily Word ID: ${data.entryId}`);
      } else {
        logActivity("open", undefined, `Push Notif Clicked: ${bdy}`);
      }

      if (data?.isLocal || data?.type === 'update') {
        return;
      }

      if (bdy) {
        showAndCacheNotification(bdy);
      }
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, [showAndCacheNotification]);

  /* ------------------------------------------------------------
   * 5️⃣ تهيئة Hook (نفسه يتأخر حتى انتهاء الشاشة الافتتاحية)
   * ------------------------------------------------------------ */
  useEffect(() => {
    isSplashDoneGlobal = splashDone;
    if (!splashDone) return;

    // 1️⃣ تسجيل التوكن وإرساله إلى الشيت فوراً (محاولة أولى)
    // نستخدم force=true عند الفتح الأول للتأكد من المزامنة
    registerForPushNotificationsAsync(true);

    // 2️⃣ مراقبة الاتصال بالإنترنت لإعادة المحاولة فوراً إذا عاد النت
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        console.log('🌐 Internet connection detected, triggering radical sync...');
        // عند عودة النت، نجبر النظام على المزامنة فوراً دون تأخير
        registerForPushNotificationsAsync(true);
      }
    });

    // 3️⃣ مراقبة حالة التطبيق (foreground/background)
    const appStateListener = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && appState.current !== 'active') {
        console.log('📱 App came to foreground, checking registration...');
        registerForPushNotificationsAsync(false); // فحص عادي عند العودة
      }
      appState.current = nextAppState;
    });

    // 4️⃣ تأخير الفحص الأول 3 ثوانٍ للرسائل الداخلية
    const initialDelay = setTimeout(() => {
      checkSheet(true);
    }, 3000);

    // فحص الإشعارات كل 10 ثوانٍ
    const intervalId = setInterval(() => checkSheet(false), 10000);

    // 5️⃣ مزامنة دورية للتأكد من الصحة (كل 4 ساعات بدلاً من ساعة)
    const syncIntervalId = setInterval(() => {
      console.log('💓 Foreground Heartbeat: Verifying token...');
      verifyAndReRegister();
    }, 4 * 60 * 60 * 1000);

    // 6️⃣ استماع لإشعارات Push الخارجية
    const cleanPush = listenExpoPush();

    return () => {
      unsubscribeNetInfo();
      appStateListener.remove();
      clearTimeout(initialDelay);
      clearInterval(intervalId);
      clearInterval(syncIntervalId);
      cleanPush();
      if (networkRetryInterval.current) {
        clearInterval(networkRetryInterval.current);
      }
    };
  }, [splashDone, checkSheet, listenExpoPush, verifyAndReRegister]);

  /* ------------------------------------------------------------
   * 6️⃣ إرجاع القيم للمكوّن الأعلى
   * ------------------------------------------------------------ */
  return {
    expoPushToken,
    notification,
    clearNotification: () => setNotification(null),
    forceReRegister: () => registerForPushNotificationsAsync(true), // دالة لإعادة التسجيل يدوياً
  };
}
