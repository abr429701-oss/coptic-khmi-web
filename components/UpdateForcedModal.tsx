import React, { useState } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, Dimensions, Platform, Alert } from 'react-native';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LanguageContext';
import { UpdateInfo } from '@/hooks/useAppUpdate';

const { width } = Dimensions.get('window');

interface UpdateForcedModalProps {
  updateInfo: UpdateInfo | null;
  onSkip?: () => void;
}

const TRANSLATIONS: any = {
  ar: {
    title: 'تحديث جديد متاح',
    current: 'إصدارك الحالي:',
    latest: 'الإصدار الجديد:',
    whatsNew: '✨ ما الجديد؟',
    btn: 'بدء التحميل والتحديث',
    downloading: 'جاري التحميل والتجهيز...',
    msg: 'يرجى التحديث الآن لضمان استقرار الخدمة والوصول للميزات الجديدة.',
    later: 'لاحقاً'
  },
  en: {
    title: 'Update Available',
    current: 'Current Version:',
    latest: 'New Version:',
    whatsNew: '✨ What\'s New?',
    btn: 'Download & Update Now',
    downloading: 'Downloading...',
    msg: 'Please update to reach new features and stability.',
    later: 'Update Later'
  },
  fr: {
    title: 'Mise à jour disponible',
    current: 'Version actuelle:',
    latest: 'Nouvelle version:',
    whatsNew: '✨ Quoi de neuf?',
    btn: 'Télécharger maintenant',
    downloading: 'Téléchargement...',
    msg: 'Veuillez mettre à jour pour plus de stabilité.',
    later: 'Plus tard'
  },
  de: {
    title: 'Update verfügbar',
    current: 'Aktuelle Version:',
    latest: 'Neue Version:',
    whatsNew: '✨ Was ist neu?',
    btn: 'Jetzt aktualisieren',
    downloading: 'Wird geladen...',
    msg: 'Bitte aktualisieren Sie für mehr Stabilität.',
    later: 'Später'
  }
};

