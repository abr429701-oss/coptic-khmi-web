import { useState, useEffect, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { useLang } from '@/contexts/LanguageContext';
import { translations } from '@/contexts/LanguageContext'; // For background localization
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useAdmin } from '@/contexts/AdminContext';

const SHEET_ID = '1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY';
const APP_CONFIG_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=APP_CONFIG&range=A2:G&headers=0`;
const SKIP_DATA_KEY = '@khmi/skipped_update_info';
const DEFAULT_APP_LINK = 'https://play.google.com/store/apps/details?id=com.khmi.coptic';
export const BACKGROUND_UPDATE_TASK = 'BACKGROUND_UPDATE_CHECK';

export interface UpdateInfo {
  needsUpdate: boolean;
  isMandatory: boolean;
  updateUrl: string;
  latestVersion: string;
  message?: string;
  whatsNew?: {
    ar?: string;
    en?: string;
    fr?: string;
    de?: string;
  };
}

type UpdateCandidate = { version: string; url: string; source: 'sheet' | 'cloudflare' };

export function useAppUpdate() {
  const { t } = useLang();
  const { remoteSettings } = useAppConfig();
  const { isAdminMode } = useAdmin();
  const directUpdateUrl = String(remoteSettings.content.appUpdateUrl || '').trim();
  const cloudflareLatestVersion = String(remoteSettings.content.appLatestVersion || '').trim();
  const appUpdateAdminOnly = String(remoteSettings.content.appUpdateAdminOnly || 'false') === 'true';
  const cloudflareUpdateMode = String(remoteSettings.content.appUpdateMode || 'sheet').trim();
  const cloudflareWhatsNew = {
    ar: String(remoteSettings.content.appWhatsNewAr || '').trim(),
    en: String(remoteSettings.content.appWhatsNewEn || '').trim(),
    fr: String(remoteSettings.content.appWhatsNewFr || '').trim(),
    de: String(remoteSettings.content.appWhatsNewDe || '').trim(),
  };
  const directUpdateUrlRef = useRef(directUpdateUrl);
  const cloudflareLatestVersionRef = useRef(cloudflareLatestVersion);
  const appUpdateAdminOnlyRef = useRef(appUpdateAdminOnly);
  const isAdminModeRef = useRef(isAdminMode);
  const previousAdminModeRef = useRef(isAdminMode);
  isAdminModeRef.current = isAdminMode;
  const cloudflareUpdateModeRef = useRef(cloudflareUpdateMode);
  const cloudflareWhatsNewRef = useRef(cloudflareWhatsNew);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [currentAppLink, setCurrentAppLink] = useState<string>(appUpdateAdminOnly && !isAdminMode ? DEFAULT_APP_LINK : directUpdateUrl || DEFAULT_APP_LINK);
  const [canShow, setCanShow] = useState(false);
  const currentVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    // تحميل الرابط المخزن فوراً عند البداية
    const loadCachedLink = async () => {
      const cached = await AsyncStorage.getItem('@khmi/app_link');
      if (cached && !directUpdateUrlRef.current && !(appUpdateAdminOnlyRef.current && !isAdminModeRef.current)) setCurrentAppLink(cached);
    };
    loadCachedLink();

    const timer = setTimeout(() => {
      setCanShow(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const checkVersion = async () => {
    try {
      // إضافة رقم عشوائي للرابط لمنع الـ Caching وضمان دقة البيانات
      const cacheBuster = `&cb=${Date.now()}`;
      let rows: any[] = [];
      try {
        const response = await fetch(APP_CONFIG_URL + cacheBuster);
        if (!response.ok) throw new Error(`Version sheet returned ${response.status}`);
        const text = await response.text();
        const jsonString = text.replace(/^[^{]+/, '').replace(/\);?$/, '');
        const json = JSON.parse(jsonString);
        rows = json.table.rows || [];
      } catch (sheetError) {
        if (!cloudflareLatestVersionRef.current) throw sheetError;
        console.warn('Using the Cloudflare app version because the version sheet is unavailable.');
      }

      // احصل على آخر صف إصدار مكتمل من الجدول للمقارنة ومعلومات الإصدار العام.
      let lastRowIndex = rows.length - 1;
      while (lastRowIndex >= 0) {
        const rowData = rows[lastRowIndex].c;
        const hasSheetVersion = rowData && (rowData[0]?.v || rowData[0]?.f);
        const hasSheetUrl = rowData && (rowData[1]?.v || rowData[1]?.f);
        if (rowData && (hasSheetVersion || hasSheetUrl)) break;
        lastRowIndex--;
      }

      const data = lastRowIndex >= 0 ? rows[lastRowIndex].c : [];
      if (lastRowIndex >= 0) console.log(`📡 Fetched Config from Row ${lastRowIndex + 2}:`, data.map((d: any) => d?.v || d?.f));

      const sheetLatestVersion = (data[0]?.v || data[0]?.f) ? String(data[0]?.v || data[0]?.f).trim() : '';
      const sheetUpdateUrl = (data[1]?.v || data[1]?.f) ? String(data[1]?.v || data[1]?.f).trim() : '';
      const sheetForcedStatus = (data[2]?.v || data[2]?.f) ? String(data[2]?.v || data[2]?.f).trim() : 'اجباري';

      const sheetWhatsNewData = {
        ar: (data[3]?.v || data[3]?.f) ? String(data[3]?.v || data[3]?.f).trim() : '',
        en: (data[4]?.v || data[4]?.f) ? String(data[4]?.v || data[4]?.f).trim() : '',
        fr: (data[5]?.v || data[5]?.f) ? String(data[5]?.v || data[5]?.f).trim() : '',
        de: (data[6]?.v || data[6]?.f) ? String(data[6]?.v || data[6]?.f).trim() : '',
      };
      const canUseCloudflareRelease = !appUpdateAdminOnlyRef.current || isAdminModeRef.current;
      const cloudflareCandidate: UpdateCandidate | null = cloudflareLatestVersionRef.current && directUpdateUrlRef.current
        ? { version: cloudflareLatestVersionRef.current, url: directUpdateUrlRef.current, source: 'cloudflare' }
        : null;
      const sheetCandidate: UpdateCandidate | null = sheetLatestVersion
        ? { version: sheetLatestVersion, url: !cloudflareLatestVersionRef.current && canUseCloudflareRelease && directUpdateUrlRef.current ? directUpdateUrlRef.current : sheetUpdateUrl, source: 'sheet' }
        : null;
      let release: UpdateCandidate | null = sheetCandidate;
      if (cloudflareCandidate && canUseCloudflareRelease) {
        const sourceComparison = sheetCandidate ? compareVersions(cloudflareCandidate.version, sheetCandidate.version) : 1;
        if (!sheetCandidate || sourceComparison > 0 || (sourceComparison === 0 && cloudflareCandidate.url)) {
          release = cloudflareCandidate;
        }
      }

      if (!release) {
        const publicLink = sheetUpdateUrl || DEFAULT_APP_LINK;
        setCurrentAppLink(publicLink);
        await AsyncStorage.setItem('@khmi/app_link', publicLink);
        setUpdateInfo(null);
        return;
      }

      const latestVersion = release.version;
      const releaseUrl = release.url;
      const releaseIsCloudflare = release.source === 'cloudflare';
      const isMandatory = releaseIsCloudflare && cloudflareUpdateModeRef.current !== 'sheet'
        ? cloudflareUpdateModeRef.current === 'mandatory'
        : !sheetForcedStatus.includes('اختياري');
      const whatsNewData = releaseIsCloudflare
        ? {
            ar: cloudflareWhatsNewRef.current.ar || sheetWhatsNewData.ar,
            en: cloudflareWhatsNewRef.current.en || sheetWhatsNewData.en,
            fr: cloudflareWhatsNewRef.current.fr || sheetWhatsNewData.fr,
            de: cloudflareWhatsNewRef.current.de || sheetWhatsNewData.de,
          }
        : sheetWhatsNewData;
      const compare = compareVersions(currentVersion, latestVersion);

      console.log(`🌐 Check: Current[${currentVersion}] | Latest[${latestVersion}] from ${release.source} | Mandatory[${isMandatory}]`);

      const appLink = releaseUrl || DEFAULT_APP_LINK;
      setCurrentAppLink(appLink);
      await AsyncStorage.setItem('@khmi/app_link', appLink);

      if (compare < 0) {
        // لو التحديث متاح، نشوف موضوع الـ Skip
        const skipDataStr = await AsyncStorage.getItem(SKIP_DATA_KEY);
        if (skipDataStr) {
          const { version, timestamp } = JSON.parse(skipDataStr);

          // لو رقم النسخة في الشيت اختلف عن اللي متخزن في الـ Skip، امسح الـ Skip فوراً
          if (version !== latestVersion) {
            console.log(`✨ New version [${latestVersion}] detected! Clearing old skip [${version}]`);
            await AsyncStorage.removeItem(SKIP_DATA_KEY);
          } else if (!isMandatory) {
            // لو نفس النسخة وهي اختيارية، نطبق شرط الـ 48 ساعة
            const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            if ((now - timestamp) < TWO_DAYS_MS) {
              const hoursLeft = Math.round((TWO_DAYS_MS - (now - timestamp)) / (60 * 60 * 1000));
              console.log(`⏹️ Still skipping version [${version}] for ~${hoursLeft}h`);
              setUpdateInfo(null);
              return;
            }
          }
        }

        if (isMandatory) {
          console.log('🛡️ Mandatory Update! Ignoring all skips.');
        }

        console.log('🚀 Triggering Modal Display...');
        setUpdateInfo({
          needsUpdate: true,
          isMandatory: isMandatory,
          updateUrl: releaseUrl || 'https://play.google.com/store',
          latestVersion: latestVersion,
          whatsNew: whatsNewData,
        });

        // 🔥 حفظ رقم النسخة المكتشفة محلياً لدعم الأوفلاين التام
        await AsyncStorage.setItem('@khmi/cached_latest_version', latestVersion);
      } else {
        setUpdateInfo(null);
      }
    } catch (error) {
      console.warn('Update check failed:', error);
    }
  };

  useEffect(() => {
    const urlChanged = directUpdateUrlRef.current !== directUpdateUrl;
    const versionChanged = cloudflareLatestVersionRef.current !== cloudflareLatestVersion;
    const adminOnlyChanged = appUpdateAdminOnlyRef.current !== appUpdateAdminOnly;
    const modeChanged = cloudflareUpdateModeRef.current !== cloudflareUpdateMode;
    const whatsNewChanged = JSON.stringify(cloudflareWhatsNewRef.current) !== JSON.stringify(cloudflareWhatsNew);
    const adminModeChanged = previousAdminModeRef.current !== isAdminMode;
    if (!urlChanged && !versionChanged && !adminOnlyChanged && !modeChanged && !whatsNewChanged && !adminModeChanged) return;
    const previousUrl = directUpdateUrlRef.current;
    directUpdateUrlRef.current = directUpdateUrl;
    cloudflareLatestVersionRef.current = cloudflareLatestVersion;
    appUpdateAdminOnlyRef.current = appUpdateAdminOnly;
    cloudflareUpdateModeRef.current = cloudflareUpdateMode;
    cloudflareWhatsNewRef.current = cloudflareWhatsNew;
    previousAdminModeRef.current = isAdminMode;
    if (appUpdateAdminOnly && !isAdminMode) {
      setCurrentAppLink(DEFAULT_APP_LINK);
      void AsyncStorage.removeItem('@khmi/app_link').catch(() => {});
    } else if (urlChanged && directUpdateUrl) {
      setCurrentAppLink(directUpdateUrl);
      void AsyncStorage.setItem('@khmi/app_link', directUpdateUrl).catch(() => {});
    } else if (urlChanged && previousUrl) {
      setCurrentAppLink(DEFAULT_APP_LINK);
      void AsyncStorage.removeItem('@khmi/app_link').catch(() => {});
    }
    void checkVersion();
  }, [directUpdateUrl, cloudflareLatestVersion, appUpdateAdminOnly, cloudflareUpdateMode, cloudflareWhatsNew.ar, cloudflareWhatsNew.en, cloudflareWhatsNew.fr, cloudflareWhatsNew.de, isAdminMode]);

  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, 30000); // 30 ثانية كافية للتحديث التلقائي

    // تسجيل مهمة الخلفية للتحقق من التحديثات
    const registerBackgroundTask = async () => {
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_UPDATE_TASK);
        if (!isRegistered) {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_UPDATE_TASK, {
            minimumInterval: 60, // وضع الأدمن: دقيقة واحدة
            stopOnTerminate: false,
            startOnBoot: true,
          });
        }
      } catch (err) { console.log("Background Update Task Error", err); }
    };
    registerBackgroundTask();

    return () => clearInterval(interval);
  }, []);

  const skipUpdate = async () => {
    if (updateInfo) {
      // تخزين التوقيت والإصدار الحالي الذي تم تخطيه
      const skipData = {
        version: updateInfo.latestVersion,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(SKIP_DATA_KEY, JSON.stringify(skipData));
      setUpdateInfo(null);
    }
  };

  return { updateInfo: canShow ? updateInfo : null, currentAppLink, checkVersion, skipUpdate };
}


function compareVersions(v1: string, v2: string) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// -------------------------------------------------------------------
// 🔥 تعريف مهمة الخلفية للتحقق من التحديثات خارج التطبيق
// -------------------------------------------------------------------
// المهمة تم تعريفها بشكل عالمي في _layout.tsx لضمان الاستقرار
