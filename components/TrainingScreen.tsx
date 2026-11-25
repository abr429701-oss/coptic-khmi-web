import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Animated,
  BackHandler,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { CopticHandwritingModal } from "./CopticHandwritingModal";
import { HandwritingStats } from "./HandwritingStats";
import { GrammarQuizScreen } from "./GrammarQuizScreen";
import { WordScrambleScreen } from "./WordScrambleScreen";
import { MatchingGameScreen } from "./MatchingGameScreen";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/ThemeContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang } from "@/contexts/LanguageContext";
import { useAppConfig } from "@/contexts/AppConfigContext";
import type { DictionaryEntry } from "@/hooks/useDictionary";
import { Alert, Dimensions } from "react-native";
import { logActivity } from "@/hooks/useUserTracking";

const { width } = Dimensions.get("window");


const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes: Uint8Array): string {
  let res = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    res += b64chars[(n >> 18) & 63] + b64chars[(n >> 12) & 63] + (i + 1 < bytes.length ? b64chars[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? b64chars[n & 63] : "=");
  }
  return res;
}

function generateWavBase64(duration: number, type: 'success' | 'error'): string {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Uint8Array(44 + numSamples);

  buffer.set([82, 73, 70, 70], 0); // "RIFF"
  const dataSize = numSamples;
  new DataView(buffer.buffer).setUint32(4, 36 + dataSize, true);
  buffer.set([87, 65, 86, 69, 102, 109, 116, 32], 8); // "WAVEfmt "
  new DataView(buffer.buffer).setUint32(16, 16, true);
  new DataView(buffer.buffer).setUint16(20, 1, true); // PCM
  new DataView(buffer.buffer).setUint16(22, 1, true); // Mono
  new DataView(buffer.buffer).setUint32(24, sampleRate, true);
  new DataView(buffer.buffer).setUint32(28, sampleRate, true);
  new DataView(buffer.buffer).setUint16(32, 1, true);
  new DataView(buffer.buffer).setUint16(34, 8, true); // 8-bit
  buffer.set([100, 97, 116, 97], 36); // "data"
  new DataView(buffer.buffer).setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let v = 0;
    if (type === 'success') {
      v = (Math.sin(2 * Math.PI * 600 * t) + Math.sin(2 * Math.PI * 800 * t)) / 2;
      v *= Math.max(0, 1 - (t * 2)); // Fade out quickly
    } else {
      v = Math.sin(2 * Math.PI * 150 * t);
      v *= Math.max(0, 1 - (t * 2.5)); // Fade out
    }
    buffer[44 + i] = Math.min(255, Math.max(0, Math.floor(((v / 2) + 0.5) * 255)));
  }
  return 'data:audio/wav;base64,' + toBase64(buffer);
}

const SUCCESS_SOUND = generateWavBase64(0.5, 'success');
const ERROR_SOUND = generateWavBase64(0.4, 'error');

const mapToLower = (char: string) => {
  const code = char.charCodeAt(0);
  if (code >= 0x2C80 && code <= 0x2CFE && code % 2 === 0) return String.fromCharCode(code + 1);
  if (code >= 0x03E2 && code <= 0x03EF && code % 2 === 0) return String.fromCharCode(code + 1);
  return char.toLowerCase();
};

function normalizeCoptic(text: string): string {
  return text.trim()
    .split('')
    .map(mapToLower)
    .join('')
    .replace(/[\u0300-\u036F\s\.,;:!?\-\u200B]/g, ""); // Strip diacritics, spaces, punctuation
}

interface TrainingScreenProps {
  entries: DictionaryEntry[];
  audioIndex: Set<string>;
  onToggleCoptic: (show: boolean) => void;
  showCoptic: boolean;
  copticKeyEvent?: { key: string; id: number } | null;
  getAudioSource: (entry: DictionaryEntry) => Promise<string | null>;
  cachePlayedAudio?: (entry: DictionaryEntry) => Promise<void>;
}

interface TrainingSession {
  id: string;
  date: string;
  score: number;
  duration: number; // in seconds
}

