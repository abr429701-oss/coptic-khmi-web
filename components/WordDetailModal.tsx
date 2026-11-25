import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Image,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  Clipboard,
  Animated,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DictionaryEntry } from "@/hooks/useDictionary";
import { useFavorites } from "@/hooks/useFavorites";
import { AudioPlayer } from "@/components/AudioPlayer";
import { downloadAudio, screenshotWordCard, type SaveResult } from "@/hooks/useShareWord";
import { useLang, translateTerm, translations } from "@/contexts/LanguageContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { logActivity } from "@/hooks/useUserTracking";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import QRCode from 'react-native-qrcode-svg';


const DETAIL_CARD_LOGO = require("../assets/images/logo22.png");
const MemoizedQRCode = React.memo(QRCode);

const MemoizedModalAudioPlayer = React.memo(function ModalAudioPlayer({
  entry,
  getAudioSource,
  cachePlayedAudio,
}: {
  entry: DictionaryEntry;
  getAudioSource?: (entry: DictionaryEntry) => Promise<string | null>;
  cachePlayedAudio?: (entry: DictionaryEntry) => Promise<void>;
}) {
  const resolveSource = React.useCallback(
    () => getAudioSource ? getAudioSource(entry) : Promise.resolve(null),
    [getAudioSource, entry]
  );
  const onPlaybackStarted = React.useCallback(
    () => cachePlayedAudio?.(entry),
    [cachePlayedAudio, entry]
  );
  if (!entry.audioUrl) return null;
  return (
    <AudioPlayer
      audioUrl={entry.audioUrl}
      fullWidth
      resolveSource={getAudioSource ? resolveSource : undefined}
      onPlaybackStarted={cachePlayedAudio ? onPlaybackStarted : undefined}
    />
  );
}, (previous, next) =>
  previous.entry.audioUrl === next.entry.audioUrl &&
  (previous.entry.audioId || previous.entry.id) === (next.entry.audioId || next.entry.id) &&
  previous.getAudioSource === next.getAudioSource &&
  previous.cachePlayedAudio === next.cachePlayedAudio
);

interface WordDetailModalProps {
  entry: DictionaryEntry | null;
  searchTerm: string;
  displayMeaning?: string;
  alternateEntries?: DictionaryEntry[];
  onClose: () => void;
  getAudioSource?: (entry: DictionaryEntry) => Promise<string | null>;
  cachePlayedAudio?: (entry: DictionaryEntry) => Promise<void>;
}

interface ActionBtn {
  icon: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  onPress: () => void;
  loading?: boolean;
}

// أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ Toast أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

type ToastState = {
  visible: boolean;
  success: boolean;
  message: string;
  sub?: string;
  icon: string;
};

function KhmiToast({
  toast,
  colors,
  bottomOffset = 110,
}: {
  toast: ToastState;
  colors: any;
  bottomOffset?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toast.visible) {
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 160,
        friction: 9,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [toast.visible, anim]);

  if (!toast.visible && (anim as any).__getValue() === 0) return null;

  const bgColor = toast.success ? "rgba(20,20,20,0.97)" : "rgba(20,10,10,0.97)";
  const accentColor = toast.success ? "#C8A951" : "#CC4444";

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        toastStyles.wrap,
        {
          bottom: bottomOffset,
          opacity: anim,
          transform: [
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.88, 1],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[toastStyles.card, { backgroundColor: bgColor, borderColor: accentColor + "40" }]}>
        <View style={[toastStyles.topBar, { backgroundColor: accentColor }]} />
        <View style={toastStyles.body}>
          <View
            style={[
              toastStyles.iconWrap,
              { backgroundColor: accentColor + "18", borderColor: accentColor + "35" },
            ]}
          >
            <Feather name={toast.icon as any} size={22} color={accentColor} />
          </View>
          <View style={toastStyles.textCol}>
            <Text style={[toastStyles.msg, { color: "#FFFFFF" }]}>{toast.message}</Text>
            {toast.sub ? (
              <Text style={[toastStyles.sub, { color: "rgba(255,255,255,0.5)" }]}>
                {toast.sub}
              </Text>
            ) : null}
          </View>
          <Text style={[toastStyles.brand, { color: accentColor + "70" }]}>{"\u2CAD\u2C8F\u2C99\u2C93"}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    alignItems: "center",
  },
  card: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  topBar: {
    height: 3,
    width: "100%",
    opacity: 0.85,
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  msg: {
    fontSize: 15,
    fontFamily: "Cairo_600SemiBold",
    textAlign: "right",
    writingDirection: "rtl",
  },
  sub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  brand: {
    fontSize: 18,
    fontFamily: "CSAvaVeni-Regular",
    flexShrink: 0,
  },
});

// أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·ع¾ط·آ­ط¸ث†ط¸ظ¹ط¸â€‍ SaveResult ط·آ¥ط¸â€‍ط¸â€° ط·آ±ط·آ³ط·آ§ط¸â€‍ط·آ© Toast أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

function resultToToast(
  result: SaveResult,
  type: "image" | "audio",
  t: any
): Omit<ToastState, "visible"> {
  if (result.ok) {
    return type === "image"
      ? { success: true, icon: "check-circle", message: t.toast.imageSaved, sub: t.toast.imageSavedSub }
      : { success: true, icon: "check-circle", message: t.toast.audioSaved, sub: t.toast.audioSavedSub };
  }
  switch (result.reason) {
    case "no_audio":
      return { success: false, icon: "volume-x", message: t.toast.noAudio };
    case "no_ref":
      return { success: false, icon: "alert-circle", message: t.toast.captureError, sub: t.toast.captureErrorSub };
    case "capture_failed":
      return { success: false, icon: "alert-circle", message: t.toast.captureError, sub: t.toast.captureErrorPermSub };
    case "audio_unavailable":
      return { success: false, icon: "wifi-off", message: t.toast.audioOffline, sub: t.toast.audioOfflineSub };
    case "no_local_file":
      return { success: false, icon: "download-cloud", message: t.toast.audioNotDownloaded, sub: t.toast.audioNotDownloadedSub };
    case "save_failed":
      return { success: false, icon: "alert-circle", message: t.toast.saveFailed, sub: t.toast.saveFailedSub };
    default:
      return { success: false, icon: "alert-circle", message: t.toast.unexpectedError };
  }
}

// أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·آ§ط¸â€‍ط¸â€¦ط¸ث†ط·آ¯ط·آ§ط¸â€‍ ط·آ§ط¸â€‍ط·آ±ط·آ¦ط¸ظ¹ط·آ³ط¸ظ¹ أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

