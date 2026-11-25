import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logActivity } from '@/hooks/useUserTracking';
import { useLang, translateTerm, type Lang } from '@/contexts/LanguageContext';
import { useSplash } from '@/contexts/SplashContext';
import type { DictionaryEntry } from './useDictionary';
import { loadEntries } from './useOfflineStorage';
import { buildDateInfo, gregorianToCoptic } from '@/lib/coptic-calendar';
import { useAppConfig } from '@/contexts/AppConfigContext';

const DAILY_WORD_ENTRIES_KEY = '@coptic/entries_v7';

async function loadDailyWordEntries(): Promise<DictionaryEntry[] | null> {
  try {
    const json = await AsyncStorage.getItem(DAILY_WORD_ENTRIES_KEY);
    if (json) {
      const entries: unknown = JSON.parse(json);
      if (Array.isArray(entries) && entries.length > 0) {
        return entries as DictionaryEntry[];
      }
    }
  } catch (error) {
    console.warn('Failed to read daily-word entries from AsyncStorage:', error);
  }

  // Current dictionary saves are file-first and clear this AsyncStorage key.
  return loadEntries();
}

const NOTIF_HOUR = 10;
const NOTIF_MINUTE = 30;
const DAYS_TO_SCHEDULE = 30;
const RESCHEDULE_THRESHOLD = 7;
const CHANNEL_ID = 'daily-word-channel';
const COPTIC_MONTH_CHANNEL_ID = 'coptic-month-start-channel';
const COPTIC_MONTH_NOTIFICATION_TYPE = 'coptic_month_start';
const COPTIC_MONTHS_TO_SCHEDULE = 13;
const COPTIC_MONTH_NOTIFICATION_TITLE: Record<Lang, string> = {
  ar: 'بداية شهر قبطي جديد',
  en: 'A new Coptic month begins',
  fr: 'Début d’un nouveau mois copte',
  de: 'Beginn eines neuen koptischen Monats',
};
const COPTIC_NEW_YEAR_NOTIFICATION_TITLE: Record<Lang, string> = {
  ar: 'بداية السنة القبطية',
  en: 'Coptic New Year',
  fr: 'Nouvel An copte',
  de: 'Koptisches Neujahr',
};
const GREGORIAN_NEW_YEAR_NOTIFICATION_TYPE = 'gregorian_new_year';
const GREGORIAN_NEW_YEAR_CHANNEL_ID = 'gregorian-new-year-channel';
const GREGORIAN_NEW_YEARS_TO_SCHEDULE = 5;
const GREGORIAN_NEW_YEAR_NOTIFICATION_TITLE: Record<Lang, string> = {
  ar: 'العام الميلادي الجديد',
  en: 'Happy New Year',
  fr: 'Bonne année',
  de: 'Frohes neues Jahr',
};

function toArabicNumerals(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
}

function buildCopticMonthNotificationBody(
  dateInfo: ReturnType<typeof buildDateInfo>,
  lang: Lang,
  isCopticNewYear: boolean,
): string {
  const { dayName, copticMonth, copticYear, pharaonicYear } = dateInfo;
  if (lang === 'ar') {
    if (isCopticNewYear) {
      return `اليوم ${dayName} بداية السنة القبطية، 1 ${copticMonth} لعام ${toArabicNumerals(pharaonicYear)} بالتاريخ المصري القديم ولعام ${copticYear} للشهداء. كل عام وأنتم بخير، مستخدمي ⲭⲏⲙⲓ الأعزاء. 🎉`;
    }
    return `اليوم ${dayName} بداية شهر ${copticMonth}، 1 ${copticMonth} لعام ${toArabicNumerals(pharaonicYear)} بالتاريخ المصري القديم ولعام ${copticYear} للشهداء. كل شهر وأنتم بخير، مستخدمي ⲭⲏⲙⲓ الأعزاء. 🌿`;
  }
  if (isCopticNewYear && lang === 'fr') {
    return `Aujourd’hui, ${dayName}, commence l’année copte : le 1 ${copticMonth} de l’an ${pharaonicYear} selon le calendrier égyptien ancien et de l’an ${copticYear} des Martyrs. Bonne année copte, chers utilisateurs de ⲭⲏⲙⲓ ! 🎉`;
  }
  if (isCopticNewYear && lang === 'de') {
    return `Heute, am ${dayName}, beginnt das koptische Jahr: der 1. ${copticMonth} im Jahr ${pharaonicYear} des altägyptischen Kalenders und im Jahr ${copticYear} der Märtyrer. Frohes koptisches Neujahr, liebe Nutzer von ⲭⲏⲙⲓ! 🎉`;
  }
  if (isCopticNewYear) {
    return `Today, ${dayName}, marks the beginning of the Coptic year: 1 ${copticMonth}, year ${pharaonicYear} in the Ancient Egyptian calendar and year ${copticYear} of the Martyrs. Happy Coptic New Year to our dear ⲭⲏⲙⲓ users. 🎉`;
  }
  if (lang === 'fr') {
    return `Aujourd’hui, ${dayName}, commence le mois de ${copticMonth} : le 1 ${copticMonth} de l’an ${pharaonicYear} selon le calendrier égyptien ancien et de l’an ${copticYear} des Martyrs. Bon début de mois à vous, chers utilisateurs de ⲭⲏⲙⲓ. 🌿`;
  }
  if (lang === 'de') {
    return `Heute, am ${dayName}, beginnt der Monat ${copticMonth}: der 1. ${copticMonth} im Jahr ${pharaonicYear} des altägyptischen Kalenders und im Jahr ${copticYear} der Märtyrer. Einen schönen Monatsbeginn, liebe Nutzer von ⲭⲏⲙⲓ. 🌿`;
  }
  return `Today, ${dayName}, begins the month of ${copticMonth}. 1 ${copticMonth}, year ${pharaonicYear} in the Ancient Egyptian calendar and year ${copticYear} of the Martyrs. Happy new month to our dear ⲭⲏⲙⲓ users. 🌿`;
}

