import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useLang } from "@/contexts/LanguageContext";
import { useAppConfig } from "@/contexts/AppConfigContext";

const REMINDER_TYPE = "audio_download_reminder";
const REMINDER_CHANNEL_ID = "audio-download-reminder-channel";
const REMINDER_ANCHOR_KEY = "@coptic/audio-download-reminder-next-local-date-v1";
const REMINDER_RESPONSE_KEY = "@coptic/audio-download-reminder-last-response-v1";
const SCHEDULE_AHEAD_COUNT = 8;
const RESCHEDULE_THRESHOLD = 5;
const DEFAULT_REMINDER_HOUR = 14;

function parseScheduleTime(value: string): [number, number] {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return [DEFAULT_REMINDER_HOUR, 0];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? [hour, minute] : [DEFAULT_REMINDER_HOUR, 0];
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string | null, hour: number, minute: number): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function getFirstReminderDate(now: Date, savedLocalDate: string | null, hour: number, minute: number): Date {
  const todayAtReminderTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  let first = parseLocalDate(savedLocalDate, hour, minute);

  if (!first) {
    first = todayAtReminderTime.getTime() > now.getTime()
      ? todayAtReminderTime
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute, 0, 0);
  }

  while (first.getTime() <= now.getTime()) {
    first = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7, hour, minute, 0, 0);
  }
  return first;
}

async function cancelAudioReminders(): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter((item) => item.content.data?.type === REMINDER_TYPE)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
  );
}

interface UseAudioDownloadReminderOptions {
  audioDownloadedCount: number;
  audioTotalCount: number;
  enabled: boolean;
  onOpenSync: () => void;
}

export function useAudioDownloadReminder({
  audioDownloadedCount,
  audioTotalCount,
  enabled,
  onOpenSync,
}: UseAudioDownloadReminderOptions): void {
  const { lang, t } = useLang();
  const { remoteSettings } = useAppConfig();
  const handledResponseRef = useRef<string | null>(null);
  const isSchedulingRef = useRef(false);

  const mode = audioDownloadedCount <= 0
    ? "first"
    : audioDownloadedCount < audioTotalCount
      ? "continue"
      : "complete";
  const scheduleTime = mode === "first"
    ? remoteSettings.notificationSchedule.audioFirstDownload
    : remoteSettings.notificationSchedule.audioContinueDownload;
  const [reminderHour, reminderMinute] = parseScheduleTime(scheduleTime);

  const scheduleReminder = useCallback(async () => {
    if (!enabled || isSchedulingRef.current) return;
    isSchedulingRef.current = true;
    try {
      if (mode === "complete" || audioTotalCount <= 0) {
        await cancelAudioReminders();
        await AsyncStorage.removeItem(REMINDER_ANCHOR_KEY).catch(() => undefined);
        console.log(
          `[NotificationSchedule] Audio download reminder: not scheduled; mode=${mode}; ` +
          `downloaded=${audioDownloadedCount}/${audioTotalCount}; pending reminders canceled.`
        );
        return;
      }

      // useDailyWord requests notification permission on first launch; read its result here
      // without presenting a second permission prompt.
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== "granted") {
        await cancelAudioReminders();
        console.warn(
          `[NotificationSchedule] Audio download reminder: permission=${permissions.status}; ` +
          'pending reminders canceled, none scheduled.'
        );
        return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
          name: t.notification.audioDownloadReminder.title,
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
          sound: "notification.wav",
          enableLights: true,
          enableVibrate: true,
          showBadge: true,
        });
      }

      const pending = await Notifications.getAllScheduledNotificationsAsync();
      const existing = pending.filter((item) => item.content.data?.type === REMINDER_TYPE);
      const compatible = existing.filter((item) =>
        item.content.data?.mode === mode && item.content.data?.lang === lang && item.content.data?.scheduleTime === scheduleTime
      );
      if (compatible.length >= RESCHEDULE_THRESHOLD) {
        console.log(
          `[NotificationSchedule] Audio download reminder: kept ${compatible.length} pending reminders; ` +
          `mode=${mode}; downloaded=${audioDownloadedCount}/${audioTotalCount}; no reschedule needed.`
        );
        return;
      }

      await Promise.all(existing.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));

      const now = new Date();
      const savedAnchor = await AsyncStorage.getItem(REMINDER_ANCHOR_KEY);
      const firstDate = getFirstReminderDate(now, savedAnchor, reminderHour, reminderMinute);
      await AsyncStorage.setItem(REMINDER_ANCHOR_KEY, formatLocalDate(firstDate));

      const reminderText = t.notification.audioDownloadReminder;
      const body = mode === "first" ? reminderText.firstDownload : reminderText.continueDownload;

      for (let index = 0; index < SCHEDULE_AHEAD_COUNT; index += 1) {
        const date = new Date(
          firstDate.getFullYear(),
          firstDate.getMonth(),
          firstDate.getDate() + index * 7,
          reminderHour,
          reminderMinute,
          0,
          0
        );
        await Notifications.scheduleNotificationAsync({
          identifier: `audio-download-reminder-${formatLocalDate(date)}`,
          content: {
            title: reminderText.title,
            body,
            data: { type: REMINDER_TYPE, mode, lang, scheduleTime },
            sound: "notification.wav",
            priority: Notifications.AndroidNotificationPriority.MAX,
            channelId: REMINDER_CHANNEL_ID,
          } as any,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
            channelId: REMINDER_CHANNEL_ID,
          },
        });
      }
      console.log(
        `[NotificationSchedule] Audio download reminder: scheduled ${SCHEDULE_AHEAD_COUNT}; ` +
        `mode=${mode}; downloaded=${audioDownloadedCount}/${audioTotalCount}; ` +
        `first=${firstDate.toLocaleString()}; repeats weekly at ${scheduleTime}; remote schedule applied.`
      );
    } catch (error) {
      console.warn('[NotificationSchedule] Audio download reminder scheduling failed:', error);
    } finally {
      isSchedulingRef.current = false;
    }
  }, [audioTotalCount, enabled, lang, mode, scheduleTime, reminderHour, reminderMinute, t]);

  const handleResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    if (response.notification.request.content.data?.type !== REMINDER_TYPE) return;

    const requestId = response.notification.request.identifier;
    const notificationDate = response.notification.date;
    const responseKey = `${requestId}:${notificationDate}`;
    if (handledResponseRef.current === responseKey) return;
    handledResponseRef.current = responseKey;

    try {
      if (await AsyncStorage.getItem(REMINDER_RESPONSE_KEY) === responseKey) return;
      await AsyncStorage.setItem(REMINDER_RESPONSE_KEY, responseKey);
    } catch {
      // Still open the sync panel if local response de-duplication is unavailable.
    }
    onOpenSync();
  }, [onOpenSync]);

  useEffect(() => {
    if (!enabled) {
      console.log('[NotificationSchedule] Audio download reminder: waiting for splash/setup to finish.');
      return;
    }

    const initialTimer = setTimeout(() => void scheduleReminder(), 3500);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.content.data?.type === REMINDER_TYPE) {
        setTimeout(() => void scheduleReminder(), 1200);
      }
    });
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setTimeout(() => void scheduleReminder(), 800);
    });

    let mounted = true;
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (mounted && response) void handleResponse(response);
      })
      .catch((error) => console.warn("Could not restore audio reminder response:", error));

    return () => {
      mounted = false;
      clearTimeout(initialTimer);
      responseSubscription.remove();
      receivedSubscription.remove();
      appStateSubscription.remove();
    };
  }, [enabled, handleResponse, scheduleReminder]);
}
