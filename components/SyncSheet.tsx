import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DownloadProgress } from "@/hooks/useOfflineDictionary";
import { useLang } from "@/contexts/LanguageContext";
import { useThemeColors } from "@/hooks/useThemeColors";

interface SyncSheetProps {
  visible: boolean;
  onClose: () => void;
  lastSync: Date | null;
  entryCount: number;
  audioCount: number;
  audioTotalCount: number;
  audioSizeBytes: number;
  audioSizeKnown: boolean;
  downloadProgress: DownloadProgress;
  onSync: () => Promise<{ newCount: number; audioCount: number }>;
  onDownloadAll: () => Promise<void>;
}

// ─── timeAgo مترجمة باستخدام t ──────────────────────────────────────────────
function useTimeAgo() {
  const { t, lang } = useLang();

  return (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return t.timeAgo.moments;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t.timeAgo.minutes(minutes);
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t.timeAgo.hours(hours);
    const days = hours / 24;
    return t.timeAgo.days(days);
  };
}

function audioActionLabels(lang: string) {
  if (lang === "ar") return { pause: "إيقاف مؤقت", pausing: "جارٍ الإيقاف…", resume: "استكمال التنزيل", paused: "متوقف مؤقتًا" };
  if (lang === "fr") return { pause: "Mettre en pause", pausing: "Mise en pause…", resume: "Reprendre", paused: "En pause" };
  if (lang === "de") return { pause: "Pausieren", pausing: "Wird pausiert…", resume: "Fortsetzen", paused: "Pausiert" };
  return { pause: "Pause download", pausing: "Pausing…", resume: "Resume download", paused: "Paused" };
}

// ─── عداد دائري احترافي ────────────────────────────────────────────────────
function CircleProgress({ ratio, phase, stage }: { ratio: number; phase: string; stage?: "archive" | "extract" | "individual" }) {
  const colors = useThemeColors();
  const { t, lang } = useLang();
  const animVal = useRef(new Animated.Value(0)).current;
  const [displayPct, setDisplayPct] = useState(0);

  React.useEffect(() => {
    const target = Math.round(ratio * 100);
    Animated.timing(animVal, {
      toValue: target,
      duration: 180,
      useNativeDriver: false,
    }).start();
    const listener = animVal.addListener(({ value }) => {
      setDisplayPct(Math.round(value));
    });
    return () => animVal.removeListener(listener);
  }, [ratio]);

  const isDone = phase === "done";
  const isData = phase === "data";
  const isPaused = phase === "paused";
  const isActive = phase === "audio";
  const isError = phase === "error";
  const labels = audioActionLabels(lang);

  const getPhaseSubText = () => {
    if (isDone) return t.sync.phaseDone;
    if (isData) return t.sync.phaseData;
    if (isPaused) return labels.paused;
    if (isActive) return t.sync.downloading;
    if (isError) return t.download.phaseError;
    return t.sync.reDownload;
  };

  const getProgressLabel = () => {
    if (isData) return t.sync.phaseData;
    if (stage === "extract") return "";
    if (stage === "archive") {
      if (lang === "ar") return "تنزيل حزمة الصوتيات";
      if (lang === "fr") return "Téléchargement du paquet audio";
      if (lang === "de") return "Audio-Paket wird geladen";
      return "Downloading audio archive";
    }
    if (stage === "individual") {
      if (lang === "ar") return "تنزيل الملفات المتبقية";
      if (lang === "fr") return "Téléchargement des fichiers restants";
      if (lang === "de") return "Verbleibende Dateien werden geladen";
      return "Downloading remaining files";
    }
    return t.sync.phaseAudio(displayPct, 100);
  };
  const progressLabel = getProgressLabel();

  return (
    <View style={cp.wrapper}>
      <View style={[cp.circle, { borderColor: isDone ? "#4CAF50" : "#C8A951" }]}>
        {isActive && <ActivityIndicator size="small" color="#C8A951" />}
        <Text style={[cp.pct, { color: isDone ? "#4CAF50" : "#C8A951" }]}>
          {isDone ? "✓" : isPaused ? "Ⅱ" : `${displayPct}%`}
        </Text>
        <Text style={[cp.sub, { color: colors.textSecondary }]}>
          {getPhaseSubText()}
        </Text>
      </View>

      <View style={[cp.track, { backgroundColor: colors.separator }]}>
        <Animated.View
          style={[
            cp.fill,
            {
              width: animVal.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
                extrapolate: "clamp",
              }) as any,
              backgroundColor: isDone ? "#4CAF50" : "#C8A951",
            },
          ]}
        />
      </View>

      {!isDone && !!progressLabel && (
        <Text style={[cp.label, { color: colors.textSecondary }]}>
          {progressLabel}
        </Text>
      )}
    </View>
  );
}