function parseScheduleTime(value: string, fallbackHour: number, fallbackMinute: number): [number, number] {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return [fallbackHour, fallbackMinute];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? [hour, minute] : [fallbackHour, fallbackMinute];
}

function getUpcomingCopticMonthStarts(now: Date, lang: Lang, monthTime: string, newYearTime: string) {
  const starts: { date: Date; dateInfo: ReturnType<typeof buildDateInfo>; copticMonthNumber: number }[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = 0; offset <= 420 && starts.length < COPTIC_MONTHS_TO_SCHEDULE; offset += 1) {
    const candidate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12, 0, 0, 0);
    const copticDate = gregorianToCoptic(candidate.getFullYear(), candidate.getMonth() + 1, candidate.getDate(), lang);
    const dateInfo = buildDateInfo(candidate, lang);
    if (dateInfo.copticDay !== 1) continue;
    const [hour, minute] = parseScheduleTime(copticDate.month === 1 ? newYearTime : monthTime, 7, 0);
    const date = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), hour, minute, 0, 0);
    if (date.getTime() > now.getTime()) starts.push({ date, dateInfo: buildDateInfo(date, lang), copticMonthNumber: copticDate.month });
  }
  return starts;
}

function getUpcomingGregorianNewYearDates(now: Date, scheduleTime: string) {
  const dates: Date[] = [];
  const [hour, minute] = parseScheduleTime(scheduleTime, 0, 0);
  for (let year = now.getFullYear(); dates.length < GREGORIAN_NEW_YEARS_TO_SCHEDULE; year += 1) {
    const date = new Date(year, 0, 1, hour, minute, 0, 0);
    if (date.getTime() < now.getTime()) continue;
    dates.push(date);
  }
  return dates;
}

