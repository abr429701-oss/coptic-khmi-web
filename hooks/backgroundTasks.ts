import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// تعريف أسماء المهام
export const NOTIF_REGISTRATION_TASK = 'NOTIF_TOKEN_SYNC';
export const TOKEN_VERIFICATION_TASK = 'TOKEN_VERIFICATION_TASK';
export const BACKGROUND_UPDATE_TASK = 'BACKGROUND_UPDATE_CHECK';

/**
 * وظيفة المزامنة الأساسية (يتم استدعاؤها من المهام)
 */
async function runBackgroundSync() {
  try {
    // استيراد الدوال ديناميكياً لتجنب مشاكل الحلقات التكرارية (Circular Dependencies)
    const { syncDeviceTokenWithSheet } = require('./useExpoPushNotifications');
    
    console.log('🌀 Background Task Execution: Attempting Sync...');
    const success = await syncDeviceTokenWithSheet(true);
    
    return success 
      ? BackgroundFetch.BackgroundFetchResult.NewData 
      : BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (error) {
    console.error('❌ Background Sync Error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

// 1️⃣ مهمة مزامنة التوكين الرئيسية
if (!TaskManager.isTaskDefined(NOTIF_REGISTRATION_TASK)) {
  TaskManager.defineTask(NOTIF_REGISTRATION_TASK, runBackgroundSync);
}

// 2️⃣ مهمة التحقق من صحة التوكين
if (!TaskManager.isTaskDefined(TOKEN_VERIFICATION_TASK)) {
  TaskManager.defineTask(TOKEN_VERIFICATION_TASK, runBackgroundSync);
}

// 3️⃣ مهمة تحديث التطبيق (مدمجة مع المزامنة)
if (!TaskManager.isTaskDefined(BACKGROUND_UPDATE_TASK)) {
  TaskManager.defineTask(BACKGROUND_UPDATE_TASK, async () => {
    await runBackgroundSync(); // سجل التوكين أولاً
    return BackgroundFetch.BackgroundFetchResult.NewData;
  });
}

/**
 * وظيفة لتسجيل كافة المهام مع نظام التشغيل
 */
export async function initAllBackgroundTasks() {
  if (Platform.OS === 'web') return;
  
  try {
    // تسجيل مهمة المزامنة
    await BackgroundFetch.registerTaskAsync(NOTIF_REGISTRATION_TASK, {
      minimumInterval: 15, // 15 دقيقة (أقل حد مسموح)
      stopOnTerminate: false,
      startOnBoot: true,
    });

    // تسجيل مهمة التحديث
    await BackgroundFetch.registerTaskAsync(BACKGROUND_UPDATE_TASK, {
      minimumInterval: 30,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    
    console.log('🚀 All Background Tasks Registered and Ready');
  } catch (err) {
    console.warn('⚠️ Failed to register background tasks:', err);
  }
}