export function WordDetailModal({
  entry,
  searchTerm,
  displayMeaning,
  alternateEntries = [],
  onClose,
  getAudioSource,
  cachePlayedAudio,
}: WordDetailModalProps) {
  const cardRef = useRef<View>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [meaningIndex, setMeaningIndex] = useState(0);
  const meaningEntries = React.useMemo(() => {
    if (!entry) return [];
    const isCopticSearch = /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF]/.test(searchTerm);
    const seen = new Set<string>();
    return [entry, ...alternateEntries].filter((candidate: any) => {
      const meaning = String(candidate?._displayMeaning || candidate?.arabic || candidate?.english || candidate?.french || candidate?.german || "")
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
        .replace(/\u0629/g, "\u0647")
        .replace(/\u0649/g, "\u064A")
        .replace(/\s+/g, " ")
        .trim();
      const headword = String(candidate?.coptic || candidate?.id || "")
        .split(/[،,;؛/\n]+/)[0]
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/[\u0300-\u036F\u2CBB\u2CBC\u25CC`]/g, "")
        .trim();
      const identity = isCopticSearch ? `meaning:${meaning}` : `headword:${headword}|meaning:${meaning}`;
      if (!meaning || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }, [entry, alternateEntries, searchTerm]);
  const activeEntry = meaningEntries[meaningIndex] ?? entry;
  const reportedMeaningCount = Number((entry as any)?._meaningCount);
  // Search results must explicitly report multiple senses; never infer them from stale/duplicate alternates.
  const hasOtherMeanings = Number.isInteger(reportedMeaningCount) &&
    reportedMeaningCount > 1 && meaningEntries.length > 1;

  useEffect(() => setMeaningIndex(0), [entry?.id, alternateEntries]);

  const [toast, setToast] = useState<ToastState>({
    visible: false, success: true, message: "", icon: "check-circle",
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isFavorite, toggleFavorite } = useFavorites();
  const { t, lang } = useLang();
  const colors = useThemeColors();
  const entryLang = (activeEntry as any)?._lang || lang;
  const isEntryArabic = entryLang === "ar";
  const tEntry = translations[entryLang as keyof typeof translations] || translations.ar;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const compactLayout = windowHeight < 960;
  const { currentAppLink } = useAppUpdate();

  useEffect(() => {
    if (entry) {
      logActivity("open", entry, `Source: ${searchTerm || "direct"}`);
    }
  }, [entry?.id]);

  const safeBottom = insets.bottom > 0 ? insets.bottom : (Platform.OS === "ios" ? 34 : 16);


  const showToast = (data: Omit<ToastState, "visible">) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...data, visible: true });
    toastTimer.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
  };



  useEffect(() => {
    if (activeEntry) {
      logActivity("modal_open", activeEntry, "WordDetail");
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  if (!entry) return null;

  // Keep the title anchored to the result the user opened; only its sense/correspondence changes.
  const selectedResultWord = (entry as any)?._displayMeaning || displayMeaning || entry.arabic || "";
  const activeMeaning = (activeEntry as any)?._displayMeaning || activeEntry.arabic || "";
  const isCopticQuery = /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF]/.test(searchTerm);
  const cardHeading = isCopticQuery ? entry.coptic : selectedResultWord;
  const cardSubheading = isCopticQuery ? activeMeaning : activeEntry.coptic;
  // Coptic search keeps one headword; translated searches can cycle across headwords.
  const audioEntry = isCopticQuery ? entry : activeEntry;

  // أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ handlers ط¸â€¦ط·آ¹ ط·ع¾ط·آ³ط·آ¬ط¸ظ¹ط¸â€‍ ط·آ§ط¸â€‍ط¸â€ ط·آ´ط·آ§ط·آ·ط·آ§ط·ع¾ أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

  const handleCopy = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }

    const entryDisplayMeaning = (activeEntry as any)?._displayMeaning;
    const meaningToShow = entryDisplayMeaning || (() => {
      switch (entryLang) {
        case "en": return activeEntry.english || activeEntry.arabic || "";
        case "fr": return activeEntry.french || activeEntry.arabic || "";
        case "de": return activeEntry.german || activeEntry.arabic || "";
        default: return activeEntry.arabic || "";
      }
    })();

    const dataLines = [
      activeEntry.coptic && `${tEntry.word.copyPrefix.coptic}: ${activeEntry.coptic}`,
      meaningToShow && `${tEntry.word.copyPrefix.arabic}: ${meaningToShow}`,
      activeEntry.origin && `${tEntry.word.copyPrefix.origin}: ${translateTerm(activeEntry.origin, entryLang as any)}`,
      activeEntry.wordType && `${tEntry.word.wordType}: ${translateTerm(activeEntry.wordType, entryLang as any)}`,
    ].filter(Boolean);

    const appLink = currentAppLink || "https://play.google.com/store/apps/details?id=com.khmi.coptic";
    const footerMessage = `${tEntry.word.moreWordsDownload}${appLink}\n${tEntry.word.moreWordsDownloadSuffix}`;

    // ط·آ±ط·آ¨ط·آ· ط·آ§ط¸â€‍ط·آ¨ط¸ظ¹ط·آ§ط¸â€ ط·آ§ط·ع¾ ط¸â€¦ط·آ¹ ط·آ¥ط·آ¶ط·آ§ط¸ظ¾ط·آ© ط·آ³ط·آ·ط·آ± ط¸ظ¾ط·آ§ط·آ±ط·ط› (ط¸â€¦ط·آ³ط·آ§ط¸ظ¾ط·آ©) ط¸â€ڑط·آ¨ط¸â€‍ ط·آ§ط¸â€‍ط·آ±ط·آ³ط·آ§ط¸â€‍ط·آ© ط·آ§ط¸â€‍ط·ع¾ط·آ±ط¸ث†ط¸ظ¹ط·آ¬ط¸ظ¹ط·آ©
    const text = [...dataLines, "", footerMessage].join("\n");




    if (Platform.OS === "web") {
      navigator.clipboard?.writeText(text).catch(() => { });
    } else {
      Clipboard.setString(text);
    }

    setCopied(true);
    showToast({ success: true, icon: "copy", message: t.toast.copied });
    setTimeout(() => setCopied(false), 2000);

    logActivity("clipboard_copy", entry, text.substring(0, 50) + "...");
  };

  const handleScreenshot = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { }
    setScreenshotLoading(true);
    try {
      const result = await screenshotWordCard(activeEntry, cardRef, {
        lang: entryLang as any,
        displayMeaning: (activeEntry as any)?._displayMeaning || displayMeaning
      });
      showToast(resultToToast(result, "image", t));
      if (result.ok) {
        logActivity("share", entry, "image");
      }
    } finally {
      setScreenshotLoading(false);
    }
  };

  const handleDownloadAudio = async () => {
    if (!activeEntry.audioUrl) return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { }
    setDownloadLoading(true);
    try {
      const result = await downloadAudio(activeEntry, {
        lang: entryLang as any,
        displayMeaning: (activeEntry as any)?._displayMeaning || displayMeaning
      });
      showToast(resultToToast(result, "audio", t));
      if (result.ok) {
        logActivity("audio_play", entry, "download");
      }
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleFav = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
    if (activeEntry) {
      await toggleFavorite(activeEntry.id, entryLang, (activeEntry as any)?._query || searchTerm);
      logActivity("favorite", entry);
    }
  };

  const isFav = entry ? isFavorite(activeEntry.id) : false;

  const actions: ActionBtn[] = [
    {
      icon: "star",
      label: isFav ? t.word.saved : t.word.save,
      color: isFav ? "#F5A623" : colors.textSecondary,
      bg: isFav ? "rgba(245,166,35,0.12)" : colors.chipBg,
      border: isFav ? "rgba(245,166,35,0.35)" : colors.cardBorder,
      onPress: handleFav,
    },
    {
      icon: copied ? "check" : "copy",
      label: copied ? t.word.copied : t.word.copy,
      color: copied ? "#4CAF50" : colors.textSecondary,
      bg: copied ? "rgba(76,175,80,0.12)" : colors.chipBg,
      border: copied ? "rgba(76,175,80,0.35)" : colors.cardBorder,
      onPress: handleCopy,
    },
    {
      icon: screenshotLoading ? "loader" : "camera",
      label: t.word.card,
      color: colors.copticText,
      bg: colors.audioBtnBg,
      border: colors.audioBtnBorder,
      onPress: handleScreenshot,
      loading: screenshotLoading,
    },
    ...(activeEntry.audioUrl
      ? [
        {
          icon: downloadLoading ? "loader" : "download",
          label: t.word.audio,
          color: "#5B9BD5",
          bg: "rgba(91,155,213,0.08)",
          border: "rgba(91,155,213,0.25)",
          onPress: handleDownloadAudio,
          loading: downloadLoading,
        } as ActionBtn,
      ]
      : []),
  ];

  // أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ render أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

  return (
    <Modal visible={true} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.sheetBg,
              borderColor: colors.cardBorder,
              height: compactLayout ? "99%" : "92%",
              maxHeight: compactLayout ? "99%" : "92%",
              paddingBottom: safeBottom,
            },
          ]}
          onPress={() => { }}
        >
          <View style={[styles.dragBar, { backgroundColor: colors.separator }]} />

          <View style={[styles.header, { borderBottomColor: colors.separator }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                { backgroundColor: colors.chipBg, borderColor: colors.cardBorder, borderWidth: 1 },
              ]}
              activeOpacity={0.7}
            >
              <Feather name="x" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>
              {tEntry.word.details}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView
            style={styles.detailsScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, compactLayout && styles.scrollContentCompact]}
          >
            <View
              ref={cardRef}
              collapsable={false}
              style={[
                styles.heroCard,
                compactLayout && styles.heroCardCompact,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={[styles.heroGlowTop, { backgroundColor: colors.copticText + "08" }]} />
              <View style={[styles.heroGlowBottom, { backgroundColor: colors.primary + "05" }]} />
              <View style={[styles.topAccentLine, { backgroundColor: colors.copticText }]} />
              <Image source={DETAIL_CARD_LOGO} style={[styles.detailLogo, compactLayout && styles.detailLogoCompact]} resizeMode="contain" />

              <MemoizedDetailHeading
                heading={cardHeading || ""}
                subheading={cardSubheading || ""}
                isCopticQuery={isCopticQuery}
                compactLayout={compactLayout}
                copticColor={colors.copticText}
                textColor={colors.text}
              />

              {(activeEntry.origin || activeEntry.wordType) ? (
                <View style={[styles.metaRow, compactLayout && styles.metaRowCompact]}>
                  {activeEntry.wordType ? (
                    <View
                      style={[
                        styles.metaCell,
                        compactLayout && styles.metaCellCompact,
                        {
                          backgroundColor: "rgba(91,155,213,0.08)",
                          borderColor: "rgba(91,155,213,0.25)",
                        },
                      ]}
                    >
                      <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                        {tEntry.word.wordType}
                      </Text>
                      <View style={[styles.metaLine, { backgroundColor: "#5B9BD5" }]} />
                      <Text style={[styles.metaValue, compactLayout && styles.metaValueCompact, { color: "#5B9BD5" }]}>
                        {translateTerm(activeEntry.wordType, entryLang as any)}
                      </Text>
                    </View>
                  ) : null}
                  {activeEntry.origin ? (
                    <View
                      style={[
                        styles.metaCell,
                        compactLayout && styles.metaCellCompact,
                        {
                          backgroundColor: colors.chipBg,
                          borderColor: colors.copticText + "30",
                        },
                      ]}
                    >
                      <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                        {tEntry.word.origin}
                      </Text>
                      <View style={[styles.metaLine, { backgroundColor: colors.copticText }]} />
                      <Text style={[styles.metaValue, compactLayout && styles.metaValueCompact, { color: colors.copticText }]}>
                        {translateTerm(activeEntry.origin, entryLang as any)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.qrRow, compactLayout && styles.qrRowCompact]}>
                <View style={[styles.qrContainer, compactLayout && styles.qrContainerCompact, { borderColor: colors.copticText + "20" }]}>
                  <MemoizedQRCode
                    value={currentAppLink || "https://play.google.com/store/apps/details?id=com.khmi.coptic"}
                    size={compactLayout ? 48 : 65}
                    color="#000000"
                    backgroundColor="#ffffff"
                  />
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={[styles.footerLine, { backgroundColor: colors.copticText + "30" }]} />
                <Text style={[styles.cardBrand, compactLayout && styles.cardBrandCompact, { color: colors.copticText + "60" }]}>{"\u2CAD\u2C8F\u2C99\u2C93"}</Text>
                <View style={[styles.footerLine, { backgroundColor: colors.copticText + "30" }]} />
              </View>

            </View>

          </ScrollView>

          {!(isCopticQuery && meaningIndex > 0) ? (
            <View style={styles.audioBar}>
              {audioEntry.audioUrl ? (
                <MemoizedModalAudioPlayer
                  entry={audioEntry}
                  getAudioSource={getAudioSource}
                  cachePlayedAudio={cachePlayedAudio}
                />
              ) : (
                <View style={styles.noAudio}>
                  <Feather name="volume-x" size={15} color={colors.textSecondary} />
                  <Text style={[styles.noAudioText, { color: colors.textSecondary }]}>
                    {tEntry.word.noAudio}
                  </Text>
                </View>
              )}
            </View>
          ) : null}
          {hasOtherMeanings ? (
            <TouchableOpacity
              style={[styles.otherMeaningButton, { backgroundColor: colors.chipBg, borderColor: colors.cardBorder }]}
              onPress={() => setMeaningIndex((current) => (current + 1) % meaningEntries.length)}
              activeOpacity={0.75}
            >
              <Feather name="refresh-cw" size={15} color={colors.copticText} />
              <Text style={[styles.otherMeaningText, { color: colors.copticText }]}>
                {t.word.otherMeaning}
              </Text>
            </TouchableOpacity>
          ) : null}

          <View
            style={[
              styles.actionsBar,
              {
                backgroundColor: colors.sheetBg,
                borderTopColor: colors.separator,
              },
            ]}
          >
            {actions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.actionBtn}
                onPress={action.onPress}
                activeOpacity={0.72}
                disabled={action.loading}
              >
                <View
                  style={[
                    styles.actionIcon,
                    {
                      backgroundColor: action.loading ? colors.chipBg : action.bg,
                      borderColor: action.loading ? colors.cardBorder : action.border,
                    },
                  ]}
                >
                  <Feather
                    name={action.icon as any}
                    size={20}
                    color={action.loading ? colors.textSecondary : action.color}
                  />
                </View>
                <Text
                  style={[
                    styles.actionLabel,
                    { color: action.loading ? colors.textSecondary : action.color },
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <KhmiToast
            toast={toast}
            colors={colors}
            bottomOffset={safeBottom + 90}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ Styles أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    height: "92%",
    maxHeight: "92%",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  dragBar: {
    width: 36,
    height: 3.5,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  detailsScroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContentCompact: {
    paddingHorizontal: 10,
    paddingTop: 3,
    paddingBottom: 4,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "stretch",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 4,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 8,
    alignItems: "center",
    gap: 14,
  },
  heroCardCompact: {
    paddingHorizontal: 16,
    paddingBottom: 3,
    gap: 5,
  },
  heroGlowTop: {
    position: "absolute",
    top: -30,
    left: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  heroGlowBottom: {
    position: "absolute",
    bottom: -20,
    right: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  topAccentLine: {
    width: "100%",
    height: 3,
    opacity: 0.6,
    marginBottom: 4,
  },
  copticSection: {
    alignItems: "center",
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  copticSectionCompact: {
    gap: 5,
    marginTop: 0,
  },
  copticWord: {
    fontSize: 66,
    fontFamily: "CSAvaVeni-Regular",
    textAlign: "center",
    lineHeight: 80,
  },
  copticWordCompact: {
    fontSize: 52,
    lineHeight: 60,
  },
  copticDivider: {
    width: 60,
    height: 1.5,
    borderRadius: 1,
  },
  arabicMeaning: {
    fontSize: 28,
    fontFamily: "Cairo_700Bold",
    textAlign: "center",
    lineHeight: 36,
    writingDirection: "rtl",
    letterSpacing: 0.3,
    paddingHorizontal: 8,
  },
  arabicMeaningCompact: {
    fontSize: 24,
    lineHeight: 32,
    paddingHorizontal: 4,
  },
  latinHeading: {
    fontSize: 28,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 36,
    paddingHorizontal: 8,
  },
  latinHeadingCompact: {
    fontSize: 24,
    lineHeight: 32,
  },
  copticSubheading: {
    fontSize: 28,
    fontFamily: "CSAvaVeni-Regular",
    textAlign: "center",
    lineHeight: 38,
  },
  copticSubheadingCompact: {
    fontSize: 22,
    lineHeight: 32,
  },
  metaRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    flexWrap: "wrap",
    width: "100%",
  },
  metaRowCompact: {
    gap: 8,
  },
  metaCell: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 8,
    flex: 1,
    minWidth: 90,
    maxWidth: 130,
  },
  metaCellCompact: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 3,
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  metaLine: {
    width: 28,
    height: 2,
    borderRadius: 1,
  },
  metaValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  metaValueCompact: {
    fontSize: 14,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    marginTop: 4,
  },
  footerLine: { flex: 1, height: 1 },
  detailLogo: { width: 48, height: 48, alignSelf: "center", flexShrink: 0 },
  detailLogoCompact: { width: 36, height: 36 },
  cardBrand: {
    fontSize: 22,
    fontFamily: "CSAvaVeni-Regular",
  },
  cardBrandCompact: {
    fontSize: 19,
  },
  qrRow: {
    marginTop: 2,
    marginBottom: 0,
    alignItems: 'center',
  },
  qrRowCompact: {
    marginTop: 0,
    marginBottom: -2,
  },
  qrContainer: {
    padding: 6,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  qrContainerCompact: {
    padding: 4,
  },
  noAudio: {

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  noAudioText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  otherMeaningButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 7,
    marginBottom: 5,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  otherMeaningText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
  },
  audioBar: {
    flexShrink: 0,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 8,
  },
  actionsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    flexShrink: 0,
  },
  actionBtn: {
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
});

const MemoizedDetailHeading = React.memo(function DetailHeading({
  heading,
  subheading,
  isCopticQuery,
  compactLayout,
  copticColor,
  textColor,
}: {
  heading: string;
  subheading: string;
  isCopticQuery: boolean;
  compactLayout: boolean;
  copticColor: string;
  textColor: string;
}) {
  if (!heading) return null;
  const headingStyle = isCopticQuery
    ? [styles.copticWord, compactLayout && styles.copticWordCompact]
    : /[\u0600-\u06FF]/.test(heading)
      ? [styles.arabicMeaning, compactLayout && styles.arabicMeaningCompact]
      : [styles.latinHeading, compactLayout && styles.latinHeadingCompact];
  const subheadingStyle = isCopticQuery
    ? /[\u0600-\u06FF]/.test(subheading) ? styles.arabicMeaning : styles.latinHeading
    : [styles.copticSubheading, compactLayout && styles.copticSubheadingCompact];
  return (
    <View style={[styles.copticSection, compactLayout && styles.copticSectionCompact]}>
      <Text
        style={[headingStyle, { color: copticColor, width: "100%" }]}
        numberOfLines={isCopticQuery ? 1 : undefined}
        adjustsFontSizeToFit={isCopticQuery}
        minimumFontScale={0.4}
      >
        {heading}
      </Text>
      <View style={[styles.copticDivider, { backgroundColor: copticColor + "40" }]} />
      {subheading ? (
        <Text
          style={[subheadingStyle, { color: textColor, width: "100%" }]}
          numberOfLines={isCopticQuery ? undefined : 1}
          adjustsFontSizeToFit={!isCopticQuery}
          minimumFontScale={0.4}
        >
          {subheading}
        </Text>
      ) : null}
    </View>
  );
});