function buildGregorianNewYearNotificationBody(year: number, lang: Lang): string {
  if (lang === 'ar') {
    return `بداية العام الميلادي الجديد، 1 يناير ${year}. كل عام وأنتم بخير، مستخدمي ⲭⲏⲙⲓ الأعزاء. 🎆`;
  }
  if (lang === 'fr') {
    return `Début de la nouvelle année grégorienne, le 1er janvier ${year}. Bonne année à nos chers utilisateurs de ⲭⲏⲙⲓ. 🎆`;
  }
  if (lang === 'de') {
    return `Beginn des neuen gregorianischen Jahres, 1. Januar ${year}. Frohes neues Jahr, liebe Nutzer von ⲭⲏⲙⲓ. 🎆`;
  }
  return `The new Gregorian year begins on January 1, ${year}. Happy New Year to our dear ⲭⲏⲙⲓ users. 🎆`;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useDailyWord(onSelectEntry?: (entry: DictionaryEntry) => void) {
  const { lang, t } = useLang();
  const { splashDone } = useSplash();
  const { remoteSettings } = useAppConfig();
  const notificationSchedule = remoteSettings.notificationSchedule;
  const lastLangRef = useRef<string | null>(null);
  const lastScheduleSignatureRef = useRef<string | null>(null);
  const isSchedulingRef = useRef(false);

  // ─── معالجة الضغط على الإشعار ───────────────────────────────────────────────
  const handleResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    const entryId = data?.entryId;
    if (entryId && onSelectEntry) {
      try {
        const entries = await loadDailyWordEntries();
        if (entries) {
          const entry = entries.find(e => e.id === entryId);
          if (entry) onSelectEntry(entry);
          else console.warn("Entry not found:", entryId);
        }
      } catch (e) {
        console.warn("Failed to open entry from notification", e);
      }
    }
  }, [onSelectEntry]);

  // ─── الاستماع للضغط على الإشعار ─────────────────────────────────────────────
  useEffect(() => {
    if (!splashDone) return;

    const checkInitial = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response) {
          const data = response.notification.request.content.data;
          logActivity("notif_click_daily", undefined, `Opened Daily Word: ${data?.entryId || "unknown"}`);
          setTimeout(() => handleResponse(response), 500);
        }
      } catch (e) {
        console.warn("getLastNotificationResponseAsync is not available:", e);
      }
    };
    checkInitial();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'daily_word') {
        logActivity("notif_click_daily", undefined, `Clicked Daily Word: ${data?.entryId || "unknown"}`);
      }
      handleResponse(response);
    });

    return () => subscription.remove();
  }, [handleResponse, splashDone]);

  // ─── بناء نص الإشعار ─────────────────────────────────────────────────────────
  const buildNotificationBody = useCallback((entry: DictionaryEntry): string => {
    let meaning = entry.arabic || "";
    if (lang === 'en') meaning = entry.english || entry.arabic || "";
    else if (lang === 'fr') meaning = entry.french || entry.arabic || "";
    else if (lang === 'de') meaning = entry.german || entry.arabic || "";

    const firstMeaning = meaning.split(/[،,;\/\n]/)[0].trim();
    const origin = translateTerm(entry.origin, lang);
    const typeValue = entry.wordType || entry.gender;
    const translatedType = translateTerm(typeValue, lang);

    let body = `${t.notification.labels.word}: ${entry.coptic}\n`;
    body += `${t.notification.labels.meaning}: ${firstMeaning}`;
    if (translatedType) body += `\n${t.notification.labels.type}: ${translatedType}`;
    if (origin) body += `\n${t.notification.labels.origin}: ${origin}`;

    return body;
  }, [lang, t]);

  const scheduleCopticMonthNotifications = useCallback(async (forceReschedule = false) => {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const existing = pending.filter((notification) =>
      notification.content.data?.type === COPTIC_MONTH_NOTIFICATION_TYPE
    );
    if (!forceReschedule && existing.length >= RESCHEDULE_THRESHOLD) {
      console.log(`[NotificationSchedule] Coptic months/year: kept ${existing.length} pending notifications; no reschedule needed.`);
      return;
    }

    const now = new Date();
    const monthStarts = getUpcomingCopticMonthStarts(now, lang, notificationSchedule.copticMonth, notificationSchedule.copticNewYear);
    if (monthStarts.length === 0) {
      console.log('[NotificationSchedule] Coptic months/year: no upcoming dates found; nothing scheduled.');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(COPTIC_MONTH_CHANNEL_ID, {
        name: COPTIC_MONTH_NOTIFICATION_TITLE[lang],
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'notification.wav',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });
    }

    await Promise.all(existing.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier)
    ));

    for (const { date, dateInfo, copticMonthNumber } of monthStarts) {
      const secondsUntil = Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 1000));
      const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const isCopticNewYear = copticMonthNumber === 1;
      await Notifications.scheduleNotificationAsync({
        identifier: `coptic-month-start-${dateKey}`,
        content: {
          title: isCopticNewYear
            ? COPTIC_NEW_YEAR_NOTIFICATION_TITLE[lang]
            : COPTIC_MONTH_NOTIFICATION_TITLE[lang],
          body: buildCopticMonthNotificationBody(dateInfo, lang, isCopticNewYear),
          data: {
            type: COPTIC_MONTH_NOTIFICATION_TYPE,
            copticMonth: dateInfo.copticMonth,
            copticMonthNumber,
            copticYear: dateInfo.copticYear,
            pharaonicYear: dateInfo.pharaonicYear,
          },
          sound: 'notification.wav',
          priority: Notifications.AndroidNotificationPriority.MAX,
          channelId: COPTIC_MONTH_CHANNEL_ID,
        } as any,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntil,
          repeats: false,
        },
      });
    }
    const copticNewYearCount = monthStarts.filter((item) => item.copticMonthNumber === 1).length;
    console.log(
      `[NotificationSchedule] Coptic months/year: scheduled ${monthStarts.length}; month=${notificationSchedule.copticMonth}, copticYear=${notificationSchedule.copticNewYear}; ` +
      `Coptic New Year notices included=${copticNewYearCount}; ` +
      `next=${monthStarts[0].date.toLocaleString()} (${monthStarts[0].dateInfo.copticMonth}).`
    );
  }, [lang, notificationSchedule.copticMonth, notificationSchedule.copticNewYear]);

  const scheduleGregorianNewYearNotifications = useCallback(async (forceReschedule = false) => {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const existing = pending.filter((notification) =>
      notification.content.data?.type === GREGORIAN_NEW_YEAR_NOTIFICATION_TYPE
    );
    if (!forceReschedule && existing.length >= GREGORIAN_NEW_YEARS_TO_SCHEDULE) {
      console.log(`[NotificationSchedule] Gregorian New Year: kept ${existing.length} pending notifications; no reschedule needed.`);
      return;
    }

    const now = new Date();
    const newYearDates = getUpcomingGregorianNewYearDates(now, notificationSchedule.gregorianNewYear);
    if (newYearDates.length === 0) {
      console.log('[NotificationSchedule] Gregorian New Year: no upcoming dates found; nothing scheduled.');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(GREGORIAN_NEW_YEAR_CHANNEL_ID, {
        name: GREGORIAN_NEW_YEAR_NOTIFICATION_TITLE[lang],
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'notification.wav',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });
    }

    await Promise.all(existing.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier)
    ));

    for (const date of newYearDates) {
      const secondsUntil = Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 1000));
      const year = date.getFullYear();
      await Notifications.scheduleNotificationAsync({
        identifier: `gregorian-new-year-${year}`,
        content: {
          title: GREGORIAN_NEW_YEAR_NOTIFICATION_TITLE[lang],
          body: buildGregorianNewYearNotificationBody(year, lang),
          data: {
            type: GREGORIAN_NEW_YEAR_NOTIFICATION_TYPE,
            gregorianYear: year,
          },
          sound: 'notification.wav',
          priority: Notifications.AndroidNotificationPriority.MAX,
          channelId: GREGORIAN_NEW_YEAR_CHANNEL_ID,
        } as any,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntil,
          repeats: false,
        },
      });
    }
    console.log(
      `[NotificationSchedule] Gregorian New Year: scheduled ${newYearDates.length} at ${notificationSchedule.gregorianNewYear}; ` +
      `years=${newYearDates.map((date) => date.getFullYear()).join(', ')}.`
    );
  }, [lang, notificationSchedule.gregorianNewYear]);

  // ─── حساب الثواني حتى الساعة 12:40 صباحاً ليوم معين ───────────────────────
  const getSecondsUntil = (daysFromNow: number, hour: number, minute: number): number => {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + daysFromNow,
      hour,
      minute,
      0,
      0
    );
    const diff = Math.floor((target.getTime() - now.getTime()) / 1000);
    return Math.max(diff, 1); // لا تكن صفراً أو سالباً
  };

  // ─── الجدولة الرئيسية ────────────────────────────────────────────────────────
  const scheduleDailyWords = useCallback(async (forceReschedule = false) => {
    if (isSchedulingRef.current) return;
    isSchedulingRef.current = true;

    try {
      const [dailyHour, dailyMinute] = parseScheduleTime(notificationSchedule.dailyWord, NOTIF_HOUR, NOTIF_MINUTE);
      console.log(`[NotificationSchedule] Home startup: begin scheduling; forceReschedule=${forceReschedule}; language=${lang}; daily=${notificationSchedule.dailyWord}.`);

      // 1. طلب الصلاحيات
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn(`[NotificationSchedule] Permission not granted (status=${finalStatus}); scheduling stopped.`);
        return;
      }

      // 2. إنشاء القناة على Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: t.notification.dailyWord,
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'notification.wav',
          enableLights: true,
          enableVibrate: true,
          showBadge: true,
        });
      }

      try {
        await scheduleCopticMonthNotifications(forceReschedule);
      } catch (error) {
        console.warn('[NotificationSchedule] Coptic month/year scheduling failed:', error);
      }

      try {
        await scheduleGregorianNewYearNotifications(forceReschedule);
      } catch (error) {
        console.warn('[NotificationSchedule] Gregorian New Year scheduling failed:', error);
      }

      // 3. تحقق من عدد الإشعارات المتبقية إذا لم يكن إعادة جدولة إجبارية
      if (!forceReschedule) {
        const pending = await Notifications.getAllScheduledNotificationsAsync();
        const dailyPending = pending.filter(n => n.content.data?.type === 'daily_word');
        if (dailyPending.length >= RESCHEDULE_THRESHOLD) {
          console.log(`[NotificationSchedule] Daily word: kept ${dailyPending.length} pending notifications; no reschedule needed.`);
          return;
        }
        console.log(`[NotificationSchedule] Daily word: only ${dailyPending.length} pending; rescheduling.`);
      }

      // 4. تأكد من وجود القاموس قبل إلغاء أي إشعارات مجدولة
      const entries = await loadDailyWordEntries();
      if (!entries?.length) {
        console.warn('[NotificationSchedule] Daily word: no local dictionary entries; nothing scheduled.');
        return;
      }

      // 5. إلغاء الإشعارات القديمة فقط (من نوع daily_word)
      const allPending = await Notifications.getAllScheduledNotificationsAsync();
      const oldIds = allPending
        .filter(n => n.content.data?.type === 'daily_word')
        .map(n => n.identifier);
      await Promise.all(oldIds.map(id => Notifications.cancelScheduledNotificationAsync(id)));

      // 6. حساب نقطة البداية
      // لو الوقت الحالي قبل 12:40 صباحاً → ابدأ من اليوم (offset=0)
      // لو الوقت الحالي بعد 12:40 صباحاً → ابدأ من الغد (offset=1)
      const now = new Date();
      const todayTarget = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(),
        dailyHour, dailyMinute, 0, 0
      );
      const startOffset = now < todayTarget ? 0 : 1;

      // 7. خلط الكلمات وجدولتها
      const shuffled = [...entries].sort(() => 0.5 - Math.random());

      for (let i = 0; i < DAYS_TO_SCHEDULE; i++) {
        const entry = shuffled[i % shuffled.length];
        const dayOffset = startOffset + i;
        const secondsUntil = getSecondsUntil(dayOffset, dailyHour, dailyMinute);

        await Notifications.scheduleNotificationAsync({
          identifier: `daily-word-day-${i}`,
          content: {
            title: t.notification.dailyWord,
            body: buildNotificationBody(entry),
            data: {
              entryId: entry.id,
              isLocal: true,
              type: 'daily_word',
            },
            sound: 'notification.wav',
            priority: Notifications.AndroidNotificationPriority.MAX,
            channelId: CHANNEL_ID,
          } as any,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: secondsUntil,
            repeats: false,
          },
        });
      }

      lastLangRef.current = lang;
      console.log(
        `[NotificationSchedule] Daily word: scheduled ${DAYS_TO_SCHEDULE}; ` +
        `first fires ${startOffset === 0 ? 'today' : 'tomorrow'} at ${String(dailyHour).padStart(2, '0')}:${String(dailyMinute).padStart(2, '0')} local time.`
      );

    } catch (e: any) {
      console.error('[NotificationSchedule] Daily/calendar scheduling failed:', e);
    } finally {
      isSchedulingRef.current = false;
    }
  }, [lang, t, buildNotificationBody, scheduleCopticMonthNotifications, scheduleGregorianNewYearNotifications, notificationSchedule.dailyWord]);

  // ─── تشغيل الجدولة ───────────────────────────────────────────────────────────
  const scheduleSignature = JSON.stringify(notificationSchedule);
  useEffect(() => {
    if (!splashDone) return;

    const firstRun = lastLangRef.current === null;
    const langChanged = !firstRun && lastLangRef.current !== lang;
    const scheduleChanged = lastScheduleSignatureRef.current !== null && lastScheduleSignatureRef.current !== scheduleSignature;
    if (scheduleChanged) console.log(`[NotificationSchedule] Remote schedule: applying updated schedule; old=${lastScheduleSignatureRef.current}; new=${scheduleSignature}.`);
    else console.log(`[NotificationSchedule] Remote schedule: using ${lastScheduleSignatureRef.current === null ? 'initial/cached' : 'unchanged'} schedule ${scheduleSignature}.`);
    lastScheduleSignatureRef.current = scheduleSignature;

    if (firstRun || langChanged || scheduleChanged) {
      const timer = setTimeout(() => scheduleDailyWords(true), 1500);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => scheduleDailyWords(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [lang, splashDone, scheduleDailyWords, scheduleSignature]);
}