const cp = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 12, paddingVertical: 4 },
  circle: {
    width: 98, height: 98, borderRadius: 49,
    borderWidth: 3, alignItems: "center", justifyContent: "center", gap: 2,
  },
  pct: { fontSize: 28, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  track: { width: "100%", height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  label: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});

// ─── المكوّن الرئيسي ────────────────────────────────────────────────────────
export function SyncSheet({
  visible,
  onClose,
  lastSync,
  entryCount,
  audioCount,
  audioTotalCount,
  audioSizeBytes,
  audioSizeKnown,
  downloadProgress,
  onSync,
  onDownloadAll,
}: SyncSheetProps) {
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ newCount: number; audioCount: number } | null>(null);

  const { t, lang } = useLang();
  const colors = useThemeColors();
  const getTimeAgo = useTimeAgo();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // تحديث القاموس يجري بالخلفية؛ لا يعطّل التنزيل اليدوي.
  const isActive = downloadProgress.phase === "audio";
  const isPaused = downloadProgress.phase === "paused";
  const isError = downloadProgress.phase === "error";
  const hasResumableProgress =
    isPaused &&
    downloadProgress.total > 0 &&
    ((downloadProgress.current > 0 && downloadProgress.current < downloadProgress.total) || downloadProgress.resumable === true);
  const labels = audioActionLabels(lang);
  const audioSizeLabel = audioSizeBytes > 0
    ? `${audioSizeKnown ? "" : "≈"}${(audioSizeBytes / 1_000_000).toFixed(0)} MB`
    : lang === "ar" ? "حجم الصوتيات غير متاح حاليًا" : lang === "fr" ? "Taille audio indisponible" : lang === "de" ? "Audiogröße nicht verfügbar" : "Audio size currently unavailable";

  const progressRatio =
    (downloadProgress.phase === "audio" || downloadProgress.phase === "paused" || isError) && downloadProgress.total > 0
      ? downloadProgress.overallProgress !== undefined
        ? Math.max(0, Math.min(1, downloadProgress.overallProgress))
        : downloadProgress.current / downloadProgress.total
      : downloadProgress.phase === "data" ? 0.05
        : downloadProgress.phase === "done" ? 1
          : 0;

  const handleSync = async () => {
    setSyncing(true); setSyncResult(null);
    try { setSyncResult(await onSync()); }
    catch { setSyncResult(null); }
    finally { setSyncing(false); }
  };

  const handleDownloadAll = async () => {
    // أثناء التنزيل يعيد استدعاء الإجراء طلب الإيقاف؛ بعده يستكمل من الملفات الناقصة.
    if (isActive) {
      setPausing(true);
      try { await onDownloadAll(); }
      finally { setPausing(false); }
      return;
    }
    setDownloading(true);
    try { await onDownloadAll(); }
    finally { setDownloading(false); }
  };

  const lastSyncText = lastSync ? getTimeAgo(lastSync) : t.sync.neverSynced;
  const sheetHeight = Math.min(
    windowHeight * 0.9,
    760,
    windowHeight - insets.top - Math.max(insets.bottom, 8)
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, {
            backgroundColor: colors.sheetBg,
            borderColor: colors.cardBorder,
            height: sheetHeight,
            maxHeight: sheetHeight,
            marginBottom: Math.max(insets.bottom, 8),
          }]}
          onPress={() => { }}
        >
          <View style={styles.sheetHeader}>
            <View style={[styles.handle, { backgroundColor: colors.separator }]} />
            <View style={[styles.titleRow, { flexDirection: lang === "ar" ? "row-reverse" : "row" }]}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={lang === "ar" ? "إغلاق" : "Close"}
              >
                <Feather name="x" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: colors.text }]}>{t.sync.title}</Text>
              <View style={styles.closeSpacer} />
            </View>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
          <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="info" size={18} color="#C8A951" />
            <Text style={[styles.infoText, { color: colors.textSecondary, writingDirection: lang === "ar" ? "rtl" : "ltr", textAlign: lang === "ar" ? "left" : "right" }]}>
              {t.download.welcome}
            </Text>
          </View>

          <View style={[styles.syncCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="clock" size={18} color="#C8A951" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.syncCardTitle, { color: colors.text, writingDirection: lang === "ar" ? "rtl" : "ltr", textAlign: lang === "ar" ? "left" : "right" }]}>
                {lastSyncText}
              </Text>
              <Text style={[styles.syncCardSub, { color: colors.textSecondary, writingDirection: lang === "ar" ? "rtl" : "ltr", textAlign: lang === "ar" ? "left" : "right" }]}>
                {t.sync.lastUpdate}
              </Text>
            </View>
            {lastSync && (
              <View style={styles.greenDot} />
            )}
          </View>

          <Text style={[styles.countsText, { color: colors.textSecondary }]}>
            {lang === "ar"
              ? `${entryCount.toLocaleString(lang)} كلمة · ${Math.min(audioCount, audioTotalCount).toLocaleString(lang)} / ${audioTotalCount.toLocaleString(lang)} ملف صوتي محفوظ`
              : `${entryCount.toLocaleString(lang)} words · ${Math.min(audioCount, audioTotalCount).toLocaleString(lang)} / ${audioTotalCount.toLocaleString(lang)} audio files saved`}
          </Text>

          {(isActive || isPaused || isError || downloadProgress.phase === "done") && (
            <View style={[styles.progressBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <CircleProgress ratio={progressRatio} phase={downloadProgress.phase} stage={downloadProgress.stage} />
              {downloadProgress.total > 0 && (
                <Text style={[styles.progressCount, { color: colors.textSecondary }]}> 
                  {downloadProgress.current.toLocaleString(lang)} / {downloadProgress.total.toLocaleString(lang)}
                </Text>
              )}
            </View>
          )}

          {downloadProgress.errorMsg && (
            <Text style={{ color: "#C0392B", fontSize: 12, lineHeight: 18, marginTop: 8, textAlign: lang === "ar" ? "right" : "left", writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
              {downloadProgress.errorMsg}
            </Text>
          )}

          {syncResult && (
            <View style={[styles.resultBox, { backgroundColor: colors.card, borderColor: "rgba(76,175,80,0.25)" }]}>
              <Feather name="check-circle" size={18} color="#4CAF50" />
              <Text style={[styles.resultText, { color: "#4CAF50" }]}>
                {syncResult.newCount > 0
                  ? t.sync.updated
                  : t.sync.alreadyUpdated}
              </Text>
            </View>
          )}

          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.separator }]}>
            <View style={styles.audioMetaRow}>
              <Feather name="hard-drive" size={15} color={colors.textSecondary} />
              <Text style={[styles.audioMetaText, { color: colors.textSecondary }]}>
                {`${audioSizeLabel} · ${audioTotalCount.toLocaleString(lang)} ${lang === "ar" ? "ملف صوتي" : lang === "fr" ? "fichiers audio" : lang === "de" ? "Audiodateien" : "audio files"}`}
              </Text>
            </View>

          <View style={styles.btns}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, (syncing || isActive) && styles.btnDisabled]}
              onPress={handleSync}
              disabled={syncing || isActive}
              activeOpacity={0.85}
            >
              {syncing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="refresh-cw" size={18} color="#fff" />
              }
              <Text style={styles.btnPrimaryText}>
                {syncing ? t.sync.checking : t.sync.checkNew}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnSecondary,
                { borderColor: colors.copticText },
                ((downloading && !isActive) || pausing) && styles.btnDisabled,
              ]}
              onPress={handleDownloadAll}
              disabled={(downloading && !isActive) || pausing}
              activeOpacity={0.85}
            >
              {pausing || (downloading && !isActive)
                ? <ActivityIndicator size="small" color={colors.copticText} />
                : <Feather name={isActive ? "pause-circle" : hasResumableProgress ? "play-circle" : "download-cloud"} size={18} color={colors.copticText} />
              }
              <Text style={[styles.btnSecondaryText, { color: colors.copticText }]}> 
                {pausing
                  ? labels.pausing
                  : isActive
                  ? labels.pause
                  : hasResumableProgress
                    ? labels.resume
                    : downloading
                      ? t.sync.downloading
                      : t.sync.reDownload}
              </Text>
            </TouchableOpacity>
          </View>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 0,
    overflow: "hidden",
  },
  sheetHeader: { flexShrink: 0, paddingBottom: 10 },
  titleRow: { minHeight: 42, alignItems: "center", justifyContent: "space-between" },
  closeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  closeSpacer: { width: 36, height: 36 },
  sheetScroll: { flex: 1, minHeight: 0 },
  sheetContent: { gap: 14, paddingTop: 10, paddingBottom: 14 },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "right",
    writingDirection: "rtl",
  },
  syncCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  syncCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  syncCardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 2,
  },
  countsText: { fontSize: 12, textAlign: "center", fontFamily: "Inter_500Medium", lineHeight: 18, paddingHorizontal: 4 },
  audioMetaText: { flexShrink: 1, fontSize: 11, textAlign: "center", fontFamily: "Inter_500Medium", lineHeight: 16, paddingHorizontal: 4 },
  audioMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 20 },
  footer: { flexShrink: 0, gap: 8, paddingTop: 10, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth },
  greenDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#4CAF50",
  },
  progressBox: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  progressCount: { fontSize: 12, textAlign: "center", marginTop: 6, fontFamily: "Inter_500Medium" },
  resultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  resultText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
    writingDirection: "rtl",
  },
  btns: { gap: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  btnPrimary: { backgroundColor: "#8B0000" },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1.5 },
  btnDisabled: { opacity: 0.45 },
  btnPrimaryText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1, textAlign: "center" },
  btnSecondaryText: { fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1, minWidth: 0, textAlign: "center", lineHeight: 22 },
});