export function UpdateForcedModal({ updateInfo, onSkip }: UpdateForcedModalProps) {
  const { isDark } = useTheme();
  const { lang } = useLang();
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const text = TRANSLATIONS[lang] || TRANSLATIONS.ar;
  const currentVersion = Constants.expoConfig?.version || '1.0.0';

  if (!updateInfo || !updateInfo.needsUpdate) return null;

  const handleUpdate = async () => {
    if (Platform.OS === 'web') {
      try {
        await WebBrowser.openBrowserAsync(updateInfo.updateUrl, {
          showTitle: true,
          enableBarCollapsing: true,
        });
      } catch (browserErr) {
        Alert.alert("خطأ", "برجاء التأكد من الرابط في الشيت.");
      }
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const filename = 'khmi_update.apk';
      const fileUri = (FileSystem as any).cacheDirectory + filename;
      let initialUrl = updateInfo.updateUrl.trim();

      // معالجة دروب بوكس
      if (initialUrl.includes('dropbox.com')) {
        initialUrl = initialUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '?dl=1');
      }

      // معالجة جوجل درايف
      const driveMatch = initialUrl.match(/\/(?:d|open|file\/d)\/([a-zA-Z0-9_-]+)/);
      const idMatch = initialUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const fileId = driveMatch ? driveMatch[1] : (idMatch ? idMatch[1] : null);

      let finalUrl = initialUrl;
      const downloadHeaders: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0'
      };

      if (fileId) {
        finalUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        downloadHeaders['Cookie'] = `download_warning_${fileId}=confirm`;
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        finalUrl,
        fileUri,
        { headers: downloadHeaders },
        (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            setDownloadProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
          } else {
            setDownloadProgress((prev) => (prev >= 0.95 ? 0.95 : prev + 0.02));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result && result.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        // لو الملف صغير جداً (صفحة HTML) نعتبره فشل ونحول للمتصفح/الدرايف
        if (fileInfo.exists && (fileInfo as any).size < 100000) {
          throw new Error("PROMPT_CHOOSER");
        }

        if (Platform.OS === 'android') {
          try {
            let IntentLauncher: any = null;
            try {
              IntentLauncher = require('expo-intent-launcher');
            } catch (e) { }

            if (IntentLauncher && IntentLauncher.startActivityAsync) {
              const contentUri = await FileSystem.getContentUriAsync(result.uri);
              await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                data: contentUri,
                flags: 1 | 268435456,
                type: 'application/vnd.android.package-archive',
              });
            } else {
              await Sharing.shareAsync(result.uri);
            }
          } catch (err) {
            await Sharing.shareAsync(result.uri);
          }
        }
      }
    } catch (error: any) {
      console.log("🔄 Falling back to Native Chooser...", error.message);
      // لو التحميل المباشر فشل، نفتح واجهة اختيار الإيميل الرسمية (درايف)
      try {
        await WebBrowser.openBrowserAsync(updateInfo.updateUrl, {
          showTitle: true,
          enableBarCollapsing: true,
        });
      } catch (browserErr) {
        Alert.alert("خطأ", "برجاء التأكد من الرابط في الشيت.");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal key={lang} transparent visible={true} animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: isDark ? '#111827' : '#FFFFFF' }]}>
          <View style={styles.header}>
            <MaterialIcons name="system-update" size={40} color="#FFF" />
          </View>

          <View style={styles.content}>
            <Text style={[styles.title, { color: isDark ? '#F9FAFB' : '#111827' }]}>{text.title}</Text>

            <View style={styles.versionEvolution}>
              <View style={[styles.compactCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                <Text style={[styles.compactNumber, { color: isDark ? '#FFF' : '#111827' }]}>{currentVersion}</Text>
              </View>

              <MaterialIcons name="arrow-forward" size={16} color="#8B0000" style={{ marginHorizontal: 12 }} />

              <View style={[styles.compactCard, { backgroundColor: '#8B0000' }]}>
                <Text style={[styles.compactNumber, { color: '#FFF' }]}>{updateInfo.latestVersion}</Text>
              </View>
            </View>

            <Text
              style={[styles.message, { color: isDark ? '#D1D5DB' : '#374151' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {updateInfo.message || text.msg}
            </Text>

            {updateInfo.whatsNew && updateInfo.whatsNew[lang as keyof typeof updateInfo.whatsNew] && (
              <View style={[styles.whatsNewBox, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
                <Text style={[styles.whatsNewTitle, { color: '#8B0000' }]}>{text.whatsNew}</Text>
                <Text style={[styles.whatsNewText, { color: isDark ? '#9CA3AF' : '#4B5563' }]}>
                  {updateInfo.whatsNew[lang as keyof typeof updateInfo.whatsNew]}
                </Text>
              </View>
            )}

            {isDownloading && (
              <View style={styles.progressWrapper}>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${downloadProgress * 100}%` }]} />
                </View>
                <Text style={styles.progressPercent}>{Math.round(downloadProgress * 100)}%</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.updateButton, isDownloading && { opacity: 0.7 }]}
              onPress={handleUpdate}
              disabled={isDownloading}
            >
              <Text style={styles.updateButtonText}>{isDownloading ? text.downloading : text.btn}</Text>
              {!isDownloading && <MaterialIcons name="file-download" size={20} color="#FFF" style={{ marginLeft: 8 }} />}
            </TouchableOpacity>

            {!updateInfo.isMandatory && !isDownloading && (
              <TouchableOpacity style={styles.laterButton} onPress={onSkip}>
                <Text style={styles.laterButtonText}>{text.later}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.footerContainer}>
              <Text style={[styles.footerText, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
                ⲭⲏⲙⲓ Coptic Dictionary
              </Text>
              <Text style={[styles.developerText, { color: '#8B0000' }]}>
                Ebram merzik
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  container: { width: width * 0.88, borderRadius: 30, overflow: 'hidden', elevation: 20 },
  header: { height: 70, backgroundColor: '#8B0000', justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  versionEvolution: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, justifyContent: 'center' },
  compactCard: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, alignItems: 'center', minWidth: 70 },
  compactNumber: { fontSize: 13, fontWeight: 'bold' },
  message: { fontSize: 16, textAlign: 'center', marginBottom: 15, width: '100%', fontFamily: 'Cairo_600SemiBold' },
  whatsNewBox: { width: '100%', padding: 15, borderRadius: 15, marginBottom: 20 },
  whatsNewTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  whatsNewText: { fontSize: 15, lineHeight: 22 },
  progressWrapper: { width: '100%', marginBottom: 20, alignItems: 'center' },
  progressBg: { width: '100%', height: 12, backgroundColor: '#E5E7EB', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#4CAF50' },
  progressPercent: { marginTop: 5, fontSize: 12, fontWeight: 'bold', color: '#8B0000' },
  updateButton: { flexDirection: 'row', width: '100%', backgroundColor: '#8B0000', height: 55, borderRadius: 18, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  updateButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  laterButton: { marginTop: 15, paddingHorizontal: 25, paddingVertical: 8, backgroundColor: '#475569', borderRadius: 10, elevation: 2 },
  laterButtonText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  footerContainer: { marginTop: 15, alignItems: 'center' },
  footerText: { fontFamily: 'Cinzel_400Regular', fontSize: 10, letterSpacing: 1 },
  developerText: { fontFamily: 'Cairo_700Bold', fontSize: 12, marginTop: 1, opacity: 0.8 }
});