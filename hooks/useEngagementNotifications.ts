import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useLang } from '@/contexts/LanguageContext';

const LAST_OPEN_KEY = "@engagement/last_open_v1";
const LAST_LEARN_KEY = "@engagement/last_learn_timestamp_v1";

/**
 * useEngagementNotifications: مسؤول عن جدولة إشعارات العودة (Retention) 
 * وتذكيرات التعلم بناءً على نشاط المستخدم.
 */
export function useEngagementNotifications() {
  const { t, lang } = useLang();

  useEffect(() => {
    const setupEngagement = async () => {
      try {
        const now = Date.now();
        await AsyncStorage.setItem(LAST_OPEN_KEY, now.toString());

        // جلب اسم المستخدم (الأول فقط) من التخزين - التعامل مع الحالة إذا لم يسجل بعد
        const fullName = (await AsyncStorage.getItem("@user_name") || "").trim();
        const firstName = fullName ? fullName.split(/\s+/)[0] : "";

        // 1. تنظيف الإشعارات القديمة لإعادة الجدولة من الصفر
        await Notifications.cancelScheduledNotificationAsync('retention-2-days');
        await Notifications.cancelScheduledNotificationAsync('retention-3-days');
        await Notifications.cancelScheduledNotificationAsync('resume-study-3-days');
        await Notifications.cancelScheduledNotificationAsync('resume-study-4-days');
        await Notifications.cancelScheduledNotificationAsync('update-reminder-offline');

        console.log("🔔 Scheduling engagement notifications...");

        // 2. إشعار "اشتقنا لك" - يظهر بعد 3 أيام من عدم النشاط وباسم الشخص الأول
        const retentionBody = firstName 
          ? `${firstName}، ${t.notification.retention.body}`
          : t.notification.retention.body;

        await Notifications.scheduleNotificationAsync({
          identifier: 'retention-3-days',
          content: {
            title: t.notification.retention.title,
            body: retentionBody,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            channelId: 'khmi-notifications',
            data: { type: 'retention', isLocal: true },
          } as any,
          trigger: {
            type: 'timeInterval',
            seconds: 3 * 24 * 60 * 60, // 3 أيام (اشتياق)
            repeats: false, 
          } as any,
        });

        // 3. إشعار "أكمل دراستك" - توحيد الهوية مع إشعارات جزء التعلم لمنع التكرار
        await Promise.all([
          Notifications.cancelScheduledNotificationAsync('learning-reminder'),
          Notifications.cancelScheduledNotificationAsync('resume-study-3-days'),
          Notifications.cancelScheduledNotificationAsync('resume-study-4-days'),
        ]);

        const lastFinishedName = await AsyncStorage.getItem('@coptic/last_finished_lesson_name') || "";
        const lastFinishedLvl = await AsyncStorage.getItem('@coptic/last_finished_level') || "";
        
        let resumeBody = t.notification.learningProgress.reminderBody;
        if (lastFinishedName) {
          resumeBody = lang === 'ar' 
            ? `ننتظرك لتكمل تفوقك بعد درس "${lastFinishedName}".. هيا لنستكمل باقي الدروس! ⲭⲏⲙⲓ` 
            : `We wait for you to continue your excellence after "${lastFinishedName}".. Let's finish the rest! ⲭⲏⲙⲓ`;
        } else if (lastFinishedLvl) {
          const levelText = lang === 'ar' ? `المستوى ${lastFinishedLvl}` : `Level ${lastFinishedLvl}`;
          resumeBody = lang === 'ar'
            ? `لقد مر وقت.. اشتقنا لتقدمك في ${levelText}. عد لإكمال الدروس!`
            : `It's been a while.. We miss your progress in ${levelText}. Come back to finish!`;
        }

        const finalResumeBody = firstName 
          ? `${firstName}، ${resumeBody}`
          : resumeBody;

        await Notifications.scheduleNotificationAsync({
          identifier: 'learning-reminder',
          content: {
            title: t.notification.learningProgress.reminderTitle,
            body: finalResumeBody,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.DEFAULT,
            channelId: 'khmi-notifications',
            data: { 
              type: 'learning_reminder', 
              isLocal: true,
              targetLevel: lastFinishedLvl 
            },
          } as any,
          trigger: {
            type: 'timeInterval',
            seconds: 4 * 24 * 60 * 60, // 4 أيام من آخر فتح للتطبيق
            repeats: false, 
          } as any,
        });
        console.log("✅ Engagement notifications scheduled successfully.");

        // 3. تذكير التحديث (الأوفلاين) - إذا كانت هناك نسخة جديدة مكتشفة مسبقاً
        const cachedLatest = await AsyncStorage.getItem('@khmi/cached_latest_version');
        const currentVersion = Constants.expoConfig?.version || '1.0.0';
        
        if (cachedLatest && cachedLatest !== currentVersion) {
          // مقارنة النسخ بشكل أدق
          const isNewer = (cv: string, lv: string) => {
            const c = cv.split('.').map(Number);
            const l = lv.split('.').map(Number);
            for (let i = 0; i < 3; i++) {
              if ((l[i] || 0) > (c[i] || 0)) return true;
              if ((l[i] || 0) < (c[i] || 0)) return false;
            }
            return false;
          };

          if (isNewer(currentVersion, cachedLatest)) {
            await Notifications.scheduleNotificationAsync({
              identifier: 'update-reminder-offline',
              content: {
                title: t.notification.update.notificationTitle,
                body: t.notification.update.notificationBody,
                sound: true,
                priority: Notifications.AndroidNotificationPriority.HIGH,
                channelId: 'khmi-notifications',
                data: { type: 'update', isLocal: true, version: cachedLatest },
              } as any,
              trigger: {
                type: 'timeInterval',
                seconds: 2 * 24 * 60 * 60, // يومين (48 ساعة) بدلاً من 30 ثانية لتجنب الإزعاج
                repeats: false,
              } as any,
            });
          }
        }
      } catch (e) {
        console.warn("Engagement Notifications Error:", e);
      }
    };

    setupEngagement();
  }, [lang, t]);
}
