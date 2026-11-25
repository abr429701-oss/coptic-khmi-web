import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import {
  getLastSync,
  loadAudioIndex,
  loadEntries,
  loadPendingQueue,
} from "@/hooks/useOfflineStorage";

interface LocalDiagnostics {
  checkedAt: string;
  entryCount: number;
  duplicateIds: number;
  duplicateCopticWords: number;
  missingCopticWords: number;
  missingArabicTranslations: number;
  missingEnglishTranslations: number;
  missingFrenchTranslations: number;
  missingGermanTranslations: number;
  invalidAudioUrls: number;
  missingAudioUrls: number;
  downloadedAudioRefs: number;
  staleAudioRefs: number;
  pendingAudioJobs: number;
  favoritesCount: number;
  historyCount: number;
  lastSync: string;
}

const GOLD = "#C8A951";
const MUTED = "#94A3B8";

function safeArrayLength(json: string | null): number {
  if (!json) return 0;
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

export function AdminLocalTools() {
  const [report, setReport] = useState<LocalDiagnostics | null>(null);
  const [checking, setChecking] = useState(false);
  const [sharing, setSharing] = useState(false);

  const runLocalCheck = async () => {
    setChecking(true);
    try {
      const [entriesResult, audioIndex, pendingQueue, lastSyncDate] = await Promise.all([
        loadEntries(),
        loadAudioIndex(),
        loadPendingQueue(),
        getLastSync(),
      ]);
      const [favoritesJson, historyJson] = await Promise.all([
        AsyncStorage.getItem("@coptic/favorites_v3"),
        AsyncStorage.getItem("@coptic/history_v3"),
      ]);
      const entries = entriesResult ?? [];
      const seenIds = new Set<string>();
      const seenWords = new Set<string>();
      const validAudioIds = new Set<string>();
      let duplicateIds = 0;
      let duplicateCopticWords = 0;
      let missingCopticWords = 0;
      let missingArabicTranslations = 0;
      let missingEnglishTranslations = 0;
      let missingFrenchTranslations = 0;
      let missingGermanTranslations = 0;
      let invalidAudioUrls = 0;
      let missingAudioUrls = 0;

      for (const entry of entries) {
        const id = String(entry.id ?? "");
        if (id) {
          if (seenIds.has(id)) duplicateIds += 1;
          else seenIds.add(id);
          validAudioIds.add(id);
        }
        if (entry.audioId) validAudioIds.add(String(entry.audioId));
        const copticKey = String(entry.coptic ?? "").normalize("NFC").replace(/[\u0300-\u036f\u2cbb\u2cbc◌]/g, "").toLowerCase().trim();
        if (!copticKey) missingCopticWords += 1;
        else if (seenWords.has(copticKey)) duplicateCopticWords += 1;
        else seenWords.add(copticKey);
        if (!String(entry.arabic ?? "").trim()) missingArabicTranslations += 1;
        if (!String(entry.english ?? "").trim()) missingEnglishTranslations += 1;
        if (!String(entry.french ?? "").trim()) missingFrenchTranslations += 1;
        if (!String(entry.german ?? "").trim()) missingGermanTranslations += 1;
        if (!entry.audioUrl) missingAudioUrls += 1;
        else if (!/^https?:\/\//i.test(String(entry.audioUrl).trim())) invalidAudioUrls += 1;
      }

      const validLastSync = lastSyncDate && !Number.isNaN(lastSyncDate.getTime())
        ? lastSyncDate.toLocaleString("ar-EG")
        : "لا توجد مزامنة محفوظة";

      setReport({
        checkedAt: new Date().toLocaleString("ar-EG"),
        entryCount: entries.length,
        duplicateIds,
        duplicateCopticWords,
        missingCopticWords,
        missingArabicTranslations,
        missingEnglishTranslations,
        missingFrenchTranslations,
        missingGermanTranslations,
        invalidAudioUrls,
        missingAudioUrls,
        downloadedAudioRefs: audioIndex.size,
        staleAudioRefs: [...audioIndex].filter((id) => !validAudioIds.has(String(id))).length,
        pendingAudioJobs: pendingQueue.length,
        favoritesCount: safeArrayLength(favoritesJson),
        historyCount: safeArrayLength(historyJson),
        lastSync: validLastSync,
      });
    } catch {
      setReport(null);
    } finally {
      setChecking(false);
    }
  };

  const shareReport = async () => {
    if (!report) return;
    setSharing(true);
    try {
      const message = [
        "تقرير تشخيص محلي لتطبيق ⲭⲏⲙⲓ",
        `المنصة: ${Platform.OS}`,
        `وقت الفحص: ${report.checkedAt}`,
        `سجلات القاموس المحلية: ${report.entryCount}`,
        `معرّفات مكررة: ${report.duplicateIds}`,
        `كلمات قبطية مكررة: ${report.duplicateCopticWords}`,
        `سجلات بلا كلمة قبطية: ${report.missingCopticWords}`,
        `ترجمات عربية ناقصة: ${report.missingArabicTranslations}`,
        `ترجمات إنجليزية ناقصة: ${report.missingEnglishTranslations}`,
        `ترجمات فرنسية ناقصة: ${report.missingFrenchTranslations}`,
        `ترجمات ألمانية ناقصة: ${report.missingGermanTranslations}`,
        `روابط صوت غير صالحة: ${report.invalidAudioUrls}`,
        `سجلات بلا رابط صوت: ${report.missingAudioUrls}`,
        `مراجع صوت محفوظة: ${report.downloadedAudioRefs}`,
        `مراجع صوت غير مرتبطة بسجل: ${report.staleAudioRefs}`,
        `مهام صوت معلقة: ${report.pendingAudioJobs}`,
        `المفضلة المحلية: ${report.favoritesCount}`,
        `سجل الكلمات المحلي: ${report.historyCount}`,
        `آخر مزامنة: ${report.lastSync}`,
        "التقرير إحصائي فقط ولا يتضمن كلمات القاموس أو بيانات المستخدم.",
      ].join("\n");
      await Share.share({ title: "تقرير صحة القاموس", message });
    } catch {
      // إلغاء نافذة المشاركة أو عدم توفرها لا يؤثر في الأدوات المحلية.
    } finally {
      setSharing(false);
    }
  };

  const metrics = report ? [
    { label: "سجلات القاموس المحلية", value: report.entryCount.toLocaleString("ar-EG") },
    { label: "معرّفات مكررة", value: report.duplicateIds.toLocaleString("ar-EG") },
    { label: "كلمات قبطية مكررة", value: report.duplicateCopticWords.toLocaleString("ar-EG") },
    { label: "سجلات بلا كلمة قبطية", value: report.missingCopticWords.toLocaleString("ar-EG") },
    { label: "ترجمات عربية ناقصة", value: report.missingArabicTranslations.toLocaleString("ar-EG") },
    { label: "ترجمات إنجليزية ناقصة", value: report.missingEnglishTranslations.toLocaleString("ar-EG") },
    { label: "ترجمات فرنسية ناقصة", value: report.missingFrenchTranslations.toLocaleString("ar-EG") },
    { label: "ترجمات ألمانية ناقصة", value: report.missingGermanTranslations.toLocaleString("ar-EG") },
    { label: "روابط صوت غير صالحة", value: report.invalidAudioUrls.toLocaleString("ar-EG") },
    { label: "سجلات بلا رابط صوت", value: report.missingAudioUrls.toLocaleString("ar-EG") },
    { label: "مراجع الصوت المحفوظة", value: report.downloadedAudioRefs.toLocaleString("ar-EG") },
    { label: "مراجع صوت غير مرتبطة", value: report.staleAudioRefs.toLocaleString("ar-EG") },
    { label: "مهام الصوت المعلقة", value: report.pendingAudioJobs.toLocaleString("ar-EG") },
    { label: "المفضلة المحفوظة محليًا", value: report.favoritesCount.toLocaleString("ar-EG") },
    { label: "سجل الكلمات المحلي", value: report.historyCount.toLocaleString("ar-EG") },
    { label: "آخر مزامنة", value: report.lastSync },
  ] : [];

  return (
    <View style={styles.container}>
      <View style={styles.introCard}>
        <View style={styles.titleRow}>
          <View style={styles.iconBadge}>
            <Feather name="shield" size={20} color={GOLD} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>أدوات محلية مستقلة</Text>
            <Text style={styles.subtitle}>تشخيص آمن على هذا الجهاز فقط</Text>
          </View>
        </View>
        <Text style={styles.description}>
          افحص سلامة القاموس والصوتيات والمهام المعلقة، ثم شارك ملخصًا إحصائيًا عند الحاجة. لا ترسل هذه الأدوات بيانات إلى Apps Script أو أي خادم.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, checking && styles.disabledButton]}
          onPress={runLocalCheck}
          disabled={checking}
          activeOpacity={0.82}
        >
          {checking
            ? <ActivityIndicator size="small" color="#0F172A" />
            : <Feather name="activity" size={18} color="#0F172A" />}
          <Text style={styles.primaryButtonText}>{checking ? "جارٍ فحص البيانات…" : "تشغيل فحص الصحة"}</Text>
        </TouchableOpacity>
      </View>

      {report ? (
        <View style={styles.reportCard}>
          <View style={styles.reportHeader}>
            <View>
              <Text style={styles.reportTitle}>نتيجة الفحص</Text>
              <Text style={styles.checkedAt}>آخر فحص: {report.checkedAt}</Text>
            </View>
            <Feather name="check-circle" size={20} color="#34D399" />
          </View>

          <View style={styles.metrics}>
            {metrics.map((metric, index) => (
              <View key={metric.label} style={[styles.metricRow, index === metrics.length - 1 && styles.lastMetricRow]}>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                <Text style={styles.metricValue}>{metric.value}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.shareButton, sharing && styles.disabledButton]}
            onPress={shareReport}
            disabled={sharing}
            activeOpacity={0.82}
          >
            {sharing
              ? <ActivityIndicator size="small" color={GOLD} />
              : <Feather name="share-2" size={17} color={GOLD} />}
            <Text style={styles.shareButtonText}>{sharing ? "جارٍ تجهيز التقرير…" : "مشاركة تقرير التشخيص"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Feather name="database" size={22} color={MUTED} />
          <Text style={styles.emptyText}>شغّل الفحص لعرض حالة البيانات المخزنة على هذا الجهاز.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  introCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 14,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(200,169,81,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, gap: 2 },
  title: { color: "#FFF", fontSize: 17, fontFamily: "Cairo_700Bold", textAlign: "right" },
  subtitle: { color: GOLD, fontSize: 11, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  description: { color: MUTED, fontSize: 13, lineHeight: 22, fontFamily: "Cairo_400Regular", textAlign: "right" },
  primaryButton: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: GOLD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  primaryButtonText: { color: "#0F172A", fontSize: 14, fontFamily: "Cairo_700Bold" },
  disabledButton: { opacity: 0.55 },
  reportCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 14,
  },
  reportHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reportTitle: { color: "#FFF", fontSize: 16, fontFamily: "Cairo_700Bold", textAlign: "right" },
  checkedAt: { color: MUTED, fontSize: 10, fontFamily: "Cairo_400Regular", marginTop: 2, textAlign: "right" },
  metrics: { backgroundColor: "#0F172A", borderRadius: 14, paddingHorizontal: 12 },
  metricRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  lastMetricRow: { borderBottomWidth: 0 },
  metricLabel: { color: MUTED, fontSize: 12, fontFamily: "Cairo_600SemiBold", textAlign: "right", flexShrink: 1 },
  metricValue: { color: "#FFF", fontSize: 12, fontFamily: "Cairo_700Bold", textAlign: "left", flexShrink: 1 },
  shareButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(200,169,81,0.38)",
    backgroundColor: "rgba(200,169,81,0.08)",
  },
  shareButtonText: { color: GOLD, fontSize: 13, fontFamily: "Cairo_700Bold" },
  emptyCard: {
    minHeight: 100,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: { color: MUTED, fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "center", lineHeight: 20 },
});