export function TrainingScreen({
  entries,
  audioIndex,
  onToggleCoptic,
  showCoptic,
  copticKeyEvent,
  getAudioSource,
  cachePlayedAudio,
}: TrainingScreenProps) {
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const { t, isRTL, lang } = useLang();
  const { remoteSettings } = useAppConfig();
  const remoteControls = remoteSettings.controls;
  const buttonLabel = (key: keyof typeof remoteSettings.labels, fallback: string) => remoteSettings.labels[key]?.trim() || fallback;

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style);
  };



  const [currentEntry, setCurrentEntry] = useState<DictionaryEntry | null>(null);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | null; msg: string }>({
    type: null,
    msg: "",
  });
  const [score, setScore] = useState(0);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);

  const [history, setHistory] = useState<TrainingSession[]>([]);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [trainingMode, setTrainingMode] = useState<"choice" | "listening" | "handwriting" | "grammar_quiz" | "word_scramble" | "matching_game">("choice");
  const [showHandwritingStats, setShowHandwritingStats] = useState(false);


  const soundRef = useRef<Audio.Sound | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const sessionActive = useRef(false);
  const currentScore = useRef(0);
  const currentStartTime = useRef<number | null>(null);

  const STORAGE_KEY = "@khmi_training_history";

  const keyboardHeight = showCoptic ? (Platform.OS === "ios" ? 310 : 330) : 0;
  const bgColor = isDark ? "#140303" : "#F5F5F5";
  const cardBg = isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF";
  const textColor = isDark ? "#FFFFFF" : "#333333";

  const feedbackAnim = useRef(new Animated.Value(0)).current;

  // Relaxed to pick any word that has an audio URL, supporting both online & offline play
  const audioEntries = useMemo(() => {
    return entries.filter((e) => !!e.audioUrl);
  }, [entries]);

  const loadHistory = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) { }
  };

  const saveSession = async (finalScore: number, startTime: number) => {
    const duration = Math.round((Date.now() - startTime) / 1000);
    const newSession: TrainingSession = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      score: finalScore,
      duration: duration,
    };

    const updated = [newSession, ...history].slice(0, 20); // Keep last 20
    setHistory(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Log to Google Sheet
    const details = `Score: ${finalScore}, Duration: ${duration}s`;
    console.log("🏋️ TRAINING: Saving session to Sheet ->", details);
    try {
      await logActivity("training_session", undefined, details, duration * 1000);
      console.log("🏋️ TRAINING: ✅ Successfully sent to Sheet!");
    } catch (err) {
      console.error("🏋️ TRAINING: ❌ Failed to send to Sheet:", err);
    }
  };

  useEffect(() => {
    loadHistory();

    // Stop audio immediately upon unmount
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => { });
      }
    };
  }, []);


  useEffect(() => {
    if (showCoptic) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [showCoptic]);

  const pickNewWord = useCallback(async () => {
    if (audioEntries.length === 0) return;

    if (!sessionActive.current) {
      sessionActive.current = true;
      const now = Date.now();
      setSessionStartTime(now);
      currentStartTime.current = now;
      setScore(0);
      currentScore.current = 0;
    }

    const random = audioEntries[Math.floor(Math.random() * audioEntries.length)];
    setCurrentEntry(random);
    setUserInput("");
    setHintsUsed(0);
    setFeedback({ type: null, msg: "" });
    feedbackAnim.setValue(0);
    onToggleCoptic(true);
    playCurrentWord(random);

  }, [audioEntries, onToggleCoptic, getAudioSource]);

  const playCurrentWord = async (entryArg?: DictionaryEntry) => {
    const entry = entryArg || currentEntry;
    if (!entry) return;

    try {
      // 1. Cleanup old sound if any
      if (soundRef.current) {
        try { await soundRef.current.unloadAsync(); } catch { }
        soundRef.current = null;
      }

      setIsPlaying(true);

      // 2. Setup Audio Mode once
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // 3. Resolve playable source
      let uri = entry.audioUrl;
      const local = await getAudioSource(entry);
      if (local) {
        // Force file scheme for local paths on Android
        uri = local.startsWith("/") ? `file://${local}` : local;
      }

      if (!uri) throw new Error("No playable URI found");

      console.log("🔊 Playing Training Audio:", uri);

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      );

      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate(st => {
        if (st.isLoaded && st.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync().catch(() => { });
          soundRef.current = null;
        }
      });
      if (cachePlayedAudio) void cachePlayedAudio(entry).catch(() => undefined);
    } catch (e: any) {
      console.warn("⚠️ Training Audio error:", e);
      setIsPlaying(false);
    }
  };

  const playSyntheticSound = async (type: 'success' | 'error') => {
    try {
      const uri = type === 'success' ? SUCCESS_SOUND : ERROR_SOUND;
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate(st => {
        if (st.isLoaded && st.didJustFinish) {
          sound.unloadAsync().catch(() => { });
        }
      });
    } catch (e) { }
  };

  // لإصلاح مشكلة التسجيل: جلب المعرفات مسبقاً لضمان عدم فشل الإرسال عند إغلاق الشاشة
  const idsRef = useRef<{ dId: string, sId: string } | null>(null);

  useEffect(() => {
    const resolveIds = async () => {
      try {
        const dId = await AsyncStorage.getItem("@khmi/device_id");
        const sId = await AsyncStorage.getItem("@khmi/session_id");
        idsRef.current = { dId: dId || "unknown", sId: sId || "temp" };
      } catch (e) { }
    };
    resolveIds();
  }, []);

  const finishSession = useCallback(() => {
    if (!sessionActive.current || !currentStartTime.current) {
      onToggleCoptic(false);
      return;
    }

    const finalScore = currentScore.current;
    const startTime = currentStartTime.current!;
    const duration = Math.round((Date.now() - startTime) / 1000);
    const details = `Listening Practice - Score: ${finalScore}, Duration: ${duration}s`;

    // 1. الإرسال (Fire-and-forget)
    logActivity("training_session", undefined, details, duration * 1000);    // 2. الحفظ المحلي
    const newSession: TrainingSession = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      score: finalScore,
      duration: duration,
    };
    const updated = [newSession, ...history].slice(0, 20);
    setHistory(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => { });

    // 3. تنظيف الواجهة
    sessionActive.current = false;
    currentStartTime.current = null;
    setSessionStartTime(null);
    setCurrentEntry(null);
    if (soundRef.current) soundRef.current.unloadAsync().catch(() => { });
    onToggleCoptic(false);
  }, [history, onToggleCoptic]);

  // الحفظ التلقائي عند مغادرة الشاشة بأي شكل (مثل التنقل بالسفلي)
  useEffect(() => {
    return () => {
      if (sessionActive.current) {
        finishSession();
      }
    };
  }, [finishSession]);

  useEffect(() => {
    const handleBack = () => {
      // 1. إغلاق لوحة المفاتيح القبطية أولاً
      if (showCoptic) {
        onToggleCoptic(false);
        return true;
      }
      // 2. إذا كان في وضع فرعي (استماع أو كتابة يدوية)، ارجع لشاشة الاختيار
      if (trainingMode !== "choice") {
        // إنهاء الجلسة إن كانت نشطة
        if (sessionActive.current) {
          finishSession();
        }
        setTrainingMode("choice");
        return true; // منع الانتقال للخارج
      }
      // 3. شاشة الاختيار بدون جلسة → ارجع للشاشة الرئيسية (index.tsx)
      return false;
    };
    const backSub = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => backSub.remove();
  }, [trainingMode, finishSession, showCoptic, onToggleCoptic]);

  useEffect(() => {
    if (!copticKeyEvent?.key) return;
    const ch = copticKeyEvent.key;
    if (ch === "⌫") {
      setUserInput((prev) => prev.slice(0, -1));
    } else if (ch === "space") {
      setUserInput((prev) => prev + " ");
    } else {
      setUserInput((prev) => prev + ch);
    }
  // Depend on the unique event id — fires on every key press, including same-key repeats
  }, [copticKeyEvent?.id]);

  const checkAnswer = () => {
    if (!currentEntry) return;

    const target = normalizeCoptic(currentEntry.coptic);
    const input = normalizeCoptic(userInput);

    if (input === target && target.length > 0) {
      setFeedback({ type: "success", msg: t.training.correct });
      playSyntheticSound('success');
      const pts = Math.max(2, 10 - (hintsUsed * 2));
      setScore((s) => {
        const newScore = s + pts;
        currentScore.current = newScore;
        return newScore;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setFeedback({ type: "error", msg: t.training.incorrect });
      playSyntheticSound('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    Animated.spring(feedbackAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  };
  // Auto-save on unmount
  useEffect(() => {
    return () => {
      if (sessionActive.current && currentStartTime.current && currentScore.current > 0) {
        // We do not await this, just fire and forget on unmount
        AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
          let oldHistory: TrainingSession[] = [];
          if (saved) oldHistory = JSON.parse(saved);
          const duration = Math.round((Date.now() - currentStartTime.current!) / 1000);
          const newSession: TrainingSession = {
            id: Date.now().toString(),
            date: new Date().toLocaleDateString(),
            score: currentScore.current,
            duration: duration,
          };
          const updated = [newSession, ...oldHistory].slice(0, 20);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }).catch(() => { });
      }
    };
  }, []);

  return (
    <SafeAreaView edges={["bottom"]} style={[styles.root, { backgroundColor: bgColor }]}>
      {trainingMode === "choice" || trainingMode === "listening" ? (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: keyboardHeight + 80 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {trainingMode === "choice" ? (
          <View style={styles.choiceContainer}>
            {remoteControls.training_listening && (
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => { triggerHaptic(); setTrainingMode("listening"); }}
            >
              <LinearGradient colors={isDark ? ["#1E1E1E", "#121212"] : ["#FFFFFF", "#F8F8F8"]} style={[styles.choiceGradient, { borderColor: isDark ? "rgba(200,169,81,0.2)" : "rgba(200,169,81,0.4)", borderWidth: 1 }]}>
                <View style={styles.choiceIconWrap}>
                  <Feather name="headphones" size={24} color="#C8A951" />
                </View>
                <View style={styles.choiceTextWrap}>
                  <Text style={[styles.choiceTitle, { color: textColor, textAlign: 'center' }]} numberOfLines={2}>{buttonLabel("button_training_listening", t.training.listeningTitle)}</Text>
                  <Text style={[styles.choiceSub, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', textAlign: 'center' }]} numberOfLines={2}>{t.training.listeningSub}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            )}

            {remoteControls.training_handwriting && (
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => { triggerHaptic(); setTrainingMode("handwriting"); }}
            >
              <LinearGradient colors={isDark ? ["#1E1E1E", "#121212"] : ["#FFFFFF", "#F8F8F8"]} style={[styles.choiceGradient, { borderColor: isDark ? "rgba(200,169,81,0.2)" : "rgba(200,169,81,0.4)", borderWidth: 1 }]}>
                <View style={styles.choiceIconWrap}>
                  <Feather name="edit-3" size={24} color="#C8A951" />
                </View>
                <View style={styles.choiceTextWrap}>
                  <Text style={[styles.choiceTitle, { color: textColor, textAlign: 'center' }]} numberOfLines={2}>{buttonLabel("button_training_handwriting", t.training.handwritingTitle)}</Text>
                  <Text style={[styles.choiceSub, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', textAlign: 'center' }]} numberOfLines={2}>{t.training.handwritingSub}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            )}

            {remoteControls.training_grammar_quiz && (
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => { triggerHaptic(); setTrainingMode("grammar_quiz"); }}
            >
              <LinearGradient colors={isDark ? ["#1E1E1E", "#121212"] : ["#FFFFFF", "#F8F8F8"]} style={[styles.choiceGradient, { borderColor: isDark ? "rgba(200,169,81,0.2)" : "rgba(200,169,81,0.4)", borderWidth: 1 }]}>
                <View style={styles.choiceIconWrap}>
                  <Feather name="help-circle" size={24} color="#C8A951" />
                </View>
                <View style={styles.choiceTextWrap}>
                  <Text style={[styles.choiceTitle, { color: textColor, textAlign: 'center' }]} numberOfLines={2}>{buttonLabel("button_training_grammar_quiz", t.menu.grammar_quiz || "تدريب القواعد")}</Text>
                  <Text style={[styles.choiceSub, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', textAlign: 'center' }]} numberOfLines={2}>{lang === 'ar' ? "اختبر معلوماتك النحوية" : "Test your grammar knowledge"}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            )}

            {remoteControls.training_word_scramble && (
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => { triggerHaptic(); setTrainingMode("word_scramble"); }}
            >
              <LinearGradient colors={isDark ? ["#1E1E1E", "#121212"] : ["#FFFFFF", "#F8F8F8"]} style={[styles.choiceGradient, { borderColor: isDark ? "rgba(200,169,81,0.2)" : "rgba(200,169,81,0.4)", borderWidth: 1 }]}>
                <View style={styles.choiceIconWrap}>
                  <Feather name="shuffle" size={24} color="#C8A951" />
                </View>
                <View style={styles.choiceTextWrap}>
                  <Text style={[styles.choiceTitle, { color: textColor, textAlign: 'center' }]} numberOfLines={2}>{buttonLabel("button_training_word_scramble", t.menu.word_scramble || "ترتيب الحروف")}</Text>
                  <Text style={[styles.choiceSub, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', textAlign: 'center' }]} numberOfLines={2}>{lang === 'ar' ? "رتب الحروف لتكوين الكلمات" : "Arrange letters to form words"}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            )}

            {remoteControls.training_matching && (
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => { triggerHaptic(); setTrainingMode("matching_game"); }}
            >
              <LinearGradient colors={isDark ? ["#1E1E1E", "#121212"] : ["#FFFFFF", "#F8F8F8"]} style={[styles.choiceGradient, { borderColor: isDark ? "rgba(200,169,81,0.2)" : "rgba(200,169,81,0.4)", borderWidth: 1 }]}>
                <View style={styles.choiceIconWrap}>
                  <Feather name="link" size={24} color="#C8A951" />
                </View>
                <View style={styles.choiceTextWrap}>
                  <Text style={[styles.choiceTitle, { color: textColor, textAlign: 'center' }]} numberOfLines={2}>{buttonLabel("button_training_matching", t.menu.matching_game || "توصيل الكلمات")}</Text>
                  <Text style={[styles.choiceSub, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', textAlign: 'center' }]} numberOfLines={2}>{lang === 'ar' ? "قم بتوصيل الكلمة بمعناها" : "Match words with meanings"}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            )}

            {remoteControls.training_stats && (
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => { triggerHaptic(); setShowHandwritingStats(true); }}
            >
              <LinearGradient colors={isDark ? ["#1E1E1E", "#121212"] : ["#FFFFFF", "#F8F8F8"]} style={[styles.choiceGradient, { borderColor: isDark ? "rgba(200,169,81,0.2)" : "rgba(200,169,81,0.4)", borderWidth: 1 }]}>
                <View style={styles.choiceIconWrap}>
                  <Feather name="bar-chart-2" size={24} color="#C8A951" />
                </View>
                <View style={styles.choiceTextWrap}>
                  <Text style={[styles.choiceTitle, { color: textColor, textAlign: 'center' }]} numberOfLines={2}>{buttonLabel("button_training_stats", lang === 'ar' ? 'إحصائيات الكتابة' : 'Writing Stats')}</Text>
                  <Text style={[styles.choiceSub, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)', textAlign: 'center' }]} numberOfLines={2}>{lang === 'ar' ? 'تتبع تحسنك في رسم الحروف' : 'Track your handwriting progress'}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            )}
          </View>
        ) : trainingMode === "listening" ? (
          <>
            <TouchableOpacity style={styles.backToChoice} onPress={() => setTrainingMode("choice")}>
              <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={20} color={colors.primary} />
              <Text style={[styles.backText, { color: colors.primary }]}>{t.training.backToChoices}</Text>
            </TouchableOpacity>
            <View style={styles.header}>
              <Text style={[styles.title, { color: textColor }]}>{t.training.title}</Text>
              <Text style={styles.description}>{t.training.description}</Text>
            </View>

            {!currentEntry ? (
              <>
                {audioEntries.length === 0 ? (
                  <View style={styles.noAudioBox}>
                    <Feather name="download-cloud" size={48} color="#C8A951" style={{ marginBottom: 16 }} />
                    <Text style={[styles.noAudioTitle, { color: textColor }]}>
                      {t.training.noLocalAudioTitle}
                    </Text>
                    <Text style={styles.noAudioDesc}>
                      {t.training.noLocalAudioDesc}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.startBtn} onPress={pickNewWord}>
                    <Feather name="play-circle" size={24} color="#fff" />
                    <Text style={styles.startText}>{t.training.start}</Text>
                  </TouchableOpacity>
                )}

                {history.length > 0 && (
                  <View style={styles.historySection}>
                    <View style={styles.historySectionHeader}>
                      <Feather name="bar-chart-2" size={18} color="#C8A951" />
                      <Text style={[styles.historyTitle, { color: textColor }]}>{t.training.historyTitle}</Text>
                    </View>
                    {history.map((session, index) => (
                      <View key={session.id} style={[styles.historyCard, { backgroundColor: cardBg }]}>
                        <View style={styles.historyHeader}>
                          <Text style={styles.sessionNo}>{session.date}</Text>
                          <Feather name="check-circle" size={16} color="#4CAF50" />
                        </View>
                        <View style={styles.historyStats}>
                          <View style={styles.statContainer}>
                            <Text style={styles.statLabel}>{t.training.score}</Text>
                            <Text style={[styles.statValue, { color: "#C8A951" }]}>{session.score}</Text>
                          </View>
                          <View style={styles.divider} />
                          <View style={styles.statContainer}>
                            <Text style={styles.statLabel}>{t.training.duration}</Text>
                            <Text style={[styles.statValue, { color: "#8B0000" }]}>
                              {session.duration} {t.training.seconds}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : null}
          </>
        ) : null}
        </ScrollView>
      ) : trainingMode === "grammar_quiz" ? (
        <GrammarQuizScreen entries={entries} onBack={() => setTrainingMode("choice")} />
      ) : trainingMode === "word_scramble" ? (
        <WordScrambleScreen entries={entries} onBack={() => setTrainingMode("choice")} />
      ) : trainingMode === "matching_game" ? (
        <MatchingGameScreen entries={entries} onBack={() => setTrainingMode("choice")} />
      ) : null}


      <CopticHandwritingModal
        visible={trainingMode === "handwriting"}
        onClose={() => setTrainingMode("choice")}
      />

      <Modal
        visible={showHandwritingStats}
        animationType="slide"
        onRequestClose={() => setShowHandwritingStats(false)}
      >
        <HandwritingStats onClose={() => setShowHandwritingStats(false)} />
      </Modal>


      {/* Fixed game panel shown when a word is active */}
      {currentEntry && (
        <View style={[styles.gamePanel, { bottom: keyboardHeight }]}>
          {/* Score + Finish row */}
          <View style={styles.scoreRow}>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreLabel}>{t.training.score}</Text>
              <Text style={styles.scoreValue}>{score}</Text>
            </View>
            <TouchableOpacity style={styles.finishBtn} onPress={finishSession}>
              <Text style={styles.finishText}>{t.training.finish}</Text>
            </TouchableOpacity>
          </View>

          {/* Audio play button */}
          <TouchableOpacity
            style={[styles.audioBtn, isPlaying && styles.audioBtnPlaying]}
            onPress={() => playCurrentWord()}
            disabled={isPlaying}
            activeOpacity={0.7}
          >
            <Feather name={isPlaying ? "loader" : "volume-2"} size={36} color="#C8A951" />
          </TouchableOpacity>

          {/* Feedback */}
          {feedback.type && (
            <Animated.View
              style={[
                styles.feedback,
                {
                  opacity: feedbackAnim,
                  transform: [{ scale: feedbackAnim }],
                  backgroundColor: feedback.type === "success" ? "rgba(76,175,80,0.12)" : "rgba(244,67,54,0.12)",
                  borderColor: feedback.type === "success" ? "#4CAF50" : "#F44336",
                }
              ]}
            >
              <Feather
                name={feedback.type === "success" ? "check-circle" : "x-circle"}
                size={16}
                color={feedback.type === "success" ? "#4CAF50" : "#F44336"}
              />
              <Text style={[styles.feedbackText, { color: feedback.type === "success" ? "#4CAF50" : "#F44336" }]}>
                {feedback.msg}
              </Text>
            </Animated.View>
          )}

          {/* Input field */}
          <View style={[styles.inputCard, { backgroundColor: cardBg }]}>
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder={t.training.placeholder}
              placeholderTextColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
              value={userInput}
              onChangeText={setUserInput}
              showSoftInputOnFocus={false}
              onFocus={() => onToggleCoptic(true)}
              onPressIn={() => onToggleCoptic(true)}
              autoComplete="off"
              autoCorrect={false}
              spellCheck={false}
            />
          </View>

          {/* Hint Area */}
          <View style={styles.hintContainer}>
            {hintsUsed > 0 && (
              <Text style={styles.hintText}>
                {currentEntry.coptic.substring(0, hintsUsed)}
              </Text>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            {feedback.type !== "success" && (
              <TouchableOpacity
                style={styles.hintBtn}
                onPress={() => setHintsUsed(h => Math.min(h + 1, currentEntry.coptic.trim().length - 1))}
              >
                <Feather name="help-circle" size={18} color="#C8A951" />
                <Text style={styles.hintBtnText}>{t.training.hint}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.checkBtn} onPress={checkAnswer}>
              <Text style={styles.checkText}>{t.training.check}</Text>
            </TouchableOpacity>

            {feedback.type === "success" && (
              <TouchableOpacity style={styles.nextBtn} onPress={pickNewWord}>
                <Text style={styles.nextText}>{t.training.nextWord}</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  choiceContainer: {
    width: "100%",
    paddingTop: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  choiceCard: {
    width: "48%",
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  choiceGradient: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    minHeight: 125,
    gap: 4,
  },
  choiceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(200,169,81,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  choiceTextWrap: {
    flex: 1,
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  choiceTitle: {
    color: "#FFF",
    width: "100%",
    flexShrink: 1,
    fontSize: 12,
    fontFamily: "Cairo_700Bold",
    marginBottom: 2,
    textAlign: "center",
  },
  choiceSub: {
    color: "rgba(255,255,255,0.7)",
    width: "100%",
    flexShrink: 1,
    fontSize: 9,
    fontFamily: "Cairo_400Regular",
    textAlign: "center",
    lineHeight: 12,
  },
  backToChoice: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 10,
    gap: 8,
  },
  backText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
  },

  scroll: {
    padding: 20,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 15,
    maxWidth: 300,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 5,
    textAlign: "center",
  },
  description: {
    fontSize: 12,
    color: "#888888",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  startBtn: {
    backgroundColor: "#8B0000",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 30,
    gap: 10,
    marginTop: 20,
    marginBottom: 40,
    shadowColor: "#8B0000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  noAudioBox: {
    alignItems: "center",
    marginTop: 40,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  noAudioTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 10,
  },
  noAudioDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
  },
  startText: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  gameArea: {
    width: "100%",
    alignItems: "center",
  },
  gamePanel: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "rgba(20,3,3,0.97)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 25,
    alignItems: "center",
    gap: 10,
  },
  inputCard: {
    width: "100%",
    borderRadius: 14,
    height: 72,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(200,169,81,0.3)",
    justifyContent: "center",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(200,169,81,0.1)",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    gap: 8,
  },
  scoreLabel: {
    fontSize: 12,
    color: "#C8A951",
    fontFamily: "Inter_600SemiBold",
  },
  scoreValue: {
    fontSize: 16,
    color: "#C8A951",
    fontFamily: "Inter_700Bold",
  },
  finishBtn: {
    backgroundColor: "rgba(139,0,0,0.1)",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(139,0,0,0.3)",
  },
  finishText: {
    color: "#8B0000",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  audioBtnWrap: {
    width: "100%",
    marginBottom: 6,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  input: {
    fontSize: 28,
    fontFamily: "CSAvaVeni-Regular",
    textAlign: "center",
    height: "100%",
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  feedback: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 20,
  },
  feedbackText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  actions: {
    flexDirection: "row",
    gap: 15,
    width: "100%",
    justifyContent: "center",
  },
  checkBtn: {
    backgroundColor: "#8B0000",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 24,
  },
  checkText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  nextBtn: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nextText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  historySection: {
    width: "100%",
    marginTop: 40,
  },
  historySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  historyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "left",
  },
  historyCard: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  sessionNo: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#8B0000",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    opacity: 0.5,
  },
  historyDate: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  historyStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 12,
    paddingVertical: 10,
  },
  statContainer: {
    alignItems: "center",
    flex: 1,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  statLabel: {
    fontSize: 10,
    color: "#888",
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  audioBtn: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(200,169,81,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "rgba(200,169,81,0.3)",
  },
  audioBtnPlaying: {
    backgroundColor: "rgba(200,169,81,0.2)",
    borderColor: "#C8A951",
  },
  hintContainer: {
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  hintText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#C8A951",
    letterSpacing: 4,
  },
  hintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: "rgba(200,169,81,0.1)",
    borderRadius: 20,
  },
  hintBtnText: {
    color: "#C8A951",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
