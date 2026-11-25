import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
  Dimensions,
  Alert,
  Image,
  Modal,
  ScrollView,
  TextInput,
  BackHandler,
  Platform,
  Share,
  KeyboardAvoidingView,
  AppState,
  AppStateStatus,
  Keyboard,
  Animated as RNAnimated,
  Linking,
} from "react-native";
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { useLang } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAdmin } from "@/contexts/AdminContext";
import { INITIAL_LESSONS } from "@/assets/lessonCatalog";
import Animated, { FadeInDown, FadeInUp, SlideInLeft } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from "expo-web-browser";
import * as MediaLibrary from 'expo-media-library';
import { Video, ResizeMode, Audio } from "expo-av";
import * as Sharing from 'expo-sharing';
import * as Haptics from "expo-haptics";
import { captureRef } from 'react-native-view-shot';
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import { logActivity } from "@/hooks/useUserTracking";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { lessonVisibilityKey } from "@/lib/remoteVisibility";
import * as DocumentPicker from 'expo-document-picker';
import { fetchDictionaryData, type DictionaryEntry } from "@/hooks/useDictionary";
import { loadEntries, saveEntries } from "@/hooks/useOfflineStorage";
import { WordDetailModal } from "@/components/WordDetailModal";
import { WordCard } from "@/components/WordCard";

const MarqueeBanner = ({ text }: { text: string }) => {
  const { isDark } = useTheme();
  const scrollAnim = useRef(new RNAnimated.Value(width)).current;

  useEffect(() => {
    if (!text) return;
    const duration = text.length * 200;
    const animation = RNAnimated.loop(
      RNAnimated.timing(scrollAnim, {
        toValue: -width * 1.5,
        duration: duration,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [text]);

  if (!text) return null;

  return (
    <View style={{
      height: 35,
      backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#334155" : "#E2E8F0",
      overflow: 'hidden',
      justifyContent: 'center'
    }}>
      <RNAnimated.Text
        numberOfLines={1}
        style={{
          transform: [{ translateX: scrollAnim }],
          color: isDark ? "#C8A951" : "#8B0000",
          fontFamily: "Cairo_700Bold",
          fontSize: 13,
        }}
      >
        {text}
      </RNAnimated.Text>
    </View>
  );
};


const { width, height } = Dimensions.get("window");
const CACHE_KEY = "@coptic_lessons_v6_cache";
const EXAM_QUESTIONS_PREFIX = "@exam_q_v2_";
const EXAM_OFFLINE_SUBMISSIONS = "@exam_offline_subs";
const SUBMITTED_EXAMS_KEY = "@submitted_exams_v2";
const WATCHED_LESSONS_KEY = "@watched_lessons_v1";

// ذاكرة مؤقتة سريعة جداً للشهادات (In-memory cache)
let globalCertMappings: { [level: string]: any } = {};


// ✅ رابط السيرفر المركزي الموحد
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz5KnoKYSa1cJAtMg4jZ2n5Rh5zlX3e1zXJG17saKB_4lj8KZYblVh26sH0DntSqfOFZg/exec";

const isWeb = Platform.OS === "web";
const STORAGE_DIR = !isWeb ? `${FileSystem.documentDirectory}coptic_learn/` : "";
const GLOBAL_COVER_ID = "18FxsPyqqvc3hdUKiqKT-UNXT2Pn4PmPp";
const LOCAL_COVER_PATH = STORAGE_DIR ? STORAGE_DIR + "global_lesson_cover.jpg" : "";
const BACKGROUND_SYNC_TASK = "BACKGROUND_EXAM_SYNC";

// تعريف مهمة المزامنة في الخلفية (حتى لو التطبيق مقفول)
if (!isWeb) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return BackgroundFetch.BackgroundFetchResult.NoData;

      // 1. مزامنة الشهادات وحالات الطلاب للجميع (Stealth Sync)
      for (let lvl of ["1", "2"]) {
        try {
          const resp = await fetch(`${APPS_SCRIPT_URL}?action=getAllCertificates&level=${lvl}`);
          const fullMapping = await resp.json();
          if (fullMapping && !fullMapping.error) {
            await AsyncStorage.setItem(`@cached_cert_mapping_v1_lvl_${lvl}`, JSON.stringify(fullMapping));

            // 🔥 مزامنة صور الجميع في الخلفية (نظام الدفعات)
            const allCerts = Object.values(fullMapping).filter((c: any) => c.isEligible && c.id);
            for (let i = 0; i < allCerts.length; i += 3) {
              const batch = allCerts.slice(i, i + 3);
              await Promise.all(batch.map(async (cert: any) => {
                const imgUri = `${FileSystem.documentDirectory}certs/cert_${lvl}_${cert.id}.png`;
                const info = await FileSystem.getInfoAsync(imgUri);
                if (!info.exists) {
                  const imgUrl = `https://docs.google.com/presentation/d/${cert.id}/export/png?size=1000`;
                  await FileSystem.downloadAsync(imgUrl, imgUri).catch(() => { });
                }
              }));
              await new Promise(r => setTimeout(r, 200));
            }
          }
        } catch (e) { }
      }

      // 2. ترحيل الامتحانات المحفوظة أوفلاين
      const offlineSubsStr = await AsyncStorage.getItem(EXAM_OFFLINE_SUBMISSIONS);
      if (offlineSubsStr) {
        let list = JSON.parse(offlineSubsStr);
        if (Array.isArray(list) && list.length > 0) {
          const sub = list[0];
          const resp = await fetch(`${APPS_SCRIPT_URL}?action=submitExam`, {
            method: "POST",
            body: JSON.stringify(sub),
            headers: { "Content-Type": "application/json" }
          });
          const res = await resp.json();
          if (res.success || res.already_submitted || res.already_processed) {
            list.shift();
            await AsyncStorage.setItem(EXAM_OFFLINE_SUBMISSIONS, JSON.stringify(list));
          }
        }
      }
      // 3. تنظيف الملفات القديمة (أكثر من أسبوع) لعدم استهلاك مساحة
      try {
        const certDir = `${FileSystem.documentDirectory}certs/`;
        const dirInfo = await FileSystem.getInfoAsync(certDir);
        if (dirInfo.exists) {
          const files = await FileSystem.readDirectoryAsync(certDir);
          const now = Date.now();
          const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
          for (const file of files) {
            const filePath = certDir + file;
            const fInfo = await FileSystem.getInfoAsync(filePath);
            const info = fInfo as any;
            if (info.exists && info.modificationTime && (now - (info.modificationTime * 1000) > ONE_WEEK)) {
              await FileSystem.deleteAsync(filePath, { idempotent: true });
            }
          }
        }
      } catch (e) { }

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}


interface Question {
  id: string;
  title: string;
  type: string;
  choices: string[];
}

interface Lesson {
  level: string;
  title: string;
  videoId: string;
  oralId?: string;
  examUrl: string;
  category?: string;
  localVideo?: string;
  localOral?: string;
  questions?: Question[];
  sizeMB?: number;
  targetSheetUrl?: string;
  targetSheetName?: string;
  summaryId?: string;
  localSummary?: string;
  hideKey?: string;
}

const INITIAL_LESSON_DATA = INITIAL_LESSONS as Lesson[];

interface LessonGlossaryWord {
  key: string;
  coptic: string;
  arabic: string;
  entry: DictionaryEntry;
}

interface LessonGlossaryState {
  lessonNumber: number;
  lessonTitle: string;
  letters: string[];
  words: LessonGlossaryWord[];
  loading: boolean;
  error?: string;
}

const LEVEL_ONE_GLOSSARY_LETTERS: Record<number, string[]> = {
  1: ["Ⲁ", "Ⲥ", "Ⲧ", "Ⲛ"],
  2: ["Ⲏ", "Ⲕ", "Ⲣ", "Ⲙ"],
  3: ["Ⲉ", "ϣ", "Ⲍ", "Ϥ"],
  4: ["Ⲟ", "Ⲗ", "Ⲫ", "Ϩ"],
  5: ["Ⲓ", "Ⲱ", "Ⲡ", "Ϧ"],
  6: ["Ⲝ", "Ϯ", "Ⲇ"],
  7: ["Ⲃ", "Ⲯ", "Ϭ"],
  8: ["Ⲩ", "Ⲑ", "Ϫ"],
  9: ["Ⲭ", "Ⲅ"],
};

const LESSON_ORDINAL_ARABIC: Record<number, string> = {
  1: "الأول", 2: "الثاني", 3: "الثالث", 4: "الرابع", 5: "الخامس",
  6: "السادس", 7: "السابع", 8: "الثامن", 9: "التاسع",
};

const COPTIC_LETTER = /^[\u2C80-\u2CFF\u03E2-\u03EF]$/u;
let UNICODE_LETTER: RegExp | null = null;
try {
  UNICODE_LETTER = new RegExp("\\p{L}", "u");
} catch {
  // Fallback below supports older JavaScript engines without Unicode properties.
}
const NON_COPTIC_LETTER_FALLBACK = /^[A-Za-z\u00C0-\u024F\u0370-\u03E1\u03F0-\u03FF\u1F00-\u1FFF\u0590-\u08FF]$/u;

function buildLessonGlossaryWords(
  entries: DictionaryEntry[],
  lessonLetters: string[],
  currentLessonLetters: string[],
  allowJenkim: boolean,
): LessonGlossaryWord[] {
  const allowed = new Set(lessonLetters.map((letter) => letter.normalize("NFKC").toLocaleLowerCase()));
  const current = new Set(currentLessonLetters.map((letter) => letter.normalize("NFKC").toLocaleLowerCase()));
  const words: LessonGlossaryWord[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const arabic = (entry.arabic || "").trim();
    if (!arabic) continue;

    // Begin with a newly taught letter; later characters may use any earlier/current taught letter.
    // This preserves the lesson progression: ⲁⲣ can qualify in lesson 6, while ⲣⲁ cannot.
    const forms = (entry.coptic || "")
      .split(/[\u060C,;\u061B/\n]+/)
      .map((form) => form.trim())
      .filter((form) => {
        const hasJenkim = /[\u0300-\u036F\u2CBB\u2CBC\u25CC`]/u.test(form);
        if (hasJenkim && !allowJenkim) return false;

        // Normalize marks for matching only; never strip them from the displayed form.
        const normalizedForm = form.normalize("NFKC").toLocaleLowerCase()
          .replace(/[\u0300-\u036F\u2CBB\u2CBC\u25CC`]/gu, "");
        const firstCharacter = Array.from(normalizedForm)[0];
        if (!firstCharacter || !COPTIC_LETTER.test(firstCharacter) || !current.has(firstCharacter)) return false;
        const letters: string[] = [];
        let hasOtherLetter = false;
        for (const character of Array.from(normalizedForm)) {
          if (COPTIC_LETTER.test(character)) letters.push(character);
          else if (UNICODE_LETTER ? UNICODE_LETTER.test(character) : NON_COPTIC_LETTER_FALLBACK.test(character)) {
            hasOtherLetter = true;
            break;
          }
        }
        return !hasOtherLetter && letters.length >= 2 && letters.every((letter) => allowed.has(letter));
      });

    for (const coptic of forms) {
      const identity = `${coptic.normalize("NFKC").toLocaleLowerCase()}\u0000${arabic.normalize("NFKC").trim()}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      words.push({ key: `${entry.id}:${words.length}`, coptic, arabic, entry: { ...entry, coptic } });
    }
  }

  return words;
}

const SOUNDS = {
  correct: require("../assets/sounds/correct.mp3"),
  wrong: require("../assets/sounds/wrong.mp3"),
  success: require("../assets/sounds/success.mp3"),
  click: require("../assets/sounds/click.mp3"),
};

const playExamSound = async (type: keyof typeof SOUNDS) => {
  try {
    // التحقق من أن التطبيق في الواجهة قبل تشغيل الصوت لتجنب كراش AudioFocus
    if (Platform.OS !== "web" && AppState.currentState !== "active") return;

    const { sound } = await Audio.Sound.createAsync(SOUNDS[type]);
    await sound.playAsync();
    // تحرير الذاكرة بعد الانتهاء
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch (e) { console.log("Sound play error", e); }
};

export function LearnCopticScreen() {
  const { isDark } = useTheme();
  const { t, isRTL, lang } = useLang();
  const { config, remoteSettings } = useAppConfig();
  const { currentAppLink } = useAppUpdate();
  const remoteControls = remoteSettings.controls;
  const buttonLabel = (key: keyof typeof remoteSettings.labels, fallback: string) => remoteSettings.labels[key]?.trim() || fallback;
  const { isAdminMode, unlockAllLevels } = useAdmin();
  const insets = useSafeAreaInsets();

  const [lessons, setLessons] = useState<Lesson[]>(INITIAL_LESSON_DATA);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const triggerHaptic = (type: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    if (!isWeb) Haptics.impactAsync(type);
  };

  const triggerSuccessHaptic = () => {
    if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<Lesson | null>(null);
  const [viewingOral, setViewingOral] = useState<Lesson | null>(null);
  const [viewingSummary, setViewingSummary] = useState<Lesson | null>(null);
  const [lessonGlossary, setLessonGlossary] = useState<LessonGlossaryState | null>(null);
  const [selectedGlossaryWord, setSelectedGlossaryWord] = useState<LessonGlossaryWord | null>(null);
  const [localCoverExists, setLocalCoverExists] = useState(false);
  const [examModal, setExamModal] = useState<Lesson | null>(null);
  const [isLoadingExam, setIsLoadingExam] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [currentAnswers, setCurrentAnswers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [validCodesMap, setValidCodesMap] = useState<Record<string, string>>({});
  const [allowedCodes, setAllowedCodes] = useState<string[]>([]);
  const [watchedLessons, setWatchedLessons] = useState<Set<string>>(new Set());
  const [playbackPositions, setPlaybackPositions] = useState<Record<string, number>>({});
  const [submittedExams, setSubmittedExams] = useState<string[]>([]);
  const [finalExamStep, setFinalExamStep] = useState(1);
  const [isVerifyingFinalExam, setIsVerifyingFinalExam] = useState(false);

  const [certModalVisible, setCertModalVisible] = useState(false);
  const [certSearchCode, setCertSearchCode] = useState("");
  const [isSearchingCert, setIsSearchingCert] = useState(false);
  const [foundCert, setFoundCert] = useState<{ url: string; id: string; isLocal?: boolean; localPath?: string; localImgPath?: string; name?: string; statusMessage?: string } | null>(null);
  const [isDownloadingCert, setIsDownloadingCert] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiAnims = useRef(Array.from({ length: 50 }, () => ({
    x: new RNAnimated.Value(Math.random() * width),
    y: new RNAnimated.Value(-20 - Math.random() * 200),
    rotate: new RNAnimated.Value(0),
    opacity: new RNAnimated.Value(1),
  }))).current;
  const [systemAlert, setSystemAlert] = useState<{ title: string; message: string; type: "success" | "error" | "info" | "warning"; actionLabel?: string; onAction?: () => void; forceLTR?: boolean } | null>(null);
  const [levelInstructions, setLevelInstructions] = useState<Record<string, string>>({});
  const [instModalVisible, setInstModalVisible] = useState(false);
  const [currentInstText, setCurrentInstText] = useState("");
  const [autoSyncLevels, setAutoSyncLevels] = useState<Record<string, boolean>>({});
  const [snapshotQuestions, setSnapshotQuestions] = useState<any>(null);
  const [isCapturing, setIsCapturing] = useState(false);



  const videoViewRef = useRef(null);
  const lessonsCacheLoadedRef = useRef(false);
  const oralViewRef = useRef(null);
  const videoPlayerRef = useRef<Video>(null);
  const glossaryRequestRef = useRef(0);
  const glossaryOnlineRef = useRef<boolean | null>(null);
  const certSearchIdRef = useRef(0);
  const examLoadRequestRef = useRef(0);
  const examScrollRef = useRef<ScrollView>(null);
  const examReviewRef = useRef<View>(null);

  const downloadExamReview = async () => {
    if (!examResult?.reviewQuestions) return;
    try {
      setIsCapturing(true);
      const questions = examResult.reviewQuestions.filter((q: any) => {
        const isCodeField = q.title.includes("كود") || q.title.toLowerCase().includes("code");
        const isNameField = q.title === "الاسم" || q.title.includes("الاسم ثلاثي") || q.title.includes("اسم الطالب");
        const isPasswordField = q.title.includes("سر") || q.title.includes("باسورد") || q.title.toLowerCase().includes("password");
        const isPersonalInfoField = isNameField || q.title.includes("محافظة") || q.title.includes("دولة") || q.title.includes("سن") || q.title.includes("عمر") || q.title.includes("مستوى") || q.title.includes("مستواك") || q.title.includes("رسالة") || q.title.includes("دعم") || q.title.includes("تشجيع");
        return !(isCodeField || isPasswordField || isPersonalInfoField);
      });

      const chunks = [];
      for (let i = 0; i < questions.length; i += 10) {
        chunks.push(questions.slice(i, i + 10));
      }

      for (let i = 0; i < chunks.length; i++) {
        setSnapshotQuestions({
          questions: chunks[i],
          page: i + 1,
          total: chunks.length
        });

        await new Promise(resolve => setTimeout(resolve, 800));

        if (examReviewRef.current) {
          const uri = await captureRef(examReviewRef.current, { format: "jpg", quality: 0.8 });
          const lessonName = (examResult.title || "Exam").replace(/[\s\/]/g, "_");
          const fileName = `Exam_Lvl${examResult.level || ""}_${lessonName}_Part${i + 1}_Khmi.jpg`;
          const destUri = `${FileSystem.cacheDirectory}${fileName}`;

          await FileSystem.copyAsync({ from: uri, to: destUri });
          await MediaLibrary.saveToLibraryAsync(destUri);
        }
      }

      setSnapshotQuestions(null);
      setIsCapturing(false);
      setSystemAlert({ title: "تم الحفظ", message: `تم حفظ ${chunks.length} صورة للإجابات النموذجية بنجاح في الاستوديو باسم القاموس.`, type: "success", forceLTR: true });
    } catch (e) {
      setIsCapturing(false);
      setSnapshotQuestions(null);
      setSystemAlert({ title: "خطأ", message: "حدث خطأ أثناء حفظ الإجابات.", type: "error" });
    }
  };

  const lastPosRef = useRef<number>(0);
  const lastLeftPressRef = useRef(0);
  const lastRightPressRef = useRef(0);
  const lastCenterPressRef = useRef(0);

  const getLessonNum = (txt: string) => {
    if (!txt) return 0;
    const normalized = txt.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    const numericMatch = normalized.match(/(?:الدرس|lesson)\s*[-#:]?\s*(\d{1,2})(?:\D|$)/i);
    if (numericMatch) {
      const number = Number(numericMatch[1]);
      if (number >= 1 && number <= 9) return number;
    }
    if (txt.includes("الأول") || txt.includes("الاول")) return 1;
    if (txt.includes("الثاني") || txt.includes("التاني")) return 2;
    if (txt.includes("الثالث") || txt.includes("التالت")) return 3;
    if (txt.includes("الرابع")) return 4;
    if (txt.includes("الخامس")) return 5;
    if (txt.includes("السادس")) return 6;
    if (txt.includes("السابع")) return 7;
    if (txt.includes("الثامن")) return 8;
    if (txt.includes("التاسع")) return 9;
    return 0;
  };

  const isLessonVisible = (lesson: Lesson) => {
    const title = (lesson.category || lesson.title || "").trim();
    if (/مراجعة|review/i.test(title)) return remoteControls.learn_review_videos;
    if (/فيديو تعريفي|introductory video/i.test(title)) return remoteControls.learn_intro_video;
    if (/مقدمة.*حروف|حروف.*مقدمة|letters introduction/i.test(title)) return remoteControls.learn_letter_intro;
    if (/الدرس|lesson/i.test(title)) {
      const number = getLessonNum(title);
      if (number >= 1 && number <= 9) return remoteSettings.visibility.lessons[lessonVisibilityKey(lesson.level, lesson.videoId)] !== false;
    }
    return true;
  };

  useEffect(() => {
    if (!selectedLevel || !selectedCategory) return;
    const categoryStillVisible = lessons.some((lesson) => String(lesson.level) === String(selectedLevel) && lesson.category === selectedCategory && isLessonVisible(lesson));
    if (!categoryStillVisible) setSelectedCategory(null);
  }, [selectedLevel, selectedCategory, lessons, remoteSettings.visibility.lessons, remoteControls.learn_review_videos, remoteControls.learn_intro_video, remoteControls.learn_letter_intro]);

  const isCodeFormValid = studentName.trim().split(/\s+/).length >= 3 && studentPhone.replace(/[^0-9]/g, "").length >= 8;

  const generateNewCode = async () => {
    if (!isCodeFormValid) return;
    const cleanPhone = studentPhone.replace(/[^0-9]/g, "");
    const last8 = cleanPhone.slice(-8);
    let finalCode = "";
    if (isAdminMode && (last8 === "00000000" || cleanPhone.endsWith("000"))) {
      finalCode = "000";
    } else {
      let codeNum = parseInt(last8, 10);
      codeNum = codeNum + 5647;
      codeNum = codeNum * 2;
      codeNum = codeNum + 18888;
      finalCode = codeNum.toString();
    }
    setIsGenerating(true);
    try {
      const net = await NetInfo.fetch();
      const cachedMap = await AsyncStorage.getItem("@cached_codes_map");
      const localMap = cachedMap ? JSON.parse(cachedMap) : {};
      localMap[finalCode] = studentName;
      await AsyncStorage.setItem("@cached_codes_map", JSON.stringify(localMap));
      setValidCodesMap(localMap);
      if (!net.isConnected) {
        const storedQueue = await AsyncStorage.getItem("@offline_codes_queue");
        const queue = storedQueue ? JSON.parse(storedQueue) : [];
        if (!queue.find((q: any) => q.code === finalCode)) {
          queue.push({ name: studentName, phone: cleanPhone, code: finalCode });
          await AsyncStorage.setItem("@offline_codes_queue", JSON.stringify(queue));
        }
        setGeneratedCode(finalCode);
        setUserEmail(finalCode);
        await AsyncStorage.setItem("@user_email", finalCode);
        await AsyncStorage.setItem("@user_name", studentName);
        logActivity("name_coptic", undefined, studentName);
        setIsGenerating(false);
        return;
      }
      const resp = await fetch(`${APPS_SCRIPT_URL}?action=generateCode`, {
        method: "POST",
        body: JSON.stringify({ action: "generateCode", name: studentName, phone: cleanPhone, code: finalCode }),
        headers: { "Content-Type": "application/json" }
      });
      const res = await resp.json();
      if (res.success) {
        setGeneratedCode(finalCode);
        setUserEmail(finalCode);
        await AsyncStorage.setItem("@user_email", finalCode);
        await AsyncStorage.setItem("@user_name", studentName);
        logActivity("name_coptic", undefined, studentName);
      } else {
        Alert.alert("خطأ", "فشل تسجيل الكود، حاول مرة أخرى.");
      }
    } catch (e) {
      Alert.alert("خطأ", "حدث مشكلة في الاتصال.");
    } finally {
      setIsGenerating(false);
    }
  };


  const handleSearchCertificate = async (forceRefresh = false) => {
    const searchId = ++certSearchIdRef.current;
    Keyboard.dismiss();
    if (!certSearchCode.trim()) return;

    const code = certSearchCode.trim();
    const level = selectedLevel || "1";
    const cacheKey = `@cached_cert_mapping_v1_lvl_${level}`;

    setIsSearchingCert(true);
    setFoundCert(null);
    // منح الواجهة فرصة للمسح قبل عرض أي نتيجة جديدة
    await new Promise(r => setTimeout(r, 10));

    if (searchId !== certSearchIdRef.current) return;

    let foundInCache = false;

    // 1. محاولة البحث في الذاكرة الحية أولاً
    if (!forceRefresh && globalCertMappings[level] && globalCertMappings[level][code]) {
      if (searchId === certSearchIdRef.current) {
        await showCertificateInstantly(globalCertMappings[level][code], level, code);
        foundInCache = true;
      }
    }

    if (searchId !== certSearchIdRef.current) return;
    // 2. محاولة البحث في الذاكرة الدائمة لو مش موجود في الحية
    if (!foundInCache && !forceRefresh) {
      try {
        const cachedMappingStr = await AsyncStorage.getItem(cacheKey);
        if (cachedMappingStr && searchId === certSearchIdRef.current) {
          const mapping = JSON.parse(cachedMappingStr);
          globalCertMappings[level] = mapping;
          if (mapping[code]) {
            await showCertificateInstantly(mapping[code], level, code);
            foundInCache = true;
          }
        }
      } catch (e) { }
    }

    if (foundInCache || searchId !== certSearchIdRef.current) {
      if (searchId === certSearchIdRef.current) setIsSearchingCert(false);
      return;
    }

    // 3. التحديث من السيرفر (إما لإكمال البحث أو لتحديث البيانات القديمة)
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      if (!foundInCache && searchId === certSearchIdRef.current) {
        setFoundCert({
          isEligible: false,
          statusMessage: "يرجى حل الامتحانات اللازمة للحصول على الشهادة.",
          id: "offline_error",
          url: ""
        } as any);
      }
      if (searchId === certSearchIdRef.current) setIsSearchingCert(false);
      return;
    }

    if (searchId !== certSearchIdRef.current) return;

    try {
      const resp = await fetch(`${APPS_SCRIPT_URL}?action=getCertificateFullStatus&code=${code}&level=${level}`);
      const res = await resp.json();

      if (searchId !== certSearchIdRef.current) return;

      if (res.success) {
        let certData = res.isEligible
          ? { isEligible: true, url: res.certificateUrl, id: res.presentationId, name: res.name }
          : { isEligible: false, missingLessons: res.missingLessons, name: res.name, statusMessage: res.statusMessage };

        // تحديث الكاش
        if (!globalCertMappings[level]) globalCertMappings[level] = {};
        globalCertMappings[level][code] = certData;

        // عرض النتيجة النهائية
        if (searchId === certSearchIdRef.current) {
          await showCertificateInstantly(certData, level, code);
        }

        // حفظ الكاش
        const currentMap = await AsyncStorage.getItem(cacheKey);
        const mapping = currentMap ? JSON.parse(currentMap) : {};
        mapping[code] = certData;
        await AsyncStorage.setItem(cacheKey, JSON.stringify(mapping));

        if (certData.isEligible && certData.id) preDownloadCertificate(certData.id, level);
      } else {
        if (!foundInCache && searchId === certSearchIdRef.current) {
          setFoundCert({
            isEligible: false,
            statusMessage: "عفواً، هذا الكود غير مسجل في النظام. تأكد من كتابة الكود بشكل صحيح.",
            id: "not_found",
            url: ""
          } as any);
        }
      }
    } catch (e) {
      if (!foundInCache && searchId === certSearchIdRef.current) {
        setFoundCert({
          isEligible: false,
          statusMessage: "حدث خطأ أثناء الاتصال بالسيرفر. يرجى المحاولة لاحقاً.",
          id: "server_error",
          url: ""
        } as any);
      }
    } finally {
      if (searchId === certSearchIdRef.current) setIsSearchingCert(false);
    }
  };

  const showCertificateInstantly = async (certData: any, level: string, code: string) => {
    let finalCert = { ...certData };

    if (finalCert.isEligible) {
      triggerSuccessHaptic();
      playExamSound('success');
      // تشغيل الكونفيتي
      confettiAnims.forEach(anim => {
        anim.x.setValue(Math.random() * width);
        anim.y.setValue(-20 - Math.random() * 200);
        anim.rotate.setValue(0);
        anim.opacity.setValue(1);
      });
      setShowConfetti(true);
      confettiAnims.forEach(anim => {
        const duration = 2000 + Math.random() * 1500;
        RNAnimated.parallel([
          RNAnimated.timing(anim.y, { toValue: height + 50, duration, useNativeDriver: true }),
          RNAnimated.timing(anim.rotate, { toValue: 5 + Math.random() * 10, duration, useNativeDriver: true }),
          RNAnimated.sequence([
            RNAnimated.delay(duration * 0.7),
            RNAnimated.timing(anim.opacity, { toValue: 0, duration: duration * 0.3, useNativeDriver: true }),
          ]),
        ]).start();
      });
      setTimeout(() => setShowConfetti(false), 4000);
    }

    if (!finalCert.isEligible) {
      const name = finalCert.name || "";
      const greeting = name ? `أهلاً وسهلاً، ${name}` : "أهلاً وسهلاً";
      if (finalCert.missingLessons && finalCert.missingLessons.length > 0) {
        const cleanLessons = finalCert.missingLessons.map((l: string) => l.replace(/^(الامتحان|للامتحان|امتحان)\s*/, "").trim());
        const lessonsText = cleanLessons.join(" و ");
        finalCert.statusMessage = `${greeting}، يجب عليك حل الامتحان ${lessonsText} للحصول على الشهادة.`;
      } else if (!finalCert.statusMessage) {
        finalCert.statusMessage = `${greeting}، لم يتم إصدار شهادتك بعد.`;
      }
    }

    let localPath = "";
    let localImgPath = "";
    let fileExists = false;
    let imageExists = false;

    if (!isWeb && finalCert.id && finalCert.id !== "offline_error" && finalCert.id !== "not_found" && finalCert.id !== "server_error") {
      localPath = `${FileSystem.documentDirectory}certs/cert_${level}_${finalCert.id}.pdf`;
      localImgPath = `${FileSystem.documentDirectory}certs/cert_${level}_${finalCert.id}.png`;

      const [fInfo, iInfo] = await Promise.all([
        FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false })),
        FileSystem.getInfoAsync(localImgPath).catch(() => ({ exists: false }))
      ]);

      fileExists = fInfo.exists;
      imageExists = iInfo.exists;

      const net = await NetInfo.fetch();
      if (finalCert.isEligible && !imageExists && net.isConnected) {
        await preDownloadCertificate(finalCert.id, level);
        const verify = await FileSystem.getInfoAsync(localImgPath).catch(() => ({ exists: false }));
        imageExists = verify.exists;
      }
    }

    setFoundCert({
      ...finalCert,
      name: finalCert.name || "",
      isLocal: fileExists,
      localPath: fileExists ? localPath : undefined,
      localImgPath: imageExists ? localImgPath : undefined
    });
  };

  const preDownloadCertificate = async (certId: string, level: string) => {
    if (isWeb) return;
    try {
      const certDir = `${FileSystem.documentDirectory}certs/`;
      const dirInfo = await FileSystem.getInfoAsync(certDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(certDir, { intermediates: true });

      const imgExportUrl = `https://docs.google.com/presentation/d/${certId}/export/png?size=1000`;
      const thumbUrl = `https://docs.google.com/presentation/d/${certId}/thumbnail/get?w=1000`;
      const exportUrl = `https://docs.google.com/presentation/d/${certId}/export/pdf`;
      const fileUri = `${certDir}cert_${level}_${certId}.pdf`;
      const imgUri = `${certDir}cert_${level}_${certId}.png`;

      try {
        await FileSystem.downloadAsync(imgExportUrl, imgUri);
      } catch (e) {
        // إذا فشل الـ export نجرب الـ thumbnail كبديل
        await FileSystem.downloadAsync(thumbUrl, imgUri);
      }

      await FileSystem.downloadAsync(exportUrl, fileUri).catch(() => { });

      setFoundCert(prev => {
        if (prev && prev.id === certId) {
          return { ...prev, isLocal: true, localPath: fileUri, localImgPath: imgUri };
        }
        return prev;
      });
    } catch (e) { }
  };

  const downloadCertificate = async () => {
    if (isWeb) {
      Alert.alert("تنبيه", "التحميل المباشر غير متاح في نسخة الويب حالياً.");
      return;
    }
    if (!foundCert) return;

    const level = selectedLevel || "1";
    const certDir = `${FileSystem.documentDirectory}certs/`;
    const imgUri = `${certDir}cert_${level}_${foundCert.id}.png`;
    const fileUri = `${certDir}cert_${level}_${foundCert.id}.pdf`;

    const imgInfo = await FileSystem.getInfoAsync(imgUri);
    if (imgInfo.exists) {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(imgUri);
          setSystemAlert({ title: "تم الحفظ", message: "تم حفظ الشهادة بنجاح في استوديو الصور.", type: "success" });
        } else {
          Alert.alert("تنبيه", "يجب إعطاء صلاحية الوصول للصور لحفظ الشهادة.");
        }
      } catch (e) {
        Alert.alert("خطأ", "فشل الحفظ في الاستوديو.");
      }
      return;
    }

    setIsDownloadingCert(true);
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        Alert.alert("أوفلاين", "يرجى الانتظار حتى اكتمال التحميل أو الاتصال بالإنترنت.");
        setIsDownloadingCert(false);
        return;
      }

      const dirInfo = await FileSystem.getInfoAsync(certDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(certDir, { intermediates: true });

      const imgExportUrl = `https://docs.google.com/presentation/d/${foundCert.id}/export/png?size=1000`;
      const exportUrl = `https://docs.google.com/presentation/d/${foundCert.id}/export/pdf`;

      await Promise.all([
        FileSystem.downloadAsync(imgExportUrl, imgUri),
        FileSystem.downloadAsync(exportUrl, fileUri)
      ]);

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(imgUri);
        setFoundCert(prev => prev ? ({ ...prev, isLocal: true, localPath: fileUri, localImgPath: imgUri }) : null);
        setSystemAlert({ title: "تم الحفظ", message: "تم حفظ الشهادة بنجاح في استوديو الصور.", type: "success" });
      } else {
        Alert.alert("تنبيه", "يجب إعطاء صلاحية الوصول للصور لحفظ الشهادة.");
      }
    } catch (e) {
      Alert.alert("خطأ", "فشل حفظ الشهادة.");
    } finally {
      setIsDownloadingCert(false);
    }
  };

  const cleanupOldCertificates = async () => {
    if (isWeb) return;
    try {
      const certDir = `${FileSystem.documentDirectory}certs/`;
      const dirInfo = await FileSystem.getInfoAsync(certDir);
      if (!dirInfo.exists) return;

      const files = await FileSystem.readDirectoryAsync(certDir);
      const now = Date.now();
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

      for (const fileName of files) {
        const filePath = certDir + fileName;
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        const info = fileInfo as any;
        if (info.exists && !info.isDirectory) {
          const modTime = (info.modificationTime || 0) * 1000;
          if (modTime > 0 && now - modTime > ONE_WEEK_MS) {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
          }
        }
      }
    } catch (e) { }
  };

  const syncCertificateMapping = async (level: string) => {
    if (isWeb) return;
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;

      const resp = await fetch(`${APPS_SCRIPT_URL}?action=getAllCertificates&level=${level}`);
      const fullMapping = await resp.json();

      if (fullMapping && !fullMapping.error) {
        // فحص لو كود المستخدم الحالي موجود في الداتا الجديدة وحصله تحديث
        const currentCode = await AsyncStorage.getItem("@user_email");
        if (currentCode && fullMapping[currentCode]) {
          const newCert = fullMapping[currentCode];
          if (newCert.isEligible && newCert.id) {
            // التحقق لو الصورة محملة فعلياً
            const localImgPath = `${FileSystem.documentDirectory}certs/cert_${level}_${newCert.id}.png`;
            const info = await FileSystem.getInfoAsync(localImgPath);
            if (!info.exists) {
              preDownloadCertificate(newCert.id, level);
            }
          }
        }

        globalCertMappings[level] = fullMapping;
        await AsyncStorage.setItem(`@cached_cert_mapping_v1_lvl_${level}`, JSON.stringify(fullMapping));

        // 🔥 الحل الجذري النهائي: تحميل جميع الشهادات في الخلفية فوراً (بنظام الدفعات)
        const allCerts = Object.values(fullMapping).filter((c: any) => c.isEligible && c.id);
        (async () => {
          for (let i = 0; i < allCerts.length; i += 3) {
            const batch = allCerts.slice(i, i + 3);
            await Promise.all(batch.map(async (cert: any) => {
              const imgPath = `${FileSystem.documentDirectory}certs/cert_${level}_${cert.id}.png`;
              const info = await FileSystem.getInfoAsync(imgPath);
              if (!info.exists) {
                await preDownloadCertificate(cert.id, level).catch(() => { });
              }
            }));
            await new Promise(r => setTimeout(r, 200)); // فاصل بسيط بين الدفعات
          }
        })();
      }
    } catch (e) { }
  };

  const syncCurrentUserCertificate = async () => {
    try {
      const code = await AsyncStorage.getItem("@user_email");
      if (!code) return;
      const level = selectedLevel || "1";
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;

      const resp = await fetch(`${APPS_SCRIPT_URL}?action=getCertificateFullStatus&code=${code}&level=${level}`);
      const res = await resp.json();
      if (res.success) {
        const cacheKey = `@cached_cert_mapping_v1_lvl_${level}`;
        const cachedMappingStr = await AsyncStorage.getItem(cacheKey);
        const mapping = cachedMappingStr ? JSON.parse(cachedMappingStr) : {};

        if (res.isEligible) {
          const certData = { url: res.certificateUrl, id: res.presentationId, name: res.name };
          mapping[code] = certData;
          globalCertMappings[level] = mapping;
          await AsyncStorage.setItem(cacheKey, JSON.stringify(mapping));
          preDownloadCertificate(certData.id, level);
        } else {
          // حفظ رسالة النقصان كاش للأوفلاين (اختياري، يفضل تحديثها دائماً)
          const offlineStatusKey = `@offline_status_${level}_${code}`;
          await AsyncStorage.setItem(offlineStatusKey, JSON.stringify(res));
        }
      }
    } catch (e) { }
  };

  useEffect(() => {
    const registerTask = async () => {
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
        if (!isRegistered) {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
            minimumInterval: 15 * 60, // 15 دقيقة (أقل وقت مسموح به في iOS/Android)
            stopOnTerminate: false,
            startOnBoot: true,
          });
        }
      } catch (err) { console.log("Background Sync Task Error", err); }
    };
    registerTask();
    syncCurrentUserCertificate();
    cleanupOldCertificates(); // تنظيف الملفات القديمة (أكبر من أسبوع)

    // إضافة مراقب لحالة التطبيق للمزامنة فور العودة (Foreground Sync)
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        syncCertificateMapping("1");
        syncCertificateMapping("2");
      }
    });

    return () => subscription.remove();
  }, [userEmail, selectedLevel]);

  // تمرير الشاشة للأعلى عند تغيير الخطوات أو فتح الامتحان
  useEffect(() => {
    if (examModal) {
      examScrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [finalExamStep, examModal?.examUrl]);

  useEffect(() => {
    const init = async () => {
      // تحميل كافة الكاشات للذاكرة الحية فوراً (Zero Latency)
      try {
        for (let lvl of ["1", "2"]) {
          const key = `@cached_cert_mapping_v1_lvl_${lvl}`;
          const cached = await AsyncStorage.getItem(key);
          if (cached) globalCertMappings[lvl] = JSON.parse(cached);
        }
        const codesCached = await AsyncStorage.getItem("@cached_codes_map");
        if (codesCached) setValidCodesMap(JSON.parse(codesCached));

        const cachedInst = await AsyncStorage.getItem("@coptic_instructions_v1");
        if (cachedInst) setLevelInstructions(JSON.parse(cachedInst));

        // تحميل حالات المزامنة لضمان عرض "متاح أوفلاين" فوراً بدون "رعشة"
        const syncStates: Record<string, boolean> = {};
        for (let lvl of ["1", "2"]) {
          const isSynced = await AsyncStorage.getItem(`@auto_sync_${lvl}`);
          if (isSynced === "true") syncStates[lvl] = true;
        }
        setAutoSyncLevels(syncStates);
      } catch (e) { }

      // التأكد من وجود المجلد
      if (!isWeb && STORAGE_DIR) {
        const dirInfo = await FileSystem.getInfoAsync(STORAGE_DIR);
        if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(STORAGE_DIR, { intermediates: true });

        // التأكد من وجود الغلاف أوفلاين
        const coverInfo = await FileSystem.getInfoAsync(LOCAL_COVER_PATH);
        if (coverInfo.exists) {
          setLocalCoverExists(true);
        } else {
          try {
            await FileSystem.downloadAsync(`https://drive.google.com/uc?export=download&id=${GLOBAL_COVER_ID}`, LOCAL_COVER_PATH);
            setLocalCoverExists(true);
          } catch (e) { console.log("Cover download error", e); }
        }
      }

      const email = await AsyncStorage.getItem("@user_email");
      if (email) setUserEmail(email);

      const watched = await AsyncStorage.getItem(WATCHED_LESSONS_KEY);
      if (watched) setWatchedLessons(new Set(JSON.parse(watched)));

      const positions = await AsyncStorage.getItem("@playback_positions_v1");
      if (positions) setPlaybackPositions(JSON.parse(positions));


      fetchLessons();
    };
    init();

    // إضافة فحص صامت كل 30 ثانية لاكتشاف أي تغييرات في الشيت فورياً
    const interval = setInterval(() => {
      fetchLessons(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [userEmail]);

  useEffect(() => {
    import('react-native').then(({ DeviceEventEmitter }) => {
      const sub = DeviceEventEmitter.addListener('navigate_to_learn', (data) => {
        if (data?.targetLevel) {
          setSelectedLevel(data.targetLevel);
          AsyncStorage.setItem("@coptic/last_selected_level_v1", data.targetLevel);
        }
      });
      return () => sub.remove();
    });
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      if (reviewModalVisible) {
        setReviewModalVisible(false);
        return true;
      }
      if (examModal) {
        if (examModal.title === "الامتحان النهائي - المستوى الأول" || examModal.title === "الامتحان النهائي - المستوى الثاني") {
          if (finalExamStep > 1) {
            setFinalExamStep(prev => prev - 1);
            examScrollRef.current?.scrollTo({ y: 0, animated: true });
          } else {
            setExamModal(null);
          }
        } else if (examModal.title === "الامتحان النهائي") {
          // للتوافق مع الإصدارات القديمة
          if (finalExamStep > 1) {
            setFinalExamStep(prev => prev - 1);
            examScrollRef.current?.scrollTo({ y: 0, animated: true });
          } else {
            setExamModal(null);
          }
        } else {
          setExamModal(null);
        }
        return true;
      }
      if (viewingOral) {
        setViewingOral(null);
        return true;
      }
      if (activeVideo) {
        setActiveVideo(null);
        return true;
      }
      if (codeModalVisible) {
        if (!isGenerating) setCodeModalVisible(false);
        return true;
      }
      if (certModalVisible) {
        setCertModalVisible(false);
        return true;
      }
      if (instModalVisible) {
        setInstModalVisible(false);
        return true;
      }
      if (selectedCategory) {
        setSelectedCategory(null);
        return true;
      }
      if (selectedLevel) {
        setSelectedLevel(null);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);

    // رادار المزامنة اللحظية: يراقب النت ويبدأ المزامنة فور توفرها
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        console.log("Internet restored, checking for offline exams...");
        syncOfflineExams();
        syncOfflineCodes();
      }
    });

    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [selectedLevel, selectedCategory, examModal, viewingOral, activeVideo, codeModalVisible, certModalVisible, isGenerating, finalExamStep, reviewModalVisible]);

  useEffect(() => {
    // عند تغيير المستوى (أو الخروج للقائمة الرئيسية)، نمسح بيانات البحث السابقة
    // لضمان عدم ظهور نتائج المستوى الأول في المستوى الثاني
    setFoundCert(null);
    setCertSearchCode("");
  }, [selectedLevel]);

  const linkLocalLessons = async (data: Lesson[]) => {
    if (isWeb) return data;
    return await Promise.all(data.map(async (lesson: Lesson) => {
      const vId = extractDriveId(lesson.videoId);
      const vPath = STORAGE_DIR + `v_${vId}.mp4`;
      const vInfo = vId ? await FileSystem.getInfoAsync(vPath).catch(() => null) : null;

      let localVideoPath;
      if (vInfo && vInfo.exists && !vInfo.isDirectory) {
        // فحص جذري: لو حجم الملف أقل من 100 كيلو بايت فهو غالباً صفحة خطأ من جوجل درايف وليس فيديو حقيقي
        if (vInfo.size > 100 * 1024) {
          localVideoPath = vPath;
        } else {
          // إذا كان تالفاً، نقوم بحذفه بصمت ليتيح للمستخدم إعادة تحميله بشكل صحيح لاحقاً
          FileSystem.deleteAsync(vPath, { idempotent: true }).catch(() => { });
        }
      }

      let localOralPath;
      const isL2 = lesson.level === "2" || lesson.level === "المستوى الثاني";

      // الشفوي في المستوى الأول هو صورة/ملف، أما في المستوى الثاني فهو نص مباشر
      if (!isL2) {
        const oId = extractDriveId(lesson.oralId || "");
        // التأكد أن المعرف هو رابط درايف فعلي وليس نصاً طويلاً (حماية من الكراش)
        if (oId && oId.length < 100 && !oId.includes(" ") && !oId.includes("\n")) {
          const oPath = STORAGE_DIR + `o_${oId}.jpg`;
          const oInfo = await FileSystem.getInfoAsync(oPath).catch(() => ({ exists: false }));
          if (oInfo && oInfo.exists) localOralPath = oPath;
        }
      }

      let localSummaryPath;
      if (lesson.summaryId) {
        const sPath = STORAGE_DIR + `s_${lesson.summaryId}.jpg`;
        const sInfo = await FileSystem.getInfoAsync(sPath).catch(() => ({ exists: false }));
        if (sInfo && sInfo.exists) localSummaryPath = sPath;
      }

      return { ...lesson, localVideo: localVideoPath, localOral: localOralPath, localSummary: localSummaryPath };
    }));
  };

  const fetchLessons = async (isSilent = false) => {
    void isSilent;
    // Load the cached live list once; the bundled catalog already renders immediately.
    let cached: string | null = null;
    if (!lessonsCacheLoadedRef.current) {
      lessonsCacheLoadedRef.current = true;
      cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          if (Array.isArray(cachedData) && cachedData.length > 0) {
            const linked = await linkLocalLessons(cachedData);
            setLessons(linked);
          }
        } catch { }
      }
    }

    try {
      const response = await fetch(`${APPS_SCRIPT_URL}?action=getLessons&t=${Date.now()}`);
      const data = await response.json();

      let lessonsArray = [];
      let instructions = {};

      if (Array.isArray(data)) {
        lessonsArray = data;
      } else if (data && data.lessons) {
        lessonsArray = data.lessons;
        instructions = data.instructions || {};
      }

      if (lessonsArray.length > 0) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(lessonsArray));

        if (Object.keys(instructions).length > 0) {
          await AsyncStorage.setItem("@coptic_instructions_v1", JSON.stringify(instructions));
          setLevelInstructions(instructions);
        }

        try {
          const activeIds = lessonsArray.map((l: any) => extractDriveId(l.videoId)).filter((x: any) => x);
          const activeOralIds = lessonsArray.map((l: any) => extractDriveId(l.oralId || "")).filter((x: any) => x);

          if (!isWeb && STORAGE_DIR) {
            const localFiles = await FileSystem.readDirectoryAsync(STORAGE_DIR);
            for (const file of localFiles) {
              if (file.endsWith(".mp4") && file.startsWith("v_")) {
                const fileId = file.replace("v_", "").replace(".mp4", "");
                if (!activeIds.includes(fileId)) {
                  await FileSystem.deleteAsync(STORAGE_DIR + file, { idempotent: true });
                }
              }
              if (file.endsWith(".jpg") && file.startsWith("o_")) {
                const fileId = file.replace("o_", "").replace(".jpg", "");
                if (!activeOralIds.includes(fileId)) {
                  await FileSystem.deleteAsync(STORAGE_DIR + file, { idempotent: true });
                }
              }
            }
          }
        } catch (e) { }

        const updatedData = await linkLocalLessons(lessonsArray);
        setLessons(updatedData);
      }
      // مزامنة عدوانية (Aggressive Sync) لضمان توفر البيانات أوفلاين فوراً
      syncCertificateMapping("1");
      syncCertificateMapping("2");
    } catch (err) {
      console.log("Fetch failed, keeping cached linked results");
      if (cached) {
        const cachedData = JSON.parse(cached);
        const linked = await linkLocalLessons(cachedData);
        setLessons(linked);
      }
    }
    finally { setLoading(false); }
  };

  // مراقب التحديث اللحظي لحزم المقاطع لشم النت
  useEffect(() => {
    const runAutoSync = async () => {
      if (lessons.length === 0) return;
      for (const lvl of ["1", "2"]) {
        const syncFlag = await AsyncStorage.getItem(`@auto_sync_${lvl}`);
        if (syncFlag === "true" && !downloadProgress[lvl]?.active) {
          const missingNodes = lessons.filter(l => String(l.level) === lvl && !l.localVideo);
          if (missingNodes.length > 0) {
            // تم إيقاف التحميل التلقائي بناء على طلب المستخدم
            // downloadEntireLevel(lvl, true);
          }
        }
      }
    };
    runAutoSync();
  }, [lessons]);

  const extractDriveId = (url: string) => {
    if (!url) return "";
    // Regex أكثر مرونة للتعامل مع كافة أشكال روابط جوجل درايف
    const driveRegex = /(?:id=|\/d\/|v=)([a-zA-Z0-9_-]{25,})/;
    const match = url.match(driveRegex);
    if (match) return match[1] || match[2];

    // إذا لم يكن رابط درايف، وكان نصاً طويلاً أو يحتوي على مسافات/سطور جديدة، نرجعه فارغاً 
    // لتجنب استخدامه كإسم ملف (مما يسبب كراش في FileSystem)
    if (url.length > 50 || url.includes(" ") || url.includes("\n") || url.includes("\r")) return "";
    return url;
  };

  const pickPhoto = async () => {
    try {
      setIsPickingPhoto(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        setPhotoBase64(base64);
        triggerSuccessHaptic();
      }
    } catch (err) {
      setSystemAlert({ title: "خطأ", message: "فشل في اختيار الصورة. حاول مرة أخرى.", type: "error" });
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const syncOfflineExams = async () => {
    try {
      const stored = await AsyncStorage.getItem(EXAM_OFFLINE_SUBMISSIONS);
      if (!stored) return;

      const queue = JSON.parse(stored);
      if (queue.length === 0) return;

      console.log(`Radar processing ${queue.length} offline exams...`);
      const remaining = [];

      for (const submission of queue) {
        try {
          const resp = await fetch(`${APPS_SCRIPT_URL}?action=submitExam`, {
            method: "POST",
            body: JSON.stringify(submission),
            headers: {
              "Content-Type": "application/json"
            }
          });
          const res = await resp.json();
          // لو السيرفر لقى تكرار (أدمن مثلاً أو صدفة) أو نجح، نعتبره وصل
          if (res.success || res.already_submitted) {
            console.log("Sync Success for one exam");
          } else {
            remaining.push(submission);
          }
        } catch (e) {
          console.log("Sync attempt failed for one item, keeping in queue");
          remaining.push(submission);
        }
      }

      if (remaining.length === 0) {
        await AsyncStorage.removeItem(EXAM_OFFLINE_SUBMISSIONS);
      } else {
        await AsyncStorage.setItem(EXAM_OFFLINE_SUBMISSIONS, JSON.stringify(remaining));
      }
    } catch (e) { console.log("Radar Sync Error:", e); }
  };

  const syncOfflineCodes = async () => {
    try {
      const stored = await AsyncStorage.getItem("@offline_codes_queue");
      if (!stored) return;
      const queue = JSON.parse(stored);
      if (queue.length === 0) return;

      const remaining = [];
      for (const req of queue) {
        try {
          const resp = await fetch(`${APPS_SCRIPT_URL}?action=generateCode`, {
            method: "POST",
            body: JSON.stringify({ action: "generateCode", ...req }),
            headers: { "Content-Type": "application/json" }
          });
          const res = await resp.json();
          if (!res.success) remaining.push(req);
        } catch (e) { remaining.push(req); }
      }
      if (remaining.length === 0) await AsyncStorage.removeItem("@offline_codes_queue");
      else await AsyncStorage.setItem("@offline_codes_queue", JSON.stringify(remaining));
    } catch (e) { }
  };

  const downloadOne = async (lesson: Lesson) => {
    if (isWeb) {
      Alert.alert("تنبيه", "التحميل أوفلاين غير متاح في نسخة الويب.");
      return;
    }
    const vId = extractDriveId(lesson.videoId);
    setDownloadingId(vId);
    try {
      const vUrl = `https://drive.google.com/uc?export=download&id=${vId}&confirm=t`;
      const vPath = STORAGE_DIR + `v_${vId}.mp4`;
      const vTmpPath = vPath + ".tmp";

      const checkFinal = await FileSystem.getInfoAsync(vPath);
      if (checkFinal.exists) {
        Alert.alert("تنبيه", "هذا الملف موجود بالفعل على جهازك.");
        setDownloadingId(null);
        return;
      }

      const resumeKey = `@resume_v1_${vId}`;
      const resumeData = await AsyncStorage.getItem(resumeKey);

      let lastSaveTime = 0;
      const callback = (progress: any) => {
        const now = Date.now();
        if (now - lastSaveTime > 3000) {
          lastSaveTime = now;
          const data = downloadResumable.savable();
          AsyncStorage.setItem(resumeKey, JSON.stringify(data));
        }
      };

      const downloadResumable = FileSystem.createDownloadResumable(vUrl, vTmpPath, {}, callback, resumeData || undefined);

      try {
        const result = await downloadResumable.downloadAsync();
        if (result && result.uri) {
          // فحص جذري للجودة: لو الحجم أقل من 1 ميجا فهو غالباً فشل في الحصول على الفيديو من جوجل درايف
          const checkInfo = await FileSystem.getInfoAsync(result.uri);
          if (result.status === 200 && checkInfo.exists && !checkInfo.isDirectory && checkInfo.size > 1024 * 1024) {
            await FileSystem.moveAsync({ from: vTmpPath, to: vPath }); // نقل الملف للمسار النهائي بعد الاكتمال
            await AsyncStorage.removeItem(resumeKey);
          } else {
            await FileSystem.deleteAsync(vTmpPath, { idempotent: true });
            throw new Error("Corrupted download: File too small or wrong status");
          }
        }
      } catch (e) {
        const data = downloadResumable.savable();
        await AsyncStorage.setItem(resumeKey, JSON.stringify(data));
        throw e;
      }

      const isL2 = lesson.level === "2" || lesson.level === "المستوى الثاني";
      const oId = !isL2 ? extractDriveId(lesson.oralId || "") : "";
      if (oId && oId.length < 100 && !oId.includes(" ")) {
        const oUrl = `https://drive.google.com/uc?export=download&id=${oId}&confirm=t`;
        const oPath = STORAGE_DIR + `o_${oId}.jpg`;
        const oCheck = await FileSystem.getInfoAsync(oPath);
        if (!oCheck.exists) await FileSystem.downloadAsync(oUrl, oPath);
      }

      if (lesson.summaryId) {
        const sUrl = `https://drive.google.com/uc?export=download&id=${lesson.summaryId}&confirm=t`;
        const sPath = STORAGE_DIR + `s_${lesson.summaryId}.jpg`;
        const sCheck = await FileSystem.getInfoAsync(sPath);
        if (!sCheck.exists) await FileSystem.downloadAsync(sUrl, sPath);
      }

      fetchLessons(true);
      Alert.alert("تم التحميل", "الدرس متاح الآن أوفلاين.");

      // تتبع تحميل درس منفرد
      logActivity("download_content", undefined, `Single Lesson: ${lesson.title} (${lesson.level})`);
    } catch (e) { Alert.alert("تنبيه", "انقطع الاتصال. سيتم استكمال التحميل من حيث توقف عند المحاولة مرة أخرى."); }
    finally { setDownloadingId(null); }
  };

  const markAsWatched = async (lesson: Lesson) => {
    // تتبع دخول الدرس (دائماً يتم التسجيل حتى لو شوهد سابقاً)
    logActivity("lesson_view", undefined, `Lesson: ${lesson.title} (${lesson.level})`);

    if (watchedLessons.has(lesson.videoId)) return;
    const newWatched = new Set(watchedLessons);
    newWatched.add(lesson.videoId);
    setWatchedLessons(newWatched);

    // حفظ آخر درس للمتابعة (لإشعارات العودة)
    await Promise.all([
      AsyncStorage.setItem(WATCHED_LESSONS_KEY, JSON.stringify(Array.from(newWatched))),
      AsyncStorage.setItem('@coptic/last_lesson_name', lesson.title || ""),
      AsyncStorage.setItem('@coptic/last_level', String(lesson.level || "")),
    ]);
  };

  const loadSubmittedExams = async () => {
    try {
      const stored = await AsyncStorage.getItem(SUBMITTED_EXAMS_KEY);
      if (stored) setSubmittedExams(JSON.parse(stored));
    } catch (e) { console.log(e); }
  };

  useEffect(() => {
    loadSubmittedExams();
  }, [userEmail]);

  const exportVideoToGallery = async (localUri: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('عذراً', 'نحتاج إلى صلاحية الوصول للصور لنتمكن من حفظ الفيديو على جهازك.');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(localUri);
      setSystemAlert({ title: "تم الحفظ بنجاح", message: "تم حفظ هذا الدرس في معرض الصور (الاستوديو) الخاص بهاتفك.", type: "success" });
    } catch (error) {
      console.log("Export error: ", error);
      Alert.alert('خطأ', 'حدث مشكلة غير متوقعة أثناء حفظ الفيديو.');
    }
  };
  const shareMedia = async (localUri: string, lesson?: Lesson) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("عذراً", "المشاركة غير متاحة على هذا الجهاز.");
        return;
      }

      let shareUri = localUri;

      if (lesson) {
        // تنظيف اسم الملف من الأحرف غير المسموحة
        const cleanTitle = lesson.title.replace(/[\\/:*?"<>|]/g, "").trim();
        let rawLevel = lesson.level.toString().replace(/[\\/:*?"<>|]/g, "").trim();

        // تحويل الأرقام إلى كلمات ترتيبية
        const levelMap: Record<string, string> = {
          "1": "الأول", "2": "الثاني", "3": "الثالث", "4": "الرابع", "5": "الخامس",
          "6": "السادس", "7": "السابع", "8": "الثامن", "9": "التاسع", "10": "العاشر"
        };

        let levelWord = rawLevel;
        // إذا كان الرقم موجوداً في الخريطة، نحوله لكلمة
        if (levelMap[rawLevel]) {
          levelWord = levelMap[rawLevel];
        } else {
          // محاولة استخراج الرقم إذا كان مكتوباً "1" أو "المستوى 1"
          const numOnly = rawLevel.match(/\d+/);
          if (numOnly && levelMap[numOnly[0]]) {
            levelWord = levelMap[numOnly[0]];
          }
        }

        const levelPrefix = levelWord.includes("المستوى") ? levelWord : `المستوى ${levelWord}`;

        const newFileName = `تعلم اللغة القبطية. ${levelPrefix}. ${cleanTitle}. Enram merzik.mp4`;
        const tempUri = `${FileSystem.cacheDirectory}${newFileName}`;

        try {
          // نسخ الملف لاسم جديد في الكاش للمشاركة
          if (!isWeb) {
            await FileSystem.copyAsync({ from: localUri, to: tempUri });
            shareUri = tempUri;
          }
        } catch (copyErr) {
          console.log("Copy for share failed", copyErr);
          // في حال فشل النسخ نشارك الملف الأصلي
        }
      }

      await Sharing.shareAsync(shareUri);
    } catch (error) {
      console.log("Sharing error: ", error);
      Alert.alert('خطأ', 'حدث مشكلة أثناء محاولة المشاركة.');
    }
  };

  const takeScreenshot = async (viewRef: any) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('عذراً', 'نحتاج إلى صلاحية الوصول للصور لنتمكن من حفظ لقطة الشاشة.');
        return;
      }

      const uri = await captureRef(viewRef, {
        format: "jpg",
        quality: 0.9,
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      setSystemAlert({ title: "تم الحفظ", message: "تم حفظ لقطة الشاشة في استوديو الصور بنجاح.", type: "success" });
    } catch (error) {
      console.log("Screenshot error: ", error);
      Alert.alert('خطأ', 'حدث مشكلة أثناء أخذ لقطة الشاشة.');
    }
  };

  const exportImageToGallery = async (lesson: Lesson, isSummary = false) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('عذراً', 'نحتاج إلى صلاحية الوصول للصور لنتمكن من حفظ الصورة على جهازك.');
        return;
      }

      let fileUri = isSummary ? lesson.localSummary : lesson.localOral;
      const targetId = isSummary ? lesson.summaryId : extractDriveId(lesson.oralId || "");

      if (!fileUri) {
        const net = await NetInfo.fetch();
        if (!net.isConnected) {
          Alert.alert('عذراً', 'هذه الصورة لم يتم تحميلها مسبقاً، وتحتاج لاتصال بالإنترنت لحفظها الآن.');
          return;
        }
        fileUri = FileSystem.cacheDirectory + (isSummary ? 'sum_temp_' : 'oral_temp_') + Date.now() + '.jpg';
        const url = `https://drive.google.com/uc?export=download&id=${targetId}`;
        await FileSystem.downloadAsync(url, fileUri);
      }

      await MediaLibrary.saveToLibraryAsync(fileUri);
      setSystemAlert({ title: "تم الحفظ بنجاح", message: isSummary ? "تم حفظ الملخص في الاستوديو بجهازك." : "تم حفظ صورة الشفوي في الاستوديو بجهازك.", type: "success" });
    } catch (error) {
      Alert.alert('خطأ', 'حدث مشكلة غير متوقعة أثناء حفظ الصورة.');
    }
  };

  const [downloadProgress, setDownloadProgress] = useState<{ [lvl: string]: { current: number, total: number, active: boolean, currentTitle?: string, fileProgress?: number } }>({});
  const [managingLevel, setManagingLevel] = useState<string | null>(null);
  const [levelStats, setLevelStats] = useState<{ size: number, files: number, corrupted: number, totalNeeded: number } | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [downloadCancelled, setDownloadCancelled] = useState<{ [lvl: string]: boolean }>({});
  const activeDownloadsRef = useRef<{ [lvl: string]: FileSystem.DownloadResumable[] }>({});

  const downloadEntireLevel = async (lvl: string, isSilent = false) => {
    if (isWeb) {
      if (!isSilent) setSystemAlert({ title: "تنبيه", message: "التحميل الكامل متاح فقط في تطبيقات الموبايل.", type: "info" });
      return;
    }
    const levelLessons = lessons.filter(l => String(l.level) === lvl);

    if (levelLessons.length === 0) {
      if (!isSilent) setSystemAlert({ title: "جاري الاستعداد", message: "يرجى الانتظار بضع ثوانٍ حتى يتم تحميل البيانات من الخادم...", type: "info" });
      return;
    }

    // التحقق الفعلي من وجود محتوى يحتاج لتحميل
    const needsDownload = levelLessons.some(l => {
      const vId = extractDriveId(l.videoId);
      const oId = extractDriveId(l.oralId || "");
      const sId = extractDriveId(l.summaryId || "");
      return (vId && !l.localVideo) || (oId && l.level !== "2" && l.level !== "المستوى الثاني" && !l.localOral) || (sId && !l.localSummary);
    });

    if (!needsDownload) {
      if (!isSilent) setSystemAlert({ title: "مكتمل", message: "جميع مجلدات الدروس مخزنة ومتاحة بالفعل للعمل بدون إنترنت.", type: "info", forceLTR: true });
      return;
    }

    const netStatus = await NetInfo.fetch();
    if (!netStatus.isConnected) {
      if (!isSilent) setSystemAlert({ title: "لا يوجد اتصال", message: "تأكد من اتصالك بالإنترنت للبدء في تحميل الحزمة، وسيتم الاستكمال لاحقاً إذا انقطع في المنتصف.", type: "error" });
      return;
    }

    setDownloadProgress(prev => ({ ...prev, [lvl]: { current: 0, total: levelLessons.length, active: true, currentTitle: "جاري البدء..." } }));
    setDownloadCancelled(prev => ({ ...prev, [lvl]: false }));
    activeDownloadsRef.current[lvl] = [];

    let successCount = 0;

    for (let i = 0; i < levelLessons.length; i++) {
      if (downloadCancelled[lvl]) break;

      const item = levelLessons[i];
      let itemSuccess = true;
      setDownloadProgress(prev => ({ ...prev, [lvl]: { ...prev[lvl], fileProgress: 0, currentTitle: item.title } }));

      try {
        const tasks: Promise<any>[] = [];

        // 1. Exam
        if (item.examUrl) {
          tasks.push((async () => {
            try {
              const eId = extractDriveId(item.examUrl);
              const examKey = `exam_cache_v3_${eId}`;
              const cached = await AsyncStorage.getItem(examKey);
              if (!cached) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                try {
                  const qRes = await fetch(`${APPS_SCRIPT_URL}?action=getQuestions&url=${encodeURIComponent(item.examUrl)}`, { signal: controller.signal });
                  clearTimeout(timeoutId);
                  const qData = await qRes.json();
                  if (qData.questions) await AsyncStorage.setItem(examKey, JSON.stringify(qData.questions));
                } catch (e) { }
              }
            } catch (e) { }
          })());
        }

        // 2. Video
        const vId = extractDriveId(item.videoId);
        if (vId) {
          tasks.push((async () => {
            const vUrl = `https://drive.google.com/uc?export=download&id=${vId}&confirm=t`;
            const vPath = STORAGE_DIR + `v_${vId}.mp4`;
            const vTmpPath = vPath + ".tmp";

            const checkFinal = await FileSystem.getInfoAsync(vPath);
            if (!checkFinal.exists) {
              const resumeKey = `@resume_v1_${vId}`;
              const resumeDataStr = await AsyncStorage.getItem(resumeKey);
              let resumeDataObj: any = null;
              try { if (resumeDataStr) resumeDataObj = JSON.parse(resumeDataStr); } catch (e) { }

              const tmpCheck = await FileSystem.getInfoAsync(vTmpPath);
              let validResumeData;
              if (tmpCheck.exists && resumeDataObj && resumeDataObj.resumeData) {
                validResumeData = resumeDataObj.resumeData;
              } else {
                await AsyncStorage.removeItem(resumeKey);
                await FileSystem.deleteAsync(vTmpPath, { idempotent: true });
              }

              let lastSaveTime = 0;
              let lastUiTime = 0;
              const callback = (p: any) => {
                const now = Date.now();
                if (p.totalBytesExpectedToWrite > 0) {
                  const fileProgress = p.totalBytesWritten / p.totalBytesExpectedToWrite;
                  if (now - lastUiTime > 1500) {
                    lastUiTime = now;
                    setDownloadProgress(prev => ({ ...prev, [lvl]: { ...prev[lvl], fileProgress } }));
                  }
                }
              };

              const downloadResumable = FileSystem.createDownloadResumable(vUrl, vTmpPath, {}, callback, validResumeData);
              activeDownloadsRef.current[lvl].push(downloadResumable);

              try {
                const result = await downloadResumable.downloadAsync();
                if (result && result.uri) {
                  const checkInfo = await FileSystem.getInfoAsync(result.uri);
                  if (result.status === 200 && checkInfo.exists && !checkInfo.isDirectory && checkInfo.size > 100 * 1024) {
                    await FileSystem.moveAsync({ from: vTmpPath, to: vPath });
                    await AsyncStorage.removeItem(resumeKey);
                  } else {
                    await FileSystem.deleteAsync(vTmpPath, { idempotent: true });
                    throw new Error("Corrupted download or quota exceeded.");
                  }
                }
              } catch (error) {
                if (downloadResumable) {
                  await AsyncStorage.setItem(resumeKey, JSON.stringify(downloadResumable.savable()));
                }
                itemSuccess = false;
              } finally {
                activeDownloadsRef.current[lvl] = activeDownloadsRef.current[lvl].filter(d => d !== downloadResumable);
              }
            }
          })());
        }

        // 3. Oral
        const isL2 = item.level === "2" || item.level === "المستوى الثاني";
        const oId = !isL2 ? extractDriveId(item.oralId || "") : "";
        if (oId && oId.length < 100 && !oId.includes(" ")) {
          tasks.push((async () => {
            const oUrl = `https://drive.google.com/uc?export=download&id=${oId}&confirm=t`;
            const oPath = STORAGE_DIR + `o_${oId}.jpg`;
            const oCheck = await FileSystem.getInfoAsync(oPath);
            if (!oCheck.exists) await FileSystem.downloadAsync(oUrl, oPath).catch(() => { itemSuccess = false; });
          })());
        }

        // 4. Summary
        if (item.summaryId) {
          tasks.push((async () => {
            const sUrl = `https://drive.google.com/uc?export=download&id=${item.summaryId}&confirm=t`;
            const sPath = STORAGE_DIR + `s_${item.summaryId}.jpg`;
            const sCheck = await FileSystem.getInfoAsync(sPath);
            if (!sCheck.exists) await FileSystem.downloadAsync(sUrl, sPath).catch(() => { itemSuccess = false; });
          })());
        }

        await Promise.all(tasks);
      } catch (e) {
        itemSuccess = false;
      }

      if (itemSuccess || !extractDriveId(item.videoId)) {
        successCount++;
      }

      setDownloadProgress(prev => {
        const current = Math.min((prev[lvl]?.current || 0) + 1, levelLessons.length);
        return { ...prev, [lvl]: { ...prev[lvl], current, fileProgress: 0, active: true } };
      });

      if (i < levelLessons.length - 1) {
        await new Promise(res => setTimeout(res, 1000));
      }
    }

    // 🔥 إضافة: تحميل ملحقات المستوى (الامتحان النهائي وكلمات السر) لضمان "كل شيء بالكامل" أوفلاين
    (async () => {
      try {
        if (netStatus.isConnected) {
          let finalExamUrl = "";
          if (lvl === "1") finalExamUrl = "https://docs.google.com/forms/d/1GMgQMa2vFvyQ50Z5fwTwAZUgjaN7vzuqQ4cMIkmAbe8/edit";
          else if (lvl === "2") finalExamUrl = "https://docs.google.com/forms/d/1RBY4P8_uBF9wyIf_yB3z8z8-6xceI7kbBbNkgU7Chgo/edit";

          if (finalExamUrl) {
            const eId = extractDriveId(finalExamUrl);
            const examKey = `exam_cache_v3_${eId}`;
            const qRes = await fetch(`${APPS_SCRIPT_URL}?action=getQuestions&url=${encodeURIComponent(finalExamUrl)}`);
            const qData = await qRes.json();
            if (qData.questions) await AsyncStorage.setItem(examKey, JSON.stringify(qData.questions));
          }

          const credRes = await fetch(`${APPS_SCRIPT_URL}?action=getFinalExamCredentials&level=${lvl}`);
          const credData = await credRes.json();
          if (credData && !credData.error) await AsyncStorage.setItem(`@final_exam_credentials_v4_${lvl}`, JSON.stringify(credData));

          const preReqPromises = levelLessons.map(async (lesson) => {
            const lNum = getLessonNum(lesson.title);
            if (lNum > 1) {
              try {
                const cacheKey = `@cached_pre_codes_${lvl}_${lNum}`;
                const pRes = await fetch(`${APPS_SCRIPT_URL}?action=getPrerequisiteCodes&lessonNum=${lNum}&level=${encodeURIComponent(lvl === "1" ? "المستوى الأول" : "المستوى الثاني")}`);
                const codesList = await pRes.json();
                if (Array.isArray(codesList)) {
                  const codesMap: Record<string, string> = {};
                  codesList.forEach((c: string) => codesMap[c] = "");
                  await AsyncStorage.setItem(cacheKey, JSON.stringify(codesMap));
                }
              } catch (e) { }
            }
          });
          await Promise.all(preReqPromises);

          const cRes = await fetch(`${APPS_SCRIPT_URL}?action=getValidCodes`);
          const cMap = await cRes.json();
          if (!cMap.error) await AsyncStorage.setItem("@cached_codes_map", JSON.stringify(cMap));
        }
      } catch (e) { }
    })();

    await AsyncStorage.setItem(`@auto_sync_${lvl}`, "true");
    setAutoSyncLevels(prev => ({ ...prev, [lvl]: true }));

    fetchLessons(true);
    setDownloadProgress(prev => ({ ...prev, [lvl]: { ...prev[lvl], active: false } }));

    // 🔥 تنظيف تلقائي للملفات اليتيمة لتوفير المساحة
    cleanupOrphanedMedia();

    if (!isSilent) {
      if (successCount === levelLessons.length) {
        setSystemAlert({
          title: "مكتمل وجاهز! ✨",
          message: `تهانينا! تم تحميل كافة عناصر ${lvl === "1" ? "المستوى الأول" : "المستوى الثاني"} بنجاح. المحتوى الآن متاح بين يديك في أي وقت وبدون الحاجة للاتصال بالإنترنت.`,
          type: "success",
          forceLTR: true
        });
      } else if (successCount > 0) {
        setSystemAlert({
          title: "تنبيه الاستكمال",
          message: `تم تنزيل ${successCount} عنصر بنجاح. يمكنك استكمال باقي الحزمة في أي وقت لاحق عند توفر اتصال مستقر بالإنترنت.`,
          type: "info"
        });
      } else {
        setSystemAlert({
          title: "عذراً، فشل التحميل",
          message: "لم نتمكن من بدء التحميل، يرجى التأكد من جودة اتصالك بالإنترنت ثم المحاولة مرة أخرى.",
          type: "error"
        });
      }
    }

    // تتبع تحميل مستوى كامل
    logActivity("download_content", undefined, `Entire Level: ${lvl === "1" ? "المستوى الأول" : "المستوى الثاني"} (Total: ${levelLessons.length})`);
  };

  const calculateLevelStorage = async (lvl: string) => {
    try {
      const levelLessons = lessons.filter(l => String(l.level) === lvl);
      let totalSize = 0;
      let lessonsDownloaded = 0;
      let corruptedCount = 0;

      for (const lesson of levelLessons) {
        const vId = extractDriveId(lesson.videoId);
        const vPath = STORAGE_DIR + `v_${vId}.mp4`;
        const vInfo = await FileSystem.getInfoAsync(vPath).catch(() => null);

        let hasVideo = false;
        if (vInfo && vInfo.exists && !vInfo.isDirectory) {
          if (vInfo.size > 500 * 1024) {
            totalSize += vInfo.size;
            hasVideo = true;
          } else {
            corruptedCount++;
          }
        }

        if (hasVideo) lessonsDownloaded++;

        if (lesson.summaryId) {
          const sPath = STORAGE_DIR + `s_${lesson.summaryId}.jpg`;
          const sInfo = await FileSystem.getInfoAsync(sPath).catch(() => null);
          if (sInfo && sInfo.exists) {
            totalSize += sInfo.size;
          }
        }
      }

      setLevelStats({
        size: totalSize / (1024 * 1024),
        files: lessonsDownloaded,
        corrupted: corruptedCount,
        totalNeeded: levelLessons.length
      });
    } catch (e) { }
  };

  const repairLevel = async (lvl: string) => {
    setIsRepairing(true);
    triggerHaptic();
    try {
      // حذف أي ملفات تالفة أولاً
      const levelLessons = lessons.filter(l => String(l.level) === lvl);
      for (const lesson of levelLessons) {
        const vId = extractDriveId(lesson.videoId);
        const vPath = STORAGE_DIR + `v_${vId}.mp4`;
        const info = await FileSystem.getInfoAsync(vPath).catch(() => null);
        if (info && info.exists && info.size < 500 * 1024) {
          await FileSystem.deleteAsync(vPath, { idempotent: true });
        }
      }

      // إعادة تشغيل التحميل للملفات المفقودة
      await downloadEntireLevel(lvl);
      await calculateLevelStorage(lvl);
      setSystemAlert({ title: "تم الإصلاح", message: "تم فحص جميع الملفات وإعادة تحميل التالف منها بنجاح.", type: "success", forceLTR: true });
    } catch (e) {
      setSystemAlert({ title: "تنبيه", message: "حدث خطأ أثناء محاولة الإصلاح، تأكد من اتصالك بالإنترنت.", type: "error", forceLTR: true });
    } finally {
      setIsRepairing(false);
    }
  };

  const wipeLevel = async (lvl: string) => {
    Alert.alert(
      "حذف الحزمة",
      "هل أنت متأكد من رغبتك في حذف جميع فيديوهات وصور هذا المستوى لتوفير مساحة؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف نهائي",
          style: "destructive",
          onPress: async () => {
            triggerHaptic();
            const levelLessons = lessons.filter(l => String(l.level) === lvl);
            for (const lesson of levelLessons) {
              const vId = extractDriveId(lesson.videoId);
              await FileSystem.deleteAsync(STORAGE_DIR + `v_${vId}.mp4`, { idempotent: true }).catch(() => { });
              if (lesson.summaryId) {
                await FileSystem.deleteAsync(STORAGE_DIR + `s_${lesson.summaryId}.jpg`, { idempotent: true }).catch(() => { });
              }
            }
            await AsyncStorage.removeItem(`@auto_sync_${lvl}`);
            setAutoSyncLevels(prev => ({ ...prev, [lvl]: false }));
            setManagingLevel(null);
            fetchLessons(true);
            setSystemAlert({ title: "تم الحذف", message: "تم إخلاء مساحة المستوى بنجاح.", type: "info" });
          }
        }
      ]
    );
  };

  const resetExamsProgress = async (levelToReset?: string) => {
    const levelName = (levelToReset === "1" || levelToReset === "المستوى الأول") ? "المستوى الأول" : "المستوى الثاني";
    Alert.alert(
      "تصفير التقدم",
      `هل تريد حقاً مسح سجل امتحانات ${levelName} بالكامل؟ (مفيد للتجربة)`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "مسح المستوى",
          style: "destructive",
          onPress: async () => {
            triggerHaptic();
            // جلب قائمة الامتحانات المحلولة حالياً
            const subStr = await AsyncStorage.getItem(SUBMITTED_EXAMS_KEY);
            let sub: string[] = subStr ? JSON.parse(subStr) : [];

            // تحديد عناوين الدروس التابعة لهذا المستوى فقط
            const levelTag = (levelToReset === "1" || levelToReset === "المستوى الأول") ? "المستوى الأول" : "المستوى الثاني";
            const levelLessons = lessons.filter(l => l.level === levelToReset || l.level === levelTag);
            const levelLessonTitles = levelLessons.map(l => l.title);

            // الإبقاء فقط على الامتحانات التي لا تنتمي للمستوى المختار
            const newSub = sub.filter(t => !levelLessonTitles.includes(t));

            await AsyncStorage.setItem(SUBMITTED_EXAMS_KEY, JSON.stringify(newSub));
            setSubmittedExams(newSub);
            setManagingLevel(null);
            setSystemAlert({ title: "تم التصفير", message: `تم مسح تقدم امتحانات ${levelName} بنجاح.`, type: "success" });
          }
        }
      ]
    );
  };

  const clearUserCode = async () => {
    Alert.alert(
      "مسح الكود المحفوظ",
      "هل أنت متأكد من مسح الرقم الكودي الخاص بك من هذا الجهاز؟ (ستحتاج لإدخاله مرة أخرى)",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "مسح الكود",
          style: "destructive",
          onPress: async () => {
            triggerHaptic();
            await AsyncStorage.removeItem("@user_email");
            await AsyncStorage.removeItem("@user_name");
            setUserEmail("");
            setManagingLevel(null);
            setSystemAlert({ title: "تم المسح", message: "تم مسح الرقم الكودي بنجاح من الجهاز.", type: "success" });
          }
        }
      ]
    );
  };

  const cleanupOrphanedMedia = async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(STORAGE_DIR);
      if (!dirInfo.exists) return;

      const files = await FileSystem.readDirectoryAsync(STORAGE_DIR);
      if (files.length === 0) return;

      const activeMediaIds = new Set<string>();
      lessons.forEach(l => {
        const vId = extractDriveId(l.videoId);
        if (vId) activeMediaIds.add(`v_${vId}.mp4`);

        const oId = extractDriveId(l.oralId || "");
        if (oId && oId.length < 100 && !oId.includes(" ")) activeMediaIds.add(`o_${oId}.jpg`);

        if (l.summaryId) activeMediaIds.add(`s_${l.summaryId}.jpg`);
      });

      // إضافة ملفات الـ .tmp النشطة حالياً لتجنب حذفها أثناء التحميل
      Object.keys(downloadProgress).forEach(lvl => {
        if (downloadProgress[lvl].active) {
          lessons.filter(l => String(l.level) === lvl).forEach(l => {
            const vId = extractDriveId(l.videoId);
            if (vId) activeMediaIds.add(`v_${vId}.mp4.tmp`);
          });
        }
      });

      for (const filename of files) {
        if (!activeMediaIds.has(filename)) {
          await FileSystem.deleteAsync(STORAGE_DIR + filename, { idempotent: true });
        }
      }
    } catch (e) { console.log("Cleanup Error", e); }
  };

  useEffect(() => {
    const registerTask = async () => {
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
        if (!isRegistered) {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
            minimumInterval: 15 * 60, // كل 15 دقيقة الموبايل يحاول يبعت
            stopOnTerminate: false,   // يكمل حتى لو التطبيق اتقفل
            startOnBoot: true,        // يشتغل أول ما الموبايل يفتح
          });
        }
      } catch (err) { console.log("Background Task Registration Error", err); }
    };
    registerTask();
  }, []);

  useEffect(() => {
    const checkNotice = async () => {
      // إظهار التنبيه فقط إذا كانت اللغة غير العربية ويوجد نص تنبيه لهذه اللغة
      // @ts-ignore - t.learnCopticNotice exists in non-Arabic
      if (lang !== 'ar' && t.learnCopticNotice) {
        const key = `@learn_coptic_notice_shown_v4_${lang}`;
        const shown = await AsyncStorage.getItem(key);
        if (!shown) {
          setSystemAlert({
            title: lang === 'en' ? "Important Notice" : (lang === 'fr' ? "Avis important" : "Wichtiger Hinweis"),
            message: t.learnCopticNotice as string,
            type: "info"
          });
          await AsyncStorage.setItem(key, "true");
        }
      }
    };
    checkNotice();
  }, [lang]);

  const loadData = async (showLoading = true) => {
    await fetchLessons(!showLoading);
  };

  const openExam = async (lesson: Lesson) => {
    const requestId = ++examLoadRequestRef.current;
    let targetSheetUrl = lesson.targetSheetUrl;
    let targetSheetName = lesson.targetSheetName;
    setPhotoUri(null);
    setPhotoBase64(null);

    // توجيه الامتحانات العادية للمستوى الثاني إلى الشيتات المخصصة لها
    if (lesson.level === "2" || lesson.level === "المستوى الثاني") {
      const isLevelTwoFinal = lesson.title === "الامتحان النهائي - المستوى الثاني" || lesson.title === "الامتحان النهائي";
      if (!isLevelTwoFinal) {
        // شيت تخزين امتحانات المستوى الثاني الموحد
        targetSheetUrl = "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit";

        // استخراج الامتحانات وتحديد الترتيب بناء على التسلسل
        const level2Exams = lessons.filter(l => (l.level === "2" || l.level === "المستوى الثاني") && l.examUrl && l.title !== "الامتحان النهائي - المستوى الثاني" && l.title !== "الامتحان النهائي");
        const examIndex = level2Exams.findIndex(l => l.title === lesson.title);

        if (examIndex !== -1) {
          targetSheetName = `quiz${examIndex + 1}`;
        }
      }
    }

    const lessonObj = { ...lesson, targetSheetUrl, targetSheetName };

    // إظهار شاشة الامتحان فور الضغط، ثم ملؤها من الكاش أو الشبكة
    setExamModal({ ...lessonObj, questions: [] });
    setCurrentAnswers([]);
    setIsLoadingExam(true);
    setFinalExamStep(1);
    logActivity("exam_start", undefined, lessonObj.title);
    const eId = extractDriveId(lessonObj.examUrl);
    const examKey = `exam_cache_v3_${eId}`;

    // 1. إظهار الأسئلة المحلية فور توفرها دون انتظار الشبكة
    let cachedStr: string | null = null;
    try {
      cachedStr = await AsyncStorage.getItem(examKey);
    } catch (e) {
      console.log("Exam cache read failed");
    }
    if (requestId !== examLoadRequestRef.current) return;
    let loadedFromCache = false;

    if (cachedStr) {
      try {
        const q = JSON.parse(cachedStr);
        if (Array.isArray(q) && q.length > 0) {
          const initialAnswers = new Array(q.length).fill("");
          q.forEach((item: any, i: number) => {
            if (item.title?.includes("كود") || item.title?.toLowerCase().includes("code")) initialAnswers[i] = userEmail;
          });
          setCurrentAnswers(initialAnswers);
          setExamModal({ ...lessonObj, questions: q });
          setIsLoadingExam(false);
          loadedFromCache = true;
        }
      } catch (e) {
        console.log("Invalid cached exam questions");
      }
    }

    // 2. مزامنة البيانات وتحديث الكاش في الخلفية دون تعطيل واجهة المستخدم
    setTimeout(async () => {
      let isConnected = false;
      try {
        isConnected = Boolean((await NetInfo.fetch()).isConnected);
      } catch (e) { }
      if (requestId !== examLoadRequestRef.current) return;
      if (!isConnected) {
        if (!loadedFromCache) {
          setIsLoadingExam(false);
          setSystemAlert({ title: "لا يوجد اتصال", message: "لا توجد أسئلة محفوظة لهذا الامتحان. اتصل بالإنترنت وحاول مرة أخرى.", type: "error" });
        }
        return;
      }

      let questionsReady = loadedFromCache;
      try {
        const isFinalExam = lesson.title === "الامتحان النهائي - المستوى الأول" || lesson.title === "الامتحان النهائي - المستوى الثاني" || lesson.title === "الامتحان النهائي";

        // طلب الأسئلة أولاً حتى لا تنتظر الشاشة تحديث الأكواد والبيانات المساندة
        const qRes = await fetch(`${APPS_SCRIPT_URL}?action=getQuestions&url=${encodeURIComponent(lesson.examUrl)}`);
        const qData = await qRes.json();
        if (requestId !== examLoadRequestRef.current) return;

        if (qData.questions && qData.questions.length > 0) {
          let finalQuestions = qData.questions;
          if (isFinalExam) {
            const hasEmail = finalQuestions.some((q: any) =>
              (q.title || "").toLowerCase().includes("email") || (q.title || "").includes("بريد") || (q.title || "").includes("عنوان البريد الإلكتروني")
            );
            if (!hasEmail) {
              finalQuestions = [{ title: "عنوان البريد الإلكتروني", type: "TEXT", choices: [] }, ...finalQuestions];
            }
          }

          questionsReady = true;
          setExamModal(prev => {
            if (!prev || prev.examUrl !== lessonObj.examUrl) return prev;
            return { ...prev, questions: finalQuestions };
          });
          setIsLoadingExam(false);
          AsyncStorage.setItem(examKey, JSON.stringify(finalQuestions)).catch(() => { });

          if (!loadedFromCache) {
            const initialAnswers = new Array(finalQuestions.length).fill("");
            finalQuestions.forEach((q: any, i: number) => {
              if (q.title?.includes("كود") || q.title?.toLowerCase().includes("code")) initialAnswers[i] = userEmail;
            });
            setCurrentAnswers(initialAnswers);
          }
        } else if (!loadedFromCache) {
          setIsLoadingExam(false);
          setSystemAlert({ title: "تعذر تحميل الامتحان", message: "لم تصل أسئلة الامتحان. تحقق من اتصال الإنترنت وحاول مرة أخرى.", type: "error" });
          return;
        }

        // تحديث الأكواد والاعتمادات
        const cRes = await fetch(`${APPS_SCRIPT_URL}?action=getValidCodes`);
        const cMap = await cRes.json();
        if (requestId !== examLoadRequestRef.current) return;
        setValidCodesMap(cMap);
        await AsyncStorage.setItem("@cached_codes_map", JSON.stringify(cMap));

        if (isFinalExam) {
          const currentLev = (lesson.level === "المستوى الثاني" || lesson.level === "2") ? "2" : "1";
          const credRes = await fetch(`${APPS_SCRIPT_URL}?action=getFinalExamCredentials&level=${currentLev}`);
          const credData = await credRes.json();
          if (!credData.error) {
            const cacheKey = `@final_exam_credentials_v3_${currentLev}`;
            await AsyncStorage.setItem(cacheKey, JSON.stringify(credData));
          }
        }

        const title = lesson.title || "";
        const isLevelOne = lesson.level === "المستوى الأول";
        const isLevelTwo = lesson.level === "المستوى الثاني";
        const lNum = getLessonNum(title);

        if ((isLevelOne || isLevelTwo) && lNum > 1) {
          const pRes = await fetch(`${APPS_SCRIPT_URL}?action=getPrerequisiteCodes&lessonNum=${lNum}&level=${encodeURIComponent(lesson.level || "")}`);
          const pList: string[] = await pRes.json();
          if (requestId !== examLoadRequestRef.current) return;
          setAllowedCodes(pList);
        } else {
          setAllowedCodes([]);
        }

      } catch (e) {
        console.log("Background sync failed");
        if (requestId === examLoadRequestRef.current && !questionsReady) {
          setIsLoadingExam(false);
          setSystemAlert({ title: "تعذر تحميل الامتحان", message: "حدثت مشكلة أثناء تحميل الأسئلة. تحقق من اتصال الإنترنت وحاول مرة أخرى.", type: "error" });
        }
      }
    }, 0);
  };

  const [examResult, setExamResult] = useState<{
    success: boolean;
    score?: string;
    offline?: boolean;
    warning?: boolean;
    message?: string;
    userName?: string;
    reviewQuestions?: any[];
    userAnswers?: string[];
    title?: string;
    level?: string;
    skipScoreModal?: boolean;
  } | null>(null);


  const submitOfflineExam = async (overrideAnswers?: string[], isAdminOverride = false) => {

    if (!userEmail) {
      setExamResult({ success: false, warning: true, message: "برجاء إدخال الرقم الكودي أولاً." });
      return;
    }

    let foundUserName = "";
    setIsSubmitting(true);
    await AsyncStorage.setItem("@user_email", userEmail);

    const answersToUse = overrideAnswers || currentAnswers;
    const answersData = examModal?.questions?.map((q, idx) => ({
      title: q.title,
      answer: answersToUse[idx] || ""
    }));

    // التحقق من إكمال جميع الحقول (يتم التخطي للأدمن في وضع الإرسال المباشر)
    const allAnswered = answersToUse.every(ans => ans && ans.trim() !== "");
    if (!allAnswered && !isAdminOverride) {
      setExamResult({ success: false, warning: true });
      setIsSubmitting(false);
      return;
    }

    // التحقق من صيغة البريد الإلكتروني
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (let i = 0; i < (examModal?.questions?.length || 0); i++) {
      const q = examModal!.questions![i];
      const ans = answersToUse[i] || "";
      const t = q.title.toLowerCase();
      if (t.includes("email") || t.includes("بريد") || t.includes("ميل")) {
        if (ans.trim() !== "" && !emailRegex.test(ans.trim())) {
          setExamResult({ success: false, warning: true, message: "برجاء إدخال بريد إلكتروني بصيغة صحيحة (مثال: name@email.com)" });
          setIsSubmitting(false);
          return;
        }
      }
    }

    // --- الارسال الفوري (Instant Feedback) ---
    let localScoreCount = 0;
    let localTotalPoints = 0;
    examModal?.questions?.forEach((q, idx) => {
      const pts = (q as any).points || 0;
      if (pts > 0) {
        localTotalPoints += pts;
        if (String(answersToUse[idx]).trim() === String((q as any).correctValue).trim()) {
          localScoreCount += pts;
        }
      }
    });
    const localScoreText = localScoreCount + " / " + localTotalPoints;

    const submission = {
      action: "submitExam",
      submissionId: `${Date.now()}_${userEmail}`,
      examUrl: examModal?.examUrl,
      email: userEmail,
      answers: JSON.stringify(answersData),
      targetSheetUrl: examModal?.targetSheetUrl,
      targetSheetName: examModal?.targetSheetName,
      localScore: isAdminOverride ? (localTotalPoints > 0 ? `${localTotalPoints} / ${localTotalPoints}` : "100 / 100") : localScoreText,
      photoData: photoBase64,
      level: examModal?.level
    };

    console.log("🚀 Sending Exam Submission:", submission.submissionId);


    // --- نظام درع المعلم: التحقق من الأكواد المعتمدة (فقط للدرس الأول) ---
    const isLevelOne = examModal?.level === "المستوى الأول";
    const title = examModal?.title || "";
    const isLessonOne = title.includes("الأول") || title.includes("الاول");
    const isAdmin = isAdminMode && userEmail.endsWith("000");


    const lNum = getLessonNum(title);

    if (isLevelOne || examModal?.level === "المستوى الثاني") {
      try {
        const net = await NetInfo.fetch();
        let codesMap: Record<string, string> = {};

        if (isLessonOne) {
          if (net.isConnected) {
            const cRes = await fetch(`${APPS_SCRIPT_URL}?action=getValidCodes`);
            const resData = await cRes.json();
            if (resData && resData.error) throw new Error(resData.error);
            codesMap = resData;
            await AsyncStorage.setItem("@cached_codes_map", JSON.stringify(codesMap));
          } else {
            const cached = await AsyncStorage.getItem("@cached_codes_map");
            codesMap = cached ? JSON.parse(cached) : {};
          }
        } else if (lNum > 1) {
          const cacheKey = `@cached_pre_codes_${examModal?.level}_${lNum}`;
          if (net.isConnected) {
            const cRes = await fetch(`${APPS_SCRIPT_URL}?action=getPrerequisiteCodes&lessonNum=${lNum}&level=${encodeURIComponent(examModal?.level || "")}`);
            const codesList = await cRes.json();
            if (codesList && codesList.error) throw new Error(codesList.error);
            // التأكد من أنها مصفوفة قبل عمل لوب
            if (Array.isArray(codesList)) {
              codesList.forEach(c => codesMap[c] = "");
              await AsyncStorage.setItem(cacheKey, JSON.stringify(codesMap));
            }
          } else {
            const cached = await AsyncStorage.getItem(cacheKey);
            codesMap = cached ? JSON.parse(cached) : {};
          }
        } else {
          // الدروس اللي مش مترقمة (مراجعات وخلافه) نعتمد فيها على صحة الكود الأصلي فقط كحد أدنى
          if (net.isConnected) {
            const cRes = await fetch(`${APPS_SCRIPT_URL}?action=getValidCodes`);
            const resData = await cRes.json();
            if (resData && !resData.error) codesMap = resData;
          } else {
            const cached = await AsyncStorage.getItem("@cached_codes_map");
            if (cached) codesMap = JSON.parse(cached);
          }
        }

        const trimCode = userEmail.trim();
        const isAdmin = isAdminMode && trimCode.endsWith("000");

        // استخراج الاسم للعرض بلمسة احترافية قبل التحقق
        foundUserName = validCodesMap[trimCode] ||
          codesMap[trimCode] ||
          "";
        if (isAdmin) foundUserName = "معلمنا الغالي";

        const isRegisteredGlobal = validCodesMap[trimCode];
        if (!isRegisteredGlobal && !isAdmin) {
          setExamResult({ success: false, warning: true, message: "رقم الكود غير مسجل في السيستم. برجاء مراجعة المعلم." });
          setIsSubmitting(false);
          return;
        }

        const validCodes = Object.keys(codesMap);

        // 2. تحقق الدروس المتتالية للتسلسل الصحيح (موجود في قائمة الناجحين للدرس السابق)
        if (lNum > 1 && !validCodes.includes(trimCode) && !isAdmin) {
          const preMsg = foundUserName
            ? `عفواً يا ${foundUserName}، يجب عليك اجتياز امتحان الدرس السابق أولاً لتتمكن من إرسال هذا الامتحان.`
            : `عفواً، يجب عليك اجتياز امتحان الدرس السابق أولاً لتتمكن من إرسال هذا الامتحان.`;

          setExamResult({ success: false, warning: true, message: preMsg, userName: foundUserName });
          setIsSubmitting(false);
          return;
        }

        // بالنسبة للدرس الأول أو المراجعات: تحقق أنه موجود في قائمة lesson codes اللي جبناها
        if ((isLessonOne || lNum === 0) && !validCodes.includes(trimCode) && !isAdmin) {
          setExamResult({ success: false, warning: true, message: "الكود المسجل غير صالح لهذا الامتحان. برجاء مراجعة المعلم." });
          setIsSubmitting(false);
          return;
        }

      } catch (e: any) {
        setExamResult({ success: false, warning: true, message: "فشل التحقق من الأكواد: " + (e.message || "خطأ غير متوقع. يرجى مراجعة الصلاحيات.") });
        setIsSubmitting(false);
        return; // الإيقاف فوراً لمنع التخطي في حال حدوث خطأ
      }
    }


    const savedQuestions = examModal?.questions ? [...examModal.questions] : [];
    const savedAnswers = [...answersToUse];
    setExamModal(null);
    const resultObj = {
      success: true,
      score: isAdminOverride ? "100 / 100" : localScoreText,
      userName: foundUserName,
      reviewQuestions: isAdminOverride ? [] : savedQuestions,
      userAnswers: isAdminOverride ? [] : savedAnswers,
      title: examModal?.title,
      level: examModal?.level
    };
    setExamResult(resultObj);
    setIsSubmitting(false);
    triggerProgressNotification('exam', examModal?.title || "", examModal?.level || "");

    // تسجيل العملية محلياً
    try {
      const subStr = await AsyncStorage.getItem(SUBMITTED_EXAMS_KEY);
      let sub = subStr ? JSON.parse(subStr) : [];

      const currentTitle = examModal?.title || "";
      // ✅ التعديل هنا: تمييز الامتحان النهائي حسب المستوى
      let finalTitle = currentTitle;
      if (currentTitle === "الامتحان النهائي" && examModal?.level) {
        finalTitle = `الامتحان النهائي - المستوى ${examModal.level === "2" ? "الثاني" : "الأول"}`;
      }
      if (finalTitle && !sub.includes(finalTitle)) {
        sub.push(finalTitle);
      }

      // حفظ آخر درس تم إنهاؤه بنجاح (لإشعارات العودة الذكية)
      await Promise.all([
        AsyncStorage.setItem(SUBMITTED_EXAMS_KEY, JSON.stringify(sub)),
        AsyncStorage.setItem('@coptic/last_finished_lesson_name', currentTitle),
        AsyncStorage.setItem('@coptic/last_finished_level', String(examModal?.level || "")),
        AsyncStorage.setItem(`@exam_review_${currentTitle}`, JSON.stringify(resultObj)),
      ]);

      setSubmittedExams(sub);

      // تتبع إرسال الامتحان
      logActivity("exam_submit", undefined, `Exam: ${currentTitle} | Result: ${localScoreText} | User: ${foundUserName || userEmail}`);
    } catch (e) { }

    // الإرسال في الخلفية
    setTimeout(async () => {
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        try {
          const resp = await fetch(`${APPS_SCRIPT_URL}?action=submitExam`, {
            method: "POST",
            body: JSON.stringify(submission),
            headers: { "Content-Type": "application/json" }
          });
          const res = await resp.json();
          console.log("✅ Server Response:", res);
          if (!res.success) {
            console.warn("❌ Submission Failed:", res.error);
            const offSub = await AsyncStorage.getItem(EXAM_OFFLINE_SUBMISSIONS);
            const list = offSub ? JSON.parse(offSub) : [];
            list.push(submission);
            await AsyncStorage.setItem(EXAM_OFFLINE_SUBMISSIONS, JSON.stringify(list));
          }
        } catch (e) {
          console.warn("⚠️ Network/Server Error:", e);
          const offSub = await AsyncStorage.getItem(EXAM_OFFLINE_SUBMISSIONS);
          const list = offSub ? JSON.parse(offSub) : [];
          list.push(submission);
          await AsyncStorage.setItem(EXAM_OFFLINE_SUBMISSIONS, JSON.stringify(list));
        }
      } else {
        const offSub = await AsyncStorage.getItem(EXAM_OFFLINE_SUBMISSIONS);
        const list = offSub ? JSON.parse(offSub) : [];
        list.push(submission);
        await AsyncStorage.setItem(EXAM_OFFLINE_SUBMISSIONS, JSON.stringify(list));
      }
    }, 0);
  };

  const triggerProgressNotification = async (type: 'lesson' | 'exam', title?: string, level?: string) => {
    try {
      const now = Date.now();
      await AsyncStorage.setItem("@engagement/last_learn_timestamp_v1", now.toString());

      // جلب الاسم الأول للمستخدم لإضافته لرسالة التهنئة
      const fullName = (await AsyncStorage.getItem("@user_name") || "").trim();
      const firstName = fullName ? fullName.split(/\s+/)[0] : "يا بطل";

      let bodyText = "";
      if (type === 'lesson') {
        bodyText = `لقد أنهيت ${title || "الدرس"} بنجاح!`;
      } else {
        // حساب ترتيب الامتحان الفعلي داخل المستوى الحالي (بناءً على الدروس التي تحتوي على امتحان فقط)
        const examsInLevel = lessons.filter(l => l.level === level && l.examUrl && l.examUrl.trim() !== "");
        const examIdx = examsInLevel.findIndex(l => l.title === title);

        const ordinals = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر"];
        let examNumText = examIdx >= 0 ? (ordinals[examIdx] || `رقم ${examIdx + 1}`) : (title || "");

        const levelName = (level === "1" || level === "المستوى الأول") ? "المستوى الأول" : "المستوى الثاني";

        if (title === "الامتحان النهائي - المستوى الأول" || title === "الامتحان النهائي - المستوى الثاني" || title === "الامتحان النهائي") {
          bodyText = `لقد أنهيت الامتحان النهائي من ${levelName}، يمكنك استخراج شهادتك بعد ثلاث ساعات من الآن 😍🥳🎓`;
        } else if (examIdx === 8 && (level === "1" || level === "المستوى الأول")) {
          // رسالة تشجيعية خاصة للامتحان التاسع (قبل الأخير) في المستوى الأول
          bodyText = `لقد أنهيت الامتحان التاسع من ${levelName}، أنت تقترب من الشهادة 😍🥳`;
        } else if (examIdx === 2 && (level === "2" || level === "المستوى الثاني")) {
          // رسالة تشجيعية خاصة للامتحان الثالث (قبل الأخير) في المستوى الثاني
          bodyText = `لقد أنهيت الامتحان الثالث من ${levelName}، أنت تقترب من الشهادة 😍🥳`;
        } else {
          bodyText = `لقد أنهيت الامتحان ${examNumText} من ${levelName}، تابع الدراسة 😍🥳`;
        }
      }

      const personalizedBody = `يا ${firstName}، ${bodyText}`;

      await Notifications.scheduleNotificationAsync({
        identifier: 'congrats-progress',
        content: {
          title: t.notification.learningProgress.congrats,
          body: personalizedBody,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: 'progress', isLocal: true },
          channelId: 'khmi-notifications',
        } as any,
        trigger: null, // إرسال فوري
      });

      // الحل الجذري: تنظيف كافة إشعارات التذكير السابقة نهائياً لمنع أي تداخل فوري
      await Promise.all([
        Notifications.cancelScheduledNotificationAsync('learning-reminder'),
        Notifications.cancelScheduledNotificationAsync('resume-study-3-days'),
        Notifications.cancelScheduledNotificationAsync('resume-study-4-days'),
      ]);

      const personalizedReminderBody = firstName
        ? `${firstName}، ${t.notification.learningProgress.reminderBody}`
        : t.notification.learningProgress.reminderBody;

      // جدولة التذكير الجديد ليكون بعد 3 أيام بالضبط من الآن
      await Notifications.scheduleNotificationAsync({
        identifier: 'learning-reminder',
        content: {
          title: t.notification.learningProgress.reminderTitle,
          body: personalizedReminderBody,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
          data: { type: 'learning_reminder', isLocal: true },
          channelId: 'khmi-notifications',
        } as any,
        trigger: {
          type: 'timeInterval',
          seconds: 3 * 24 * 60 * 60, // 3 أيام (إكمال الدراسة)
          repeats: false,
        } as any,
      });
    } catch (e) { }
  };

  const renderMixed = (text: string, baseSize: number, onHighlightPress?: () => void, align: "left" | "center" | "right" = "left", forceLTR: boolean = false) => {
    if (!text) return null;
    const parts = text.split(/([\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF]+)/g);

    return (
      <Text style={{
        textAlign: align,
        writingDirection: forceLTR ? "ltr" : "auto",
        lineHeight: baseSize * 1.6,
        color: isDark ? "#FFF" : "#202124",
      }}>
        {parts.map((part, i) => {
          if (!part) return null;
          const isCoptic = /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF]/.test(part);

          if (!isCoptic && onHighlightPress && part.includes("اضغط هنا")) {
            const subParts = part.split(/(اضغط هنا)/g);
            return (
              <Text key={i} style={{ fontSize: baseSize, fontFamily: "Cairo_700Bold" }}>
                {subParts.map((sp, spIdx) => {
                  if (sp === "اضغط هنا") {
                    return (
                      <Text key={spIdx} onPress={onHighlightPress} style={{ color: "#1565C0", textDecorationLine: "underline" }}>
                        {sp}
                      </Text>
                    );
                  }
                  return <Text key={spIdx}>{sp}</Text>;
                })}
              </Text>
            );
          }

          return (
            <Text key={i} style={{
              fontSize: isCoptic ? baseSize + 2 : baseSize,
              fontFamily: isCoptic ? "CSAvaVeni-Regular" : "Cairo_700Bold",
            }}>
              {isCoptic ? `\u202A${part}\u202C` : part}
            </Text>
          );
        })}
      </Text>
    );
  };

  const refreshLessonGlossaryFromSource = async (lessonNumber: number) => {
    const lessonLetters = LEVEL_ONE_GLOSSARY_LETTERS[lessonNumber];
    if (!lessonLetters) return;
    const allowedLetters = Object.entries(LEVEL_ONE_GLOSSARY_LETTERS)
      .filter(([number]) => Number(number) <= lessonNumber)
      .flatMap(([, letters]) => letters);
    const allowJenkim = lessonNumber >= 5;
    const requestId = ++glossaryRequestRef.current;
    try {
      const cachedEntries = await loadEntries();
      if (requestId !== glossaryRequestRef.current) return;
      if (cachedEntries?.length) {
        const cachedWords = buildLessonGlossaryWords(cachedEntries, allowedLetters, lessonLetters, allowJenkim);
        setLessonGlossary((current) => current?.lessonNumber === lessonNumber
          ? { ...current, words: cachedWords, loading: false, error: undefined }
          : current);
      }

      const network = await NetInfo.fetch();
      if (network.isConnected !== true || network.isInternetReachable === false) {
        if (!cachedEntries?.length) {
          setLessonGlossary((current) => current?.lessonNumber === lessonNumber
            ? { ...current, loading: false, error: "اتصل بالإنترنت مرة واحدة لتنزيل القاموس للاستخدام دون اتصال." }
            : current);
        }
        return;
      }
      if (requestId !== glossaryRequestRef.current) return;
      const entries = await fetchDictionaryData();
      await saveEntries(entries).catch(() => undefined);
      const words = buildLessonGlossaryWords(entries, allowedLetters, lessonLetters, allowJenkim);
      if (requestId === glossaryRequestRef.current) {
        setLessonGlossary((current) => current?.lessonNumber === lessonNumber
          ? { ...current, words, loading: false, error: undefined }
          : current);
      }
    } catch {
      setLessonGlossary((current) => requestId === glossaryRequestRef.current && current?.lessonNumber === lessonNumber && current.words.length === 0
        ? { ...current, loading: false, error: "تعذر تحميل القاموس. اتصل بالإنترنت ثم أعد المحاولة." }
        : current);
    }
  };

  const openLessonGlossary = (lesson: Lesson, lessonNumber: number) => {
    const lessonLetters = LEVEL_ONE_GLOSSARY_LETTERS[lessonNumber];
    if (!lessonLetters) return;

    glossaryRequestRef.current += 1;
    setLessonGlossary({ lessonNumber, lessonTitle: lesson.title, letters: lessonLetters, words: [], loading: true });
    // Restore the saved dictionary first; if absent, download it once while online.
    void refreshLessonGlossaryFromSource(lessonNumber);
  };

  useEffect(() => {
    const activeLessonNumber = lessonGlossary?.lessonNumber;
    if (activeLessonNumber === undefined) {
      glossaryOnlineRef.current = null;
      return;
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      const wasOnline = glossaryOnlineRef.current;
      glossaryOnlineRef.current = isOnline;
      if (wasOnline === false && isOnline) {
        void refreshLessonGlossaryFromSource(activeLessonNumber);
      }
    });
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshLessonGlossaryFromSource(activeLessonNumber);
    });
    return () => {
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [lessonGlossary?.lessonNumber]);

  const closeLessonGlossary = () => {
    glossaryRequestRef.current += 1;
    setLessonGlossary(null);
    setSelectedGlossaryWord(null);
  };

  const renderLessonItem = ({ item, index }: { item: Lesson; index: number }) => {
    const vId = extractDriveId(item.videoId);
    const lessonNumber = getLessonNum(item.title);
    const isLevelOneGlossaryLesson =
      (item.level === "1" || item.level === "المستوى الأول") &&
      /درس/.test(item.title) &&
      !/مراجعة|مراجعات|امتحان/.test(item.title) &&
      lessonNumber >= 1 && lessonNumber <= 9;
    return (
      <Animated.View entering={FadeInDown.delay(index * 100)} style={styles.lessonItemContainer}>
        <View style={[styles.lessonCard, { backgroundColor: isDark ? "#1C1B1A" : "#FFFFFF", borderColor: isDark ? "#39342B" : "#EAE5DC" }]}>
          <View style={styles.videoHost}>
            <TouchableOpacity onPress={() => {
              triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
              setActiveVideo(item);
              markAsWatched(item);
              logActivity("lesson_view", undefined, item.title); // تتبع المشاهدة للرؤى
            }} style={styles.thumbWrapper}>
              <ImageBackground
                source={localCoverExists ? { uri: LOCAL_COVER_PATH } : { uri: `https://lh3.googleusercontent.com/d/${GLOBAL_COVER_ID}=w1000` }}
                style={styles.thumbCover}
                imageStyle={{ resizeMode: "cover" }}
              >
                <View style={styles.playBtnCircle}><Feather name="play" size={28} color="#FFF" /></View>
              </ImageBackground>
              {item.localVideo && <View style={styles.offTag}><Feather name="check" size={12} color="#FFF" /></View>}
            </TouchableOpacity>
          </View>

          <View style={styles.lessonBody}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lessonTitle, { color: isDark ? "#FFF" : "#8B0000" }]} numberOfLines={1}>{item.title}</Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {item.localVideo && (
                  <>
                    <TouchableOpacity onPress={() => { triggerHaptic(); exportVideoToGallery(item.localVideo!); }}>
                      <Feather name="download" size={20} color="#4CAF50" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { triggerHaptic(); shareMedia(item.localVideo!, item); }}>
                      <Feather name="share-2" size={20} color="#2196F3" />
                    </TouchableOpacity>
                  </>
                )}
                {watchedLessons.has(item.videoId) && (
                  <View style={styles.watchedBadge}>
                    <Feather name="check" size={12} color="#FFF" />
                  </View>
                )}
                {item.sizeMB ? (
                  <View style={styles.sizeBadge}>
                    <Text style={styles.sizeBadgeTxt}>{item.sizeMB} MB</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* أزرار الإجراءات: ملخص، تدريب/شفوي، امتحان */}
        <View style={styles.premiumActionsBar}>
          {item.summaryId && (
            <TouchableOpacity style={styles.premiumActionBtn} onPress={() => { triggerHaptic(); setViewingSummary(item); logActivity("modal_open", undefined, `Summary: ${item.title}`); }}>
              <LinearGradient colors={["#9b59b6", "#8e44ad"]} style={styles.premiumActionInner}>
                <Feather name="image" size={18} color="#FFF" />
                <Text style={styles.premiumActionTxt}>{buttonLabel("button_lesson_summary", "ملخص")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {!(item.hideKey?.includes("ش") || item.hideKey?.includes("ت")) && (
            <TouchableOpacity style={styles.premiumActionBtn} onPress={() => { triggerHaptic(); setViewingOral(item); logActivity("modal_open", undefined, `Oral/Training: ${item.title}`); }}>
              <LinearGradient colors={["#C8A951", "#8B6B1E"]} style={styles.premiumActionInner}>
                <Feather name={(item.level === "2" || item.level === "المستوى الثاني") ? "book-open" : "mic"} size={18} color="#FFF" />
                <Text style={styles.premiumActionTxt}>{buttonLabel("button_lesson_training", (item.level === "2" || item.level === "المستوى الثاني") ? "التدريب" : "الشفوي")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {!item.hideKey?.includes("ك") && (() => {
            const allLessonsInLevel = lessons.filter(l => l.level === selectedLevel);
            // تحديد الامتحانات بناءً على وجود رابط فعلي للامتحان لتجنب أي أخطاء في الـ hideKey
            const examsInLevel = allLessonsInLevel.filter(l => l.examUrl && l.examUrl.trim() !== "");
            const myExamIndex = examsInLevel.findIndex(l => l.videoId === item.videoId);

            // في حالة كان الزر يظهر ولكن لا يوجد له رابط امتحان (خطأ داتا)، لا نمنعه من العرض
            if (myExamIndex === -1) return null;

            const isAdmin = isAdminMode && (userEmail || "").trim().endsWith("000");
            let isPrevExamDone = true;
            if (myExamIndex > 0) {
              const prevLessonWithExam = examsInLevel[myExamIndex - 1];
              isPrevExamDone = isAdmin || submittedExams.includes(prevLessonWithExam.title) || unlockAllLevels;
            }

            const isExamDone = submittedExams.includes(item.title) || unlockAllLevels;

            return (
              <TouchableOpacity
                style={[styles.premiumActionBtn, (!isPrevExamDone && !isExamDone) && { opacity: 0.6 }, isExamDone && { opacity: 0.8 }]}
                onPress={() => {
                  const isLevel1 = (selectedLevel === "1" || selectedLevel === "المستوى الأول");
                  const userHasNoCode = !userEmail || userEmail.trim() === "";

                  // حماية المستوى الأول: منع أي امتحان من الفتح إذا لم يكن هناك كود
                  if (isLevel1 && userHasNoCode) {
                    setSystemAlert({
                      title: "تنبيه",
                      message: "يجب الحصول على رقم كودي خاص بك لبدء الامتحانات الالكترونية.",
                      type: "info",
                      actionLabel: "الحصول على كود",
                      forceLTR: true,
                      onAction: () => setCodeModalVisible(true)
                    });
                    return;
                  }

                  if (isExamDone && !isAdmin) {
                    const userName = validCodesMap[userEmail.trim()] || "مستخدمنا العزيز";
                    setSystemAlert({
                      title: "تنبيه هام",
                      message: `عفواً ${userName}، لا يمكن حل هذا الامتحان مرتين.`,
                      type: "warning",
                      actionLabel: "تصفح الإجابة النموذجية",
                      onAction: async () => {
                        try {
                          const cached = await AsyncStorage.getItem(`@exam_review_${item.title}`);
                          if (cached) {
                            const parsed = JSON.parse(cached);
                            setExamResult({ ...parsed, level: parsed.level || item.level, skipScoreModal: true });
                            setReviewModalVisible(true);
                          } else {
                            setSystemAlert({ title: "عفواً", message: "لم يتم العثور على الإجابات النموذجية على هذا الجهاز.", type: "error" });
                          }
                        } catch (e) { }
                      }
                    });
                  } else if (isPrevExamDone) {
                    triggerHaptic();
                    openExam(item);
                  } else {
                    const userName = validCodesMap[userEmail.trim()] || "مستخدمنا العزيز";
                    const ordinals = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
                    const precedingMissingExams = examsInLevel
                      .slice(0, myExamIndex)
                      .filter(l => !submittedExams.includes(l.title))
                      .map(l => {
                        const actualIdx = examsInLevel.findIndex(ex => ex.title === l.title);
                        return ordinals[actualIdx] || String(actualIdx + 1);
                      });

                    const missingMsg = precedingMissingExams.join(" و");

                    setSystemAlert({
                      title: "تنبيه هام",
                      message: `عفواً ${userName}، يجب عليك حل الامتحان ${missingMsg} لبدء هذا الامتحان.`,
                      type: "warning"
                    });
                  }
                }}
              >
                <LinearGradient
                  colors={(!isPrevExamDone && !isExamDone) ? ["#9E9E9E", "#757575"] : ["#007AFF", "#0056B3"]}
                  style={styles.premiumActionInner}
                >
                  <Feather name={(!isPrevExamDone && !isExamDone) ? "lock" : "edit-3"} size={18} color="#FFF" />
                  <Text style={styles.premiumActionTxt}>{buttonLabel("button_lesson_exam", "الامتحان")}</Text>
                </LinearGradient>
              </TouchableOpacity>
            );
          })()}
        </View>

        {isLevelOneGlossaryLesson && (
          <TouchableOpacity
            style={[styles.lessonGlossaryButton, { borderColor: isDark ? "rgba(200,169,81,0.4)" : "#E9D7A0" }]}
            activeOpacity={0.85}
            onPress={() => {
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              void openLessonGlossary(item, lessonNumber);
            }}
          >
            <LinearGradient
              colors={isDark ? ["#342A18", "#241E14"] : ["#FFF8E8", "#F8EBC9"]}
              style={styles.lessonGlossaryButtonInner}
            >
              <Feather name="book-open" size={18} color={isDark ? "#E5C76A" : "#8B6B1E"} />
              <Text style={[styles.lessonGlossaryButtonText, { color: isDark ? "#E5C76A" : "#7D1B16" }]}>{buttonLabel("button_lesson_glossary", "قاموس كلمات الدرس")}</Text>
              <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={isDark ? "#E5C76A" : "#8B6B1E"} />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {!item.localVideo && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={buttonLabel("button_lesson_download", "تنزيل الدرس")} onPress={() => { triggerHaptic(); downloadOne(item); }} style={styles.downBtn}>
            {downloadingId === vId ? <ActivityIndicator size="small" color="#C8A951" /> : <Feather name="download-cloud" size={18} color="#C8A951" />}
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  const renderExamContent = () => {
    if (!examModal) return null;
    let skippedActual = 0;

    // استخراج الكود المكتوب حالياً في خانة الإجابة لضمان التفاعل اللحظي
    let codeInField = "";
    examModal.questions?.forEach((q, idx) => {
      const isCode = q.title.includes("كود") || q.title.toLowerCase().includes("code");
      if (isCode) codeInField = (currentAnswers[idx] || "").trim();
    });

    const activeCode = codeInField || userEmail.trim();
    const isAdminLive = isAdminMode && activeCode.endsWith("000");

    // التحقق الشامل واللحظي من تسجيل الكود المكتوب
    const isRegisteredGlobalLive = Boolean(
      validCodesMap[activeCode] ||
      globalCertMappings["1"]?.[activeCode] ||
      globalCertMappings["2"]?.[activeCode]
    );

    const lNumLive = examModal.title ? getLessonNum(examModal.title) : 0;
    const isPreReqPassedLive = allowedCodes.includes(activeCode);

    let isSubmitLocked = false;
    let lockReason = "";

    if (!isAdminLive) {
      // الزرار يعتمد كلياً على القيمة المكتوبة حالياً في الخانة
      if (activeCode === "" || !isRegisteredGlobalLive) {
        isSubmitLocked = true;
        lockReason = activeCode === "" ? "يرجى إدخال الكود" : "الرقم الكودي غير صحيح";
      } else if (examModal.title !== "الامتحان النهائي" && lNumLive > 1 && allowedCodes.length > 0 && !isPreReqPassedLive) {
        isSubmitLocked = true;
        lockReason = "اجتز الامتحان السابق أولاً";
      }
    }

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: isDark ? "#121212" : "#F8F8F8" }}
      >
        <View style={[styles.examHeaderInline, { paddingTop: 5, paddingBottom: 8 }]}>
          <TouchableOpacity
            onPress={() => {
              if ((examModal.title === "الامتحان النهائي - المستوى الأول" || examModal.title === "الامتحان النهائي - المستوى الثاني" || examModal.title === "الامتحان النهائي") && finalExamStep > 1) {
                setFinalExamStep(finalExamStep - 1);
              } else {
                logActivity("exam_abandoned", undefined, examModal.title);
                setExamModal(null);
              }
            }}
            style={styles.backBtnSmall}
          >
            <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={22} color={isDark ? "#FFF" : "#202124"} />
          </TouchableOpacity>
          <Text style={[styles.examTitleInline, { color: isDark ? "#FFF" : "#202124" }]}>{examModal.title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          ref={examScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 15, paddingBottom: 150 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces={true}
        >
          {isLoadingExam && !examModal.questions?.length && (
            <View style={{ minHeight: 300, alignItems: "center", justifyContent: "center", gap: 14 }}>
              <ActivityIndicator size="large" color="#C8A951" />
              <Text style={{ color: isDark ? "#DDD" : "#555", fontFamily: "Cairo_600SemiBold", fontSize: 15, textAlign: "center" }}>
                جاري تجهيز أسئلة الامتحان...
              </Text>
            </View>
          )}
          {(() => {
            // تحويل الأسئلة لمصفوفة مع الاحتفاظ بالـ index الأصلي لضمان ربط الإجابات بشكل صحيح
            let qList = (examModal.questions || []).map((q, i) => ({ q, i }));

            // ترتيب خاص للمرحلة الثانية في الامتحان النهائي لتقديم الإيميل
            const isFinalExam = examModal.title === "الامتحان النهائي - المستوى الأول" || examModal.title === "الامتحان النهائي - المستوى الثاني" || examModal.title === "الامتحان النهائي";
            if (isFinalExam && finalExamStep === 2) {
              qList.sort((a, b) => {
                const tA = a.q.title.toLowerCase();
                const tB = b.q.title.toLowerCase();
                const isEmailA = tA.includes("email") || tA.includes("بريد") || tA.includes("عنوان البريد الإلكتروني");
                const isEmailB = tB.includes("email") || tB.includes("بريد") || tB.includes("عنوان البريد الإلكتروني");
                if (isEmailA && !isEmailB) return -1;
                if (!isEmailA && isEmailB) return 1;
                return 0;
              });
            }

            return qList.map(({ q, i: idx }) => {
              const isCodeField = q.title.includes("كود") || q.title.toLowerCase().includes("code");
              const isNameField = q.title === "الاسم" || q.title.includes("الاسم ثلاثي") || q.title.includes("اسم الطالب") || q.title.includes("الاسم بالكامل");
              const isPasswordField = q.title.includes("سر") || q.title.includes("باسورد") || q.title.toLowerCase().includes("password");

              const isPersonalInfoField = isNameField ||
                q.title.includes("محافظة") ||
                q.title.includes("دولة") ||
                q.title.includes("الدولة") ||
                q.title.includes("سن") ||
                q.title.includes("عمر") ||
                q.title.includes("مستوى") ||
                q.title.includes("مستواك") ||
                q.title.includes("رسالة") ||
                q.title.includes("دعم") ||
                q.title.includes("تشجيع") ||
                q.title.toLowerCase().includes("email") ||
                q.title.includes("بريد") ||
                q.title.includes("عنوان البريد الإلكتروني");

              if (isCodeField || isPersonalInfoField || isNameField || isPasswordField) {
                skippedActual++;
              }

              if (isFinalExam) {
                if (finalExamStep === 1) {
                  if (!isCodeField && !isPasswordField) return null;
                } else if (finalExamStep === 2) {
                  if (!isPersonalInfoField) return null;
                } else if (finalExamStep === 3) {
                  if (isCodeField || isPasswordField || isPersonalInfoField || isNameField) return null;
                }
              }

              let liveName = "";
              const currentVal = (currentAnswers[idx] || "").trim();
              if (isCodeField && currentVal) {
                // البحث اللحظي بناءً على القيمة المكتوبة في هذه الخانة تحديداً لضمان التحديث الفوري
                liveName = validCodesMap[currentVal] ||
                  globalCertMappings["1"]?.[currentVal]?.name ||
                  globalCertMappings["2"]?.[currentVal]?.name ||
                  (isAdminMode && currentVal.endsWith("000") ? "أهلاً بك يا معلمنا الغالي" : "");
              }

              return (
                <View key={idx} style={[styles.premiumCardInline, { backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]}>
                  <View style={[styles.qLabelRow, { flexDirection: "row", justifyContent: "space-between" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {!isCodeField && !isNameField && !isPasswordField && !isPersonalInfoField && <Text style={styles.qNumber}>#{idx - skippedActual + 1}</Text>}
                      <View style={styles.premiumQLab}>
                        <Text style={styles.premiumQLabTxt}>{isCodeField ? "التحقق" : (isNameField || isPersonalInfoField) ? "بيانات" : isPasswordField ? "أمان" : "ســــؤال"}</Text>
                      </View>
                    </View>

                    {isCodeField && liveName ? (
                      <Animated.View entering={FadeInDown} style={styles.welcomeBadge}>
                        <Text style={[styles.welcomeText, { fontFamily: "CSAvaVeni-Regular" }]}>{liveName}</Text>
                        <Feather name="check-circle" size={12} color="#4CAF50" style={{ marginLeft: 5 }} />
                      </Animated.View>
                    ) : null}
                  </View>

                  <View style={{ marginBottom: 15 }}>
                    {renderMixed(q.title, 18, isCodeField ? () => setCodeModalVisible(true) : undefined)}
                  </View>

                  {(q.type === "CHOICE" || q.type === "CHECKBOX") ? (
                    <View style={styles.choicesGrid}>
                      {q.choices.map((choice, cIdx) => {
                        const isCheckbox = q.type === "CHECKBOX";
                        const currentVal = currentAnswers[idx] || "";
                        const isSelected = isCheckbox
                          ? currentVal.split(", ").includes(choice)
                          : currentVal === choice;

                        return (
                          <TouchableOpacity
                            key={cIdx}
                            onPress={() => {
                              const n = [...currentAnswers];
                              if (isCheckbox) {
                                let selected = currentVal ? currentVal.split(", ") : [];
                                if (selected.includes(choice)) {
                                  selected = selected.filter(s => s !== choice);
                                } else {
                                  selected.push(choice);
                                }
                                n[idx] = selected.join(", ");
                              } else {
                                n[idx] = choice;
                              }
                              setCurrentAnswers(n);
                              triggerHaptic();
                            }}
                            style={[styles.choiceBtn, { borderColor: isDark ? "#444" : "#EEE", backgroundColor: isSelected ? "rgba(200,169,81,0.1)" : "transparent", flexDirection: "row" }]}
                          >
                            <View style={[isCheckbox ? styles.checkboxSquare : styles.choiceCircle, isSelected && (isCheckbox ? styles.checkboxSquareActive : styles.choiceCircleActive)]}>
                              {isSelected && (isCheckbox ? <Feather name="check" size={12} color="#FFF" /> : <View style={styles.choiceCircleInner} />)}
                            </View>
                            <View style={{ flex: 1 }}>{renderMixed(choice, 15)}</View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <TextInput
                      style={[styles.premiumInput, { marginBottom: 20, color: isDark ? "#FFF" : "#000", borderBottomColor: isDark ? "#444" : "#673AB7", textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}
                      placeholder={isCodeField ? "ضع كودك هنا..." : isPasswordField ? "الرقم السري..." : (q.title.toLowerCase().includes("email") || q.title.includes("بريد") || q.title.includes("عنوان البريد الإلكتروني")) ? "example@email.com" : "اكتب إجابتك هنا..."}
                      placeholderTextColor="#999"
                      value={currentAnswers[idx]}
                      onChangeText={(t) => {
                        const n = [...currentAnswers];
                        if (isCodeField || isPasswordField) {
                          const val = t.replace(/[^0-9]/g, "");
                          if (isCodeField) setUserEmail(val);
                          n[idx] = val;
                        } else n[idx] = t;
                        setCurrentAnswers(n);
                      }}
                      keyboardType={(isCodeField || isPasswordField) ? "numeric" : (q.title.toLowerCase().includes("email") || q.title.includes("بريد") || q.title.includes("ميل")) ? "email-address" : "default"}
                      autoCapitalize={(q.title.toLowerCase().includes("email") || q.title.includes("بريد") || q.title.includes("ميل")) ? "none" : "sentences"}
                    />
                  )}
                </View>
              );
            })
          })()}

          {(() => {
            const isFinalExam = examModal.title === "الامتحان النهائي - المستوى الأول" || examModal.title === "الامتحان النهائي - المستوى الثاني" || examModal.title === "الامتحان النهائي";
            if (isFinalExam && finalExamStep === 2) {
              return (
                <Animated.View entering={FadeInUp} style={[styles.premiumCardInline, { backgroundColor: isDark ? "#1E1E1E" : "#FFF", marginTop: 10 }]}>
                  <View style={styles.qLabelRow}>
                    <View style={styles.premiumQLab}>
                      <Text style={styles.premiumQLabTxt}>اختياري</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 17, color: isDark ? "#FFF" : "#333", textAlign: "right", marginBottom: 15 }}>
                    أضف صورتك الشخصية لو حابب تظهر في الشهادة (اختياري)
                  </Text>

                  <View style={{ alignItems: 'center', gap: 15 }}>
                    {photoUri ? (
                      <View style={{ width: '100%', alignItems: 'center' }}>
                        <Image
                          source={{ uri: photoUri }}
                          style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#C8A951' }}
                        />
                        <TouchableOpacity
                          style={{ position: 'absolute', top: -10, right: '30%', backgroundColor: '#F44336', borderRadius: 15, padding: 5 }}
                          onPress={() => { setPhotoUri(null); setPhotoBase64(null); }}
                        >
                          <Feather name="trash-2" size={16} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={pickPhoto}
                        style={{
                          width: '100%',
                          height: 100,
                          borderRadius: 15,
                          borderWidth: 2,
                          borderStyle: 'dashed',
                          borderColor: isDark ? '#444' : '#DDD',
                          justifyContent: 'center',
                          alignItems: 'center',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'
                        }}
                      >
                        {isPickingPhoto ? (
                          <ActivityIndicator color="#C8A951" />
                        ) : (
                          <>
                            <Feather name="camera" size={32} color={isDark ? "#C8A951" : "#8B0000"} />
                            <Text style={{ color: isDark ? "#AAA" : "#666", fontFamily: "Cairo_600SemiBold", marginTop: 8 }}>إضافة صورة</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </Animated.View>
              );
            }
            return null;
          })()}
        </ScrollView>
        <View style={[{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20), paddingTop: 10, backgroundColor: isDark ? "#1E1E1E" : "#FFF", borderTopWidth: 1, borderTopColor: isDark ? "#333" : "#EEE" }, isLoadingExam && !examModal.questions?.length && { display: "none" }]}>
          {(() => {
            const isFinalExam = examModal.title === "الامتحان النهائي - المستوى الأول" || examModal.title === "الامتحان النهائي - المستوى الثاني" || examModal.title === "الامتحان النهائي";
            if (isFinalExam) {
              if (finalExamStep === 1) {
                return (
                  <View style={{ gap: 0 }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => { triggerHaptic(); handleUnlockFinalExam(); }}
                      disabled={isVerifyingFinalExam}
                      style={[styles.submitBtnInline, isVerifyingFinalExam && { opacity: 0.6 }, { marginTop: 0, marginBottom: 0 }]}
                    >
                      <LinearGradient colors={isVerifyingFinalExam ? ["#555", "#333"] : ["#C8A951", "#8B6B1E"]} style={styles.submitGradInline}>
                        {isVerifyingFinalExam ? <ActivityIndicator color="#FFF" /> : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Feather name="shield" size={20} color="#FFF" />
                            <Text style={styles.submitTextInline}>تحقق</Text>
                          </View>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                    {isAdminLive && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => { triggerHaptic(); submitOfflineExam(undefined, true); }}
                        disabled={isSubmitting}
                        style={[styles.submitBtnInline, { marginTop: 10, marginBottom: 0 }]}
                      >
                        <LinearGradient colors={["#2E7D32", "#1B5E20"]} style={styles.submitGradInline}>
                          {isSubmitting ? <ActivityIndicator color="#FFF" /> : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Feather name="check-circle" size={20} color="#FFF" />
                              <Text style={styles.submitTextInline}>إرسال كمعلم (درجة كاملة فوراً)</Text>
                            </View>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              } else if (finalExamStep === 2) {
                return (
                  <View style={{ gap: 10 }}>
                    {isAdminLive && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => { triggerHaptic(); submitOfflineExam(undefined, true); }}
                        disabled={isSubmitting}
                        style={[styles.submitBtnInline, { marginTop: 0, marginBottom: 0 }]}
                      >
                        <LinearGradient colors={["#2E7D32", "#1B5E20"]} style={styles.submitGradInline}>
                          {isSubmitting ? <ActivityIndicator color="#FFF" /> : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Feather name="check-circle" size={20} color="#FFF" />
                              <Text style={styles.submitTextInline}>إرسال كمعلم (درجة كاملة)</Text>
                            </View>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => { triggerHaptic(); handleNextToExamQuestions(); }}
                      style={[styles.submitBtnInline, { marginTop: 0, marginBottom: 0 }]}
                    >
                      <LinearGradient colors={["#C8A951", "#8B6B1E"]} style={styles.submitGradInline}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="play-circle" size={20} color="#FFF" />
                          <Text style={styles.submitTextInline}>بدء الامتحان</Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                );
              } else {
                return (
                  <TouchableOpacity onPress={() => submitOfflineExam()} disabled={isSubmitting || isSubmitLocked} style={[styles.submitBtnInline, isSubmitLocked && { opacity: 0.6 }, { marginTop: 0, marginBottom: 0 }]}>
                    <LinearGradient colors={isSubmitLocked ? ["#555", "#333"] : ["#C8A951", "#8B6B1E"]} style={styles.submitGradInline}>
                      {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitTextInline}>{isSubmitLocked ? lockReason : "إنهاء وإرسال الامتحان"}</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
                );
              }
            } else {
              return (
                <View style={{ gap: 10 }}>
                  {isAdminLive && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => { triggerHaptic(); submitOfflineExam(undefined, true); }}
                      disabled={isSubmitting}
                      style={[styles.submitBtnInline, { marginTop: 0, marginBottom: 0 }]}
                    >
                      <LinearGradient colors={["#2E7D32", "#1B5E20"]} style={styles.submitGradInline}>
                        {isSubmitting ? <ActivityIndicator color="#FFF" /> : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Feather name="check-circle" size={20} color="#FFF" />
                            <Text style={styles.submitTextInline}>إرسال كمعلم (درجة كاملة)</Text>
                          </View>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => submitOfflineExam()} disabled={isSubmitting || isSubmitLocked} style={[styles.submitBtnInline, isSubmitLocked && { opacity: 0.6 }, { marginTop: 0, marginBottom: 0 }]}>
                    <LinearGradient colors={isSubmitLocked ? ["#555", "#333"] : ["#C8A951", "#8B6B1E"]} style={styles.submitGradInline}>
                      {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitTextInline}>{isSubmitLocked ? lockReason : "إنهاء وإرسال الامتحان"}</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              );
            }
          })()}
        </View>
      </KeyboardAvoidingView>
    );
  };

  const validateEmailFormat = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleAdminAutoSubmit = async (codeVal: string) => {
    if (!examModal || !examModal.questions) return;

    setIsVerifyingFinalExam(true);
    // تأخير بسيط لإعطاء إيحاء بالمعالجة
    await new Promise(resolve => setTimeout(resolve, 1000));

    const newAnswers = [...currentAnswers];
    examModal.questions.forEach((q, idx) => {
      const isCodeField = q.title.includes("كود") || q.title.toLowerCase().includes("code");
      const isPasswordField = q.title.includes("سر") || q.title.includes("باسورد") || q.title.toLowerCase().includes("password");
      const isNameField = q.title === "الاسم" || q.title.includes("الاسم ثلاثي") || q.title.includes("اسم الطالب") || q.title.includes("الاسم بالكامل");
      const isPersonalInfoField = isNameField ||
        q.title.includes("محافظة") ||
        q.title.includes("دولة") ||
        q.title.includes("الدولة") ||
        q.title.includes("سن") ||
        q.title.includes("عمر") ||
        q.title.includes("مستوى") ||
        q.title.includes("مستواك") ||
        q.title.includes("رسالة") ||
        q.title.includes("دعم") ||
        q.title.includes("تشجيع");

      if (isCodeField) {
        newAnswers[idx] = codeVal;
      } else if (isPasswordField) {
        if (!newAnswers[idx]) newAnswers[idx] = "0000";
      } else if (q.type === "CHOICE" || q.type === "CHECKBOX") {
        if (q.choices && q.choices.length > 0) {
          const randomIdx = Math.floor(Math.random() * q.choices.length);
          newAnswers[idx] = q.choices[randomIdx];
        }
      } else if (isPersonalInfoField) {
        if (isNameField) newAnswers[idx] = "معلمنا الغالي (تجربة أدمن)";
        else if (q.title.includes("محافظة")) newAnswers[idx] = "القاهرة (تجربة)";
        else if (q.title.includes("دولة")) newAnswers[idx] = "مصر (تجربة)";
        else newAnswers[idx] = "بيانات تجريبية";
      } else {
        newAnswers[idx] = "إجابة عشوائية للأدمن";
      }
    });

    setCurrentAnswers(newAnswers);
    setIsVerifyingFinalExam(false);

    // تنفيذ الإرسال فوراً بالبيانات المولدة
    await submitOfflineExam(newAnswers);
  };

  const handleNextToExamQuestions = () => {
    let allFilled = true;
    let emailError = false;

    examModal?.questions?.forEach((q, idx) => {
      const isNameField = q.title === "الاسم" || q.title.includes("الاسم ثلاثي") || q.title.includes("اسم الطالب") || q.title.includes("الاسم بالكامل");
      const isEmailField = q.title.toLowerCase().includes("email") || q.title.includes("بريد") || q.title.includes("ميل");

      const isPersonalInfoField = isNameField ||
        q.title.includes("محافظة") ||
        q.title.includes("دولة") ||
        q.title.includes("الدولة") ||
        q.title.includes("سن") ||
        q.title.includes("عمر") ||
        q.title.includes("مستوى") ||
        q.title.includes("مستواك") ||
        q.title.includes("رسالة") ||
        q.title.includes("دعم") ||
        q.title.includes("تشجيع") ||
        isEmailField;

      if (isPersonalInfoField) {
        const val = currentAnswers[idx] || "";
        if (val.trim() === "") {
          allFilled = false;
        } else if (isEmailField && !validateEmailFormat(val)) {
          emailError = true;
        }
      }
    });

    if (!allFilled) {
      setSystemAlert({ title: "تنبيه", message: "يرجى ملء جميع الحقول الشخصية للمتابعة.", type: "info" });
      return;
    }

    if (emailError) {
      setSystemAlert({ title: "خطأ في الإيميل", message: "برجاء إدخال بريد إلكتروني بصيغة صحيحة (مثال: name@email.com)", type: "error" });
      return;
    }

    setFinalExamStep(3);
  };

  const handleUnlockFinalExam = async () => {
    let codeValue = "";
    let passwordValue = "";
    examModal?.questions?.forEach((q, idx) => {
      const isCodeField = q.title.includes("كود") || q.title.toLowerCase().includes("code");
      const isPasswordField = q.title.includes("سر") || q.title.includes("باسورد") || q.title.toLowerCase().includes("password");
      if (isCodeField) codeValue = currentAnswers[idx] || "";
      if (isPasswordField) passwordValue = currentAnswers[idx] || "";
    });

    // ميزة الأدمن: لو الكود ينتهي بـ 000 يسمح بالدخول لمرحلة البيانات
    if (isAdminMode && codeValue.trim().endsWith("000")) {
      setUserEmail(codeValue.trim());
      setFinalExamStep(2);
      return;
    }

    if (!codeValue.trim() || !passwordValue.trim()) {
      setSystemAlert({ title: "تنبيه", message: "يرجى إدخال الرقم الكودي وكلمة السر.", type: "error" });
      return;
    }

    setIsVerifyingFinalExam(true);
    try {
      let creds: any = null;
      const currentLevel = examModal?.level || "1";
      const cacheKey = `@final_exam_credentials_v4_${currentLevel}`;

      // محاولة جلب البيانات من الشبكة أولاً لضمان الحداثة
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        try {
          const credRes = await fetch(`${APPS_SCRIPT_URL}?action=getFinalExamCredentials&level=${encodeURIComponent(currentLevel)}`);
          const freshCreds = await credRes.json();

          if (freshCreds && !freshCreds.error && !Array.isArray(freshCreds)) {
            creds = freshCreds;
            await AsyncStorage.setItem(cacheKey, JSON.stringify(creds));
          }
        } catch (fetchErr) {
          console.log("Fetch failed, falling back to cache if available");
        }
      }

      // إذا لم ينجح جلب البيانات من الشبكة، نحاول استخدام الكاش
      if (!creds) {
        const cachedStr = await AsyncStorage.getItem(cacheKey);
        if (cachedStr) {
          creds = JSON.parse(cachedStr);
        }
      }

      // إذا وصلنا لهنا ومافيش بيانات خالص (لا شبكة ولا كاش)
      if (!creds) {
        setSystemAlert({
          title: "تنبيه",
          message: "لا يوجد اتصال بالإنترنت ولم يتم تحميل بيانات الامتحان مسبقاً. يرجى الاتصال بالإنترنت مرة واحدة على الأقل للمزامنة.",
          type: "error"
        });
        setIsVerifyingFinalExam(false);
        return;
      }

      if (creds.error) {
        setSystemAlert({ title: "خطأ", message: creds.error, type: "error" });
        setIsVerifyingFinalExam(false);
        return;
      }

      let foundCode = false;
      let foundPassword = false;
      const inputCodeStr = codeValue.trim();
      const inputPassStr = passwordValue.trim();

      // التحقق من الكود من قائمة الأكواد
      if (Array.isArray(creds.codes)) {
        for (const k of creds.codes) {
          const kStr = String(k).trim();
          if (kStr === inputCodeStr) {
            foundCode = true;
            break;
          }
          const kNum = Number(kStr);
          const inputNum = Number(inputCodeStr);
          if (!isNaN(kNum) && !isNaN(inputNum) && kNum === inputNum) {
            foundCode = true;
            break;
          }
        }
      }

      // التحقق من كلمة السر من قائمة كلمات السر
      if (Array.isArray(creds.passwords)) {
        for (const v of creds.passwords) {
          const vStr = String(v).trim();
          if (vStr === inputPassStr) {
            foundPassword = true;
            break;
          }
          const vNum = Number(vStr);
          const inputPassNum = Number(inputPassStr);
          if (!isNaN(vNum) && !isNaN(inputPassNum) && vNum === inputPassNum) {
            foundPassword = true;
            break;
          }
        }
      }

      if (foundCode && foundPassword) {
        setFinalExamStep(2);
      } else if (!foundCode) {
        setSystemAlert({ title: "عذراً", message: "الرقم الكودي غير مصرح له أو غير موجود.", type: "error" });
      } else {
        setSystemAlert({ title: "عذراً", message: "كلمة السر غير صحيحة.", type: "error" });
      }
    } catch (e) {
      setSystemAlert({ title: "خطأ", message: "حدث خطأ أثناء التحقق.", type: "error" });
    } finally {
      setIsVerifyingFinalExam(false);
    }
  };

  const renderMainContent = () => {
    const isUserAdmin = isAdminMode && (userEmail || "").trim().endsWith("000");

    if (examModal) return renderExamContent();

    if (!selectedLevel) {
      return (
        <View style={[styles.container, { backgroundColor: isDark ? "#121212" : "#F8F8F8", paddingBottom: insets.bottom, paddingTop: 10 }]}>
          <MarqueeBanner text={config.marquee} />
          {/* تم إزالة العنوان من هنا بناءً على طلب المستخدم */}
          <ScrollView
            contentContainerStyle={[styles.centeredScroll, { paddingTop: 10, paddingBottom: 20 }]}
            bounces={false}
            overScrollMode="never"
          >
            <Animated.View entering={FadeInDown} style={{ marginBottom: 5 }}>
              <TouchableOpacity style={[styles.catBtn, { backgroundColor: isDark ? "#211F1B" : "#FFF", borderColor: isDark ? "rgba(200,169,81,0.35)" : "#E9E2D3" }]} onPress={() => { triggerHaptic(); setCodeModalVisible(true); }}>
                <Text style={[styles.catTxt, { color: isDark ? "#C8A951" : "#8B0000" }]}>الحصول على الرقم الكودي</Text>
                <Feather name="key" size={20} color={isDark ? "#C8A951" : "#8B0000"} />
              </TouchableOpacity>
            </Animated.View>

            {["1", "2"].map(lvl => {
              const levelLessons = lessons.filter(l => String(l.level) === lvl);

              // حساب الحجم الفعلي من السيرفر فقط
              const sizeRaw = levelLessons.reduce((total, lesson) => total + (lesson.sizeMB ? parseFloat(String(lesson.sizeMB)) : 0), 0);
              const isDownloading = downloadProgress[lvl]?.active;

              return (
                <Animated.View entering={FadeInDown} key={lvl} style={styles.premiumLevCard}>
                  <TouchableOpacity onPress={() => {
                    triggerHaptic();
                    setSelectedLevel(lvl);
                    AsyncStorage.setItem("@coptic/last_selected_level_v1", lvl);
                    logActivity("screen_view", undefined, `Level ${lvl}`);
                  }}>
                    <LinearGradient colors={lvl === "1" ? ["#8B0000", "#500000"] : ["#C8A951", "#8B6B1E"]} style={styles.premiumLevInner}>
                      <View style={styles.levHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <TouchableOpacity
                            onPress={() => {
                              triggerHaptic();
                              setManagingLevel(lvl);
                              calculateLevelStorage(lvl);
                            }}
                            style={{ padding: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10 }}
                          >
                            <Feather name="settings" color="#FFF" size={18} />
                          </TouchableOpacity>
                          <Text style={styles.premiumLevTitle}>{lvl === "1" ? "المستوى الأول" : "المستوى الثاني"}</Text>
                        </View>
                      </View>

                      <View style={[styles.levActionRow, { marginTop: 20 }]}>
                        <View style={styles.levSizeBox}>
                          <Feather name="hard-drive" color="#FFF" size={14} />
                          <Text style={styles.levSizeTxt}>{Math.round(sizeRaw)} MB</Text>
                        </View>

                        <TouchableOpacity
                          style={[styles.levDownloadBtn, { flex: 1, justifyContent: "center", marginLeft: 10, overflow: 'hidden' }]}
                          onPress={async () => {
                            if (isDownloading) {
                              triggerHaptic();
                              setDownloadCancelled(prev => ({ ...prev, [lvl]: true }));
                              if (activeDownloadsRef.current[lvl]) {
                                for (const d of activeDownloadsRef.current[lvl]) {
                                  await d.pauseAsync().catch(() => { });
                                }
                              }
                              setDownloadProgress(prev => ({ ...prev, [lvl]: { ...prev[lvl], active: false } }));
                              setSystemAlert({ title: "إيقاف مؤقت", message: "تم إيقاف التحميل مؤقتاً. يمكنك استكماله من نفس النقطة لاحقاً.", type: "info" });
                            } else {
                              downloadEntireLevel(lvl);
                            }
                          }}
                        >
                          {isDownloading && (
                            <View style={[styles.levProgressBar, { backgroundColor: 'rgba(200,169,81,0.4)', zIndex: 0, width: `${Math.round(((downloadProgress[lvl].current + (downloadProgress[lvl].fileProgress || 0)) / downloadProgress[lvl].total) * 100)}%` }]} />
                          )}
                          {isDownloading ? (
                            <>
                              <ActivityIndicator size="small" color="#8B0000" />
                              <Text style={[styles.levDownloadTxt, { zIndex: 2 }]}>
                                جاري التحميل {Math.round(((downloadProgress[lvl].current + (downloadProgress[lvl].fileProgress || 0)) / downloadProgress[lvl].total) * 100)}%
                              </Text>
                              <Feather name="pause-circle" color="#8B0000" size={16} style={{ zIndex: 2 }} />
                            </>
                          ) : (
                            (levelLessons.length > 0 && !levelLessons.some(l => (extractDriveId(l.videoId) && !l.localVideo) || (extractDriveId(l.oralId || "") && l.level !== "2" && l.level !== "المستوى الثاني" && !l.localOral) || (extractDriveId(l.summaryId || "") && !l.localSummary))) ? (
                              <View style={styles.levCompletedBox}>
                                {downloadProgress[lvl]?.active ? (
                                  <ActivityIndicator size="small" color="#4CAF50" />
                                ) : (
                                  <Feather name="check-circle" color="#4CAF50" size={18} />
                                )}
                                <Text style={[styles.levDownloadTxt, { color: "#4CAF50", marginLeft: 5 }]}>
                                  {downloadProgress[lvl]?.active ? "جاري التحديث صمتاً..." : "متاح أوفلاين"}
                                </Text>
                              </View>
                            ) : (
                              <>
                                <Feather name={downloadProgress[lvl]?.current > 0 ? "play-circle" : (levelLessons.some(l => l.localVideo || l.localOral || l.localSummary) ? "refresh-cw" : "download-cloud")} color="#8B0000" size={16} />
                                <Text style={styles.levDownloadTxt}>
                                  {downloadProgress[lvl]?.current > 0 && downloadProgress[lvl]?.current < downloadProgress[lvl]?.total
                                    ? "استكمال التحميل"
                                    : levelLessons.some(l => l.localVideo || l.localOral || l.localSummary)
                                      ? "هناك شيء جديد اضغط للتحديث"
                                      : "تحميل الحزمة كاملة"}
                                </Text>
                              </>
                            )
                          )}
                        </TouchableOpacity>
                      </View>


                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </ScrollView>
        </View>
      );
    }

    if (!selectedCategory) {
      const cats = Array.from(new Set(lessons.filter(l => String(l.level) === String(selectedLevel) && isLessonVisible(l)).map(l => l.category)));
      const levelTitle = selectedLevel === "1" ? "المستوى الأول" : (selectedLevel === "2" ? "المستوى الثاني" : `${t.learnCoptic.level} ${selectedLevel}`);
      return (
        <View style={[styles.container, { backgroundColor: isDark ? "#121212" : "#F8F8F8", paddingBottom: insets.bottom }]}>
          <View style={styles.header}><TouchableOpacity onPress={() => setSelectedLevel(null)}><Feather name={isRTL ? "arrow-right" : "arrow-left"} size={22} color="#C8A951" /></TouchableOpacity><Text style={[styles.headerTxt, { color: isDark ? "#C8A951" : "#8B0000" }]}>{levelTitle}</Text></View>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 20, gap: 15 }}
            bounces={false}
            overScrollMode="never"
          >
            {cats.map(cat => (
              <TouchableOpacity key={cat} style={[styles.catBtn, { backgroundColor: isDark ? "#1E1D1B" : "#FFF", borderColor: isDark ? "#3A352B" : "#E9E2D3" }]} onPress={() => { triggerHaptic(); setSelectedCategory(cat || null); }}>
                <Text style={[styles.catTxt, { color: isDark ? "#E5C76A" : "#7D1B16" }]}>{cat}</Text>
                <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={isDark ? "#C8A951" : "#8B0000"} />
              </TouchableOpacity>
            ))}


            {/* زر تعليمات الحصول على الشهادة - متاح فقط إذا كانت الخلية غير فارغة */}

            {levelInstructions[selectedLevel!] ? (
              <TouchableOpacity
                style={{ marginTop: 25, borderRadius: 15, overflow: 'hidden', elevation: 5 }}
                onPress={() => {
                  triggerHaptic();
                  setCurrentInstText(levelInstructions[selectedLevel!]);
                  setInstModalVisible(true);
                }}
              >
                <LinearGradient colors={["#C8A951", "#8B6B1E"]} style={{ paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                  <Feather name="info" size={20} color="#FFF" />
                  <Text style={{ color: "#FFF", fontFamily: "Cairo_700Bold", fontSize: 15, flex: 1, textAlign: 'center' }} numberOfLines={2}>تعليمات الحصول على الشهادة</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : null}

            {/* زر الامتحان النهائي - لمسة بريميوم */}
            {(() => {
              const allLessonsInLevel = lessons.filter(l => l.level === selectedLevel);
              // استثناء الدروس التي ليس لها امتحان أصلاً من الحساب
              const lessonsWithExams = allLessonsInLevel.filter(l => !l.hideKey?.includes("ك"));
              const lastLesson = lessonsWithExams.length > 0 ? lessonsWithExams[lessonsWithExams.length - 1] : null;
              // ✅ التعديل هنا: استخدام مفتاح مميز حسب المستوى
              const finalExamKey = `الامتحان النهائي - المستوى ${selectedLevel === "2" ? "الثاني" : "الأول"}`;
              const isFinalExamDone = submittedExams.includes(finalExamKey);
              const isAllLessonsDone = !lastLesson || submittedExams.includes(lastLesson.title);
              const isFinalAllowed = isAllLessonsDone || isFinalExamDone || unlockAllLevels || isAdminMode || isUserAdmin;

              return (
                <TouchableOpacity
                  style={{ marginTop: 15, borderRadius: 15, overflow: 'hidden', elevation: 5, opacity: isFinalAllowed ? 1 : 0.7 }}
                  onPress={() => {
                    // ✅ منع إعادة حل الامتحان النهائي
                    if (isFinalExamDone && !unlockAllLevels && !isAdminMode && !isUserAdmin) {
                      triggerHaptic();
                      const userName = validCodesMap[userEmail.trim()] || "مستخدمنا العزيز";
                      setSystemAlert({
                        title: "تم حل الامتحان مسبقاً",
                        message: `أحسنت ${userName}! لقد قمت بحل الامتحان النهائي من قبل، ولا يمكن حله مرة أخرى.\nيمكنك الحصول على شهادتك بالضغط على زر "الحصول على الشهادة".`,
                        type: "info",
                        forceLTR: true,
                        actionLabel: "تصفح الإجابة النموذجية",
                        onAction: async () => {
                          try {
                            const cached = await AsyncStorage.getItem(`@exam_review_الامتحان النهائي - المستوى ${selectedLevel === "2" ? "الثاني" : "الأول"}`);
                            if (cached) {
                              const parsed = JSON.parse(cached);
                              setExamResult({ ...parsed, level: parsed.level || selectedLevel, skipScoreModal: true });
                              setReviewModalVisible(true);
                            } else {
                              setSystemAlert({ title: "عفواً", message: "لم يتم العثور على الإجابات النموذجية لهذا الامتحان على هذا الجهاز.", type: "error" });
                            }
                          } catch (e) { }
                        }
                      });
                      return;

                    }
                    if (isFinalAllowed) {
                      triggerHaptic();
                      let examUrl = "";
                      if (selectedLevel === "1") {
                        examUrl = "https://docs.google.com/forms/d/1GMgQMa2vFvyQ50Z5fwTwAZUgjaN7vzuqQ4cMIkmAbe8/edit";
                      } else if (selectedLevel === "2") {
                        examUrl = "https://docs.google.com/forms/d/1RBY4P8_uBF9wyIf_yB3z8z8-6xceI7kbBbNkgU7Chgo/edit";
                      }

                      if (!examUrl) {
                        setSystemAlert({
                          title: "تنبيه",
                          message: selectedLevel === "2" ? "رابط امتحان المستوى الثاني سيتم إضافته قريباً." : "رابط امتحان هذا المستوى غير متوفر حالياً.",
                          type: "info"
                        });
                        return;
                      }
                      // ✅ التعديل هنا: استخدام المفتاح المميز عند فتح الامتحان
                      const mockItem = {
                        level: selectedLevel || "1",
                        title: `الامتحان النهائي - المستوى ${selectedLevel === "2" ? "الثاني" : "الأول"}`,
                        videoId: "final_exam_vid",
                        examUrl: examUrl,
                        targetSheetUrl: selectedLevel === "2"
                          ? "https://docs.google.com/spreadsheets/d/1w9bJFNZjyDf6NHl5b20fEN3Gh72vA4ZoF48sdh6FYRk/edit"
                          : "https://docs.google.com/spreadsheets/d/1V3N16W3523NQUQnLUq-a7_YPr9L-7lkHJq_AUefATcI/edit",
                        targetSheetName: selectedLevel === "2" ? "quiz4" : "Sheet1"
                      };
                      openExam(mockItem as any);
                    } else {
                      const userName = validCodesMap[userEmail.trim()] || "مستخدمنا العزيز";
                      setSystemAlert({
                        title: "الامتحان النهائي مقفل",
                        message: `عفواً ${userName}، يجب حل جميع الامتحانات الخاصة بالمستوى للدخول للامتحان النهائي.`,
                        type: "warning"
                      });
                    }
                  }}
                >
                  <LinearGradient
                    colors={
                      isFinalExamDone && !unlockAllLevels
                        ? ["#2E7D32", "#1B5E20"]   // أخضر = تم الحل مسبقاً
                        : isFinalAllowed
                          ? ["#FFD700", "#B8860B"]  // ذهبي = مسموح
                          : ["#9E9E9E", "#757575"]  // رمادي = مقفل
                    }
                    style={{ paddingVertical: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }}
                  >
                    <Feather
                      name={isFinalExamDone && !unlockAllLevels ? "check-circle" : isFinalAllowed ? "star" : "lock"}
                      size={24}
                      color="#FFF"
                    />
                    <Text style={{ fontSize: 20, fontFamily: "Cairo_700Bold", color: "#FFF" }}>
                      {isFinalExamDone && !unlockAllLevels ? "تم حل الامتحان النهائي ✓" : buttonLabel("button_final_exam", "الامتحان النهائي")}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })()}

            <TouchableOpacity
              style={{ marginTop: 15, borderRadius: 15, overflow: 'hidden', elevation: 8 }}
              onPress={() => {
                triggerHaptic();
                setCertModalVisible(true);
                setCertSearchCode("");
                setFoundCert(null);
                syncCertificateMapping(selectedLevel || "1");
              }}
            >
              <LinearGradient colors={["#1e3c72", "#2a5298"]} style={{ paddingVertical: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <Feather name="award" size={22} color="#FFF" />
                <Text style={{ fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF" }}>{buttonLabel("button_get_certificate", "الحصول على الشهادة")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={[styles.container, { backgroundColor: isDark ? "#121212" : "#F8F8F8", paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedCategory(null)}>
            <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={22} color="#C8A951" />
          </TouchableOpacity>
          <Text style={[styles.headerTxt, { color: isDark ? "#C8A951" : "#8B0000" }]}>{selectedCategory}</Text>
        </View>

        <FlatList
          data={lessons.filter(l => String(l.level) === String(selectedLevel) && l.category === selectedCategory && isLessonVisible(l))}
          renderItem={renderLessonItem}
          keyExtractor={l => l.videoId}
          contentContainerStyle={{ padding: 15 }}
          bounces={false}
          overScrollMode="never"
          ListFooterComponent={() => (
            <>

              <View style={{ height: 20 }} />
            </>
          )}
        />
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {renderMainContent()}

      {/* مودال تعليمات الحصول على الشهادة */}
      <Modal
        visible={instModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInstModalVisible(false)}
      >
        <View style={styles.premiumModalOverlay}>
          <Animated.View entering={FadeInUp} style={[styles.resultCard, { maxHeight: height * 0.8, width: width * 0.9, backgroundColor: isDark ? "#1E1E1E" : "#FFF", padding: 25 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: isDark ? "#333" : "#EEE", paddingBottom: 10 }}>
              <Text style={[styles.resultTitle, { marginBottom: 0, color: isDark ? "#C8A951" : "#8B0000", fontSize: 20 }]}>تعليمات هامة</Text>
              <TouchableOpacity onPress={() => setInstModalVisible(false)} style={{ padding: 5 }}>
                <Feather name="x" size={24} color={isDark ? "#FFF" : "#000"} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
              <View style={{
                backgroundColor: isDark ? "rgba(200,169,81,0.05)" : "rgba(139,0,0,0.02)",
                padding: 20,
                borderRadius: 15,
                width: '100%',
                borderWidth: 1,
                borderColor: isDark ? "rgba(200,169,81,0.2)" : "rgba(139,0,0,0.1)",
                alignItems: 'flex-start'
              }}>
                {renderMixed(currentInstText, 15, undefined, "left", true)}
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={() => setInstModalVisible(false)}
              style={[styles.resultDoneBtn, { marginTop: 15, width: '100%' }]}
            >
              <LinearGradient colors={["#C8A951", "#8B6B1E"]} style={[styles.resultDoneGrad, { paddingVertical: 10 }]}>
                <Text style={[styles.resultDoneText, { fontSize: 15 }]}>حسناً، فهمت</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={!!examResult && !examResult.skipScoreModal} animationType="fade" transparent>
        <View style={styles.premiumModalOverlay}>
          <Animated.View entering={FadeInDown.duration(600)} style={[styles.resultCard, { backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]}>
            <View style={[styles.resultIconCircle, examResult?.warning && { backgroundColor: "rgba(255,193,7,0.1)" }]}>
              <Feather
                name={examResult?.warning ? "alert-triangle" : (examResult?.offline ? "cloud-off" : "check-circle")}
                size={50}
                color={examResult?.warning ? "#FFC107" : "#C8A951"}
              />
            </View>
            <Text style={[styles.resultTitle, { color: examResult?.warning ? "#FFC107" : (isDark ? "#C8A951" : "#8B0000") }]}>
              {examResult?.userName ? `أهلاً يا ${examResult.userName}` : (examResult?.warning ? "تنبيه هام" : (examResult?.offline ? "محاولة ناجحة" : "تم الإرسال"))}
            </Text>
            <Text style={[styles.resultDesc, { color: isDark ? "#AAA" : "#666" }]}>
              {examResult?.message || (examResult?.warning
                ? "يجب الإجابة على جميع الأسئلة وإدخال الرقم الكودي قبل الإرسال."
                : (examResult?.offline ? "سيتم ترحيل إجاباتك للشيت فور توفر الإنترنت" : "تم تسجيل إجاباتك بنجاح في السجل الرئيسي"))}
            </Text>

            {examResult?.score && (
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreLabel}>درجتك</Text>
                <Text style={styles.scoreValue}>{examResult.score}</Text>
              </View>
            )}

            {examResult?.reviewQuestions && examResult.reviewQuestions.length > 0 && !examResult?.warning && (
              <TouchableOpacity style={[styles.resultDoneBtn, { marginBottom: 12 }]} onPress={() => { triggerHaptic(); setReviewModalVisible(true); }}>
                <LinearGradient colors={["#1e3c72", "#2a5298"]} style={styles.resultDoneGrad}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="book-open" size={18} color="#FFF" />
                    <Text style={styles.resultDoneText}>تصفح الإجابة النموذجية</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.resultDoneBtn} onPress={() => {
              if (examResult?.warning) {
                setExamResult(null);
              } else {
                setExamResult(null);
                setReviewModalVisible(false);
                setExamModal(null);
              }
            }}>
              <LinearGradient colors={examResult?.warning ? ["#FFC107", "#FFA000"] : ["#8B0000", "#500000"]} style={styles.resultDoneGrad}>
                <Text style={styles.resultDoneText}>{examResult?.warning ? "حسناً، سأكمل" : "تم"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* مودال الإجابات النموذجية */}
      <Modal visible={reviewModalVisible} animationType="slide" onRequestClose={() => setReviewModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: isDark ? "#121212" : "#F8F8F8", paddingBottom: insets.bottom }}>
        <View style={[styles.examHeaderInline, { paddingTop: 5, paddingBottom: 8 }]}>
            <TouchableOpacity onPress={() => setReviewModalVisible(false)} style={styles.backBtnSmall}>
              <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={22} color={isDark ? "#FFF" : "#202124"} />
            </TouchableOpacity>
            <Text style={[styles.examTitleInline, { color: isDark ? "#FFF" : "#202124" }]}>الإجابات النموذجية</Text>
            <TouchableOpacity onPress={downloadExamReview} disabled={isCapturing} style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
              {isCapturing ? <ActivityIndicator size="small" color="#4CAF50" /> : <Feather name="download" size={24} color={isDark ? "#C8A951" : "#4CAF50"} />}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 40 }} bounces={false} overScrollMode="never">
            <View style={{ backgroundColor: isDark ? "#1E1E1E" : "#FFF", padding: 10, borderRadius: 10 }}>
              <View style={{ marginBottom: 15 }}>
                <Text style={{ textAlign: 'center', fontSize: 18, fontFamily: 'Cairo_700Bold', color: isDark ? '#FFF' : '#222' }}>
                  {examResult?.title ? `إجابات امتحان ${examResult.title}` : 'الإجابات النموذجية'}
                </Text>
                {examResult?.level && (
                  <Text style={{ textAlign: 'center', fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: isDark ? '#AAA' : '#666', marginTop: 5 }}>
                    {examResult.level === "1" ? "المستوى الأول" : (examResult.level === "2" ? "المستوى الثاني" : `المستوى ${examResult.level}`)}
                  </Text>
                )}
              </View>
              {examResult?.score && (
                <Text style={{ textAlign: 'center', fontSize: 16, fontFamily: 'Cairo_600SemiBold', color: '#4CAF50', marginBottom: 20 }}>
                  الدرجة: {examResult.score}
                </Text>
              )}
              {examResult?.reviewQuestions?.map((q: any, idx: number) => {
                const isCodeField = q.title.includes("كود") || q.title.toLowerCase().includes("code");
                const isNameField = q.title === "الاسم" || q.title.includes("الاسم ثلاثي") || q.title.includes("اسم الطالب");

                const isPasswordField = q.title.includes("سر") || q.title.includes("باسورد") || q.title.toLowerCase().includes("password");
                const isPersonalInfoField = isNameField || q.title.includes("محافظة") || q.title.includes("دولة") || q.title.includes("سن") || q.title.includes("عمر") || q.title.includes("مستوى") || q.title.includes("مستواك") || q.title.includes("رسالة") || q.title.includes("دعم") || q.title.includes("تشجيع");
                if (isCodeField || isPasswordField || isPersonalInfoField) return null;
                const correctValue = q.correctValue ? String(q.correctValue).trim() : "";
                const userAnswer = examResult?.userAnswers?.[idx] || "";
                const isCheckbox = q.type === "CHECKBOX";
                const correctValues = correctValue ? correctValue.split(", ").map((v: string) => v.trim()) : [];
                const userValues = userAnswer ? userAnswer.split(", ").map((v: string) => v.trim()) : [];
                const isCorrect = correctValue && (isCheckbox
                  ? (correctValues.length === userValues.length && correctValues.every((v: string) => userValues.includes(v)))
                  : userAnswer.trim() === correctValue);
                return (
                  <View key={idx} style={[styles.premiumCardInline, { backgroundColor: isDark ? "#1E1E1E" : "#FFF", borderLeftWidth: 4, borderLeftColor: !correctValue ? "#999" : isCorrect ? "#4CAF50" : "#F44336" }]}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: isDark ? "#FFF" : "#333", textAlign: isRTL ? "right" : "left", marginBottom: 12 }}>{q.title}</Text>
                    {(q.type === "CHOICE" || q.type === "CHECKBOX") ? (
                      <View style={{ gap: 8 }}>
                        {q.choices?.map((choice: string, cIdx: number) => {
                          const isThisCorrect = isCheckbox ? correctValues.includes(choice) : correctValue === choice;
                          const isThisUserAnswer = isCheckbox ? userValues.includes(choice) : userAnswer === choice;
                          return (
                            <View key={cIdx} style={{
                              flexDirection: "row",
                              alignItems: "center",
                              padding: 12,
                              borderRadius: 10,
                              backgroundColor: isThisCorrect ? "rgba(76,175,80,0.15)" : (isThisUserAnswer && !isThisCorrect) ? "rgba(244,67,54,0.1)" : (isDark ? "#2A2A2A" : "#F5F5F5"),
                              borderWidth: isThisCorrect ? 1.5 : 0,
                              borderColor: isThisCorrect ? "#4CAF50" : "transparent"
                            }}>
                              <View style={{
                                width: 22, height: 22, borderRadius: isCheckbox ? 4 : 11,
                                backgroundColor: isThisCorrect ? "#4CAF50" : (isThisUserAnswer && !isThisCorrect) ? "#F44336" : (isDark ? "#444" : "#DDD"),
                                justifyContent: "center", alignItems: "center", marginRight: 10
                              }}>
                                {isThisCorrect && <Feather name="check" size={14} color="#FFF" />}
                                {isThisUserAnswer && !isThisCorrect && <Feather name="x" size={14} color="#FFF" />}
                              </View>
                              <Text style={{ flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, color: isThisCorrect ? "#4CAF50" : (isThisUserAnswer && !isThisCorrect) ? "#F44336" : (isDark ? "#CCC" : "#555"), textAlign: isRTL ? "right" : "left" }}>{choice}</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {userAnswer ? <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: isCorrect ? "#4CAF50" : "#F44336", textAlign: isRTL ? "right" : "left" }}>إجابتك: {userAnswer}</Text> : null}
                        {correctValue ? <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#4CAF50", textAlign: isRTL ? "right" : "left" }}>الإجابة الصحيحة: {correctValue}</Text> : null}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={codeModalVisible} animationType="slide" transparent onRequestClose={() => { if (!isGenerating) setCodeModalVisible(false); }}>
        <View style={styles.premiumModalOverlay}>
          <Animated.View entering={FadeInDown.duration(400)} style={[styles.resultCard, styles.codeModalCard, { width: "90%", backgroundColor: isDark ? "#1E1E1E" : "#FFF", borderColor: isDark ? "#403828" : "#E8DFC9" }]}>

            <View style={[styles.codeModalIcon, { backgroundColor: isDark ? "rgba(200,169,81,0.14)" : "rgba(139,0,0,0.07)" }]}>
              <Feather name={generatedCode ? "check-circle" : "key"} size={24} color={isDark ? "#D6B75E" : "#8B0000"} />
            </View>
            <Text style={[styles.resultTitle, styles.codeModalTitle, { color: isDark ? "#FFF" : "#222", marginBottom: 20, textAlign: "center" }]}>
              {generatedCode ? "رقمك الكودي الخاص" : "الحصول على الرقم الكودي"}
            </Text>

            {generatedCode ? (
              <View style={{ alignItems: "center", width: "100%" }}>
                <Text style={[styles.resultDesc, { color: isDark ? "#AAA" : "#666", textAlign: isRTL ? "right" : "left" }]}>
                  يرجى الاحتفاظ بهذا الرقم أو تصوير الشاشة، فهو مطلوب في جميع امتحانات الدروس.
                </Text>
                <View style={[styles.scoreContainer, styles.codeModalValueCard, { backgroundColor: isDark ? "rgba(76,175,80,0.10)" : "#F2FAF3", borderColor: isDark ? "rgba(76,175,80,0.28)" : "#D8EEDB", width: "100%", paddingVertical: 20 }]}>
                  <Text style={[styles.scoreValue, { color: "#4CAF50", fontSize: 36, letterSpacing: 3 }]}>{generatedCode}</Text>
                </View>
                <TouchableOpacity style={[styles.resultDoneBtn, { marginTop: 10 }]} onPress={async () => {
                  if (generatedCode) {
                    triggerSuccessHaptic();
                    await Clipboard.setStringAsync(generatedCode);
                    setSystemAlert({ title: "تم النسخ", message: "تم نسخ الرقم الكودي بنجاح.", type: "success" });
                  }
                  setCodeModalVisible(false);
                  setGeneratedCode(null);
                  setStudentName("");
                  setStudentPhone("");
                }}>
                  <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.resultDoneGrad}>
                    <Text style={styles.resultDoneText}>نسخ الرقم</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ width: "100%" }}>
                <Text style={[styles.codeModalLabel, { color: isDark ? "#FFF" : "#222", textAlign: isRTL ? "left" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}>الاسم ثلاثي</Text>
                <TextInput
                  style={[styles.premiumInput, styles.codeModalInput, { marginBottom: 20, color: isDark ? "#FFF" : "#000", backgroundColor: isDark ? "#272522" : "#FAF8F4", borderColor: isDark ? "#51452C" : "#E5DAC0", textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}
                  placeholder="اكتب اسمك الثلاثي هنا..."
                  placeholderTextColor="#999"
                  value={studentName}
                  onChangeText={setStudentName}
                />

                <Text style={[styles.codeModalLabel, { color: isDark ? "#FFF" : "#222", textAlign: isRTL ? "left" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}>رقم الموبايل</Text>
                <TextInput
                  style={[styles.premiumInput, styles.codeModalInput, { marginBottom: 26, color: isDark ? "#FFF" : "#000", backgroundColor: isDark ? "#272522" : "#FAF8F4", borderColor: isDark ? "#51452C" : "#E5DAC0", textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}
                  placeholder="أدخل رقم الموبايل..."
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  value={studentPhone}
                  onChangeText={setStudentPhone}
                />

                <TouchableOpacity style={[styles.resultDoneBtn, (!isCodeFormValid || isGenerating) && { opacity: 0.6 }]} onPress={generateNewCode} disabled={!isCodeFormValid || isGenerating}>
                  <LinearGradient colors={(!isCodeFormValid || isGenerating) ? ["#555", "#333"] : ["#8B0000", "#570A0A"]} style={styles.resultDoneGrad}>
                    {isGenerating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.resultDoneText}>الحصول على الرقم</Text>}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.codeModalCancel, { borderColor: isDark ? "#4A4438" : "#E8E1D5" }]} onPress={() => setCodeModalVisible(false)} disabled={isGenerating}>
                  <Text style={[styles.codeModalCancelText, { color: isDark ? "#D6D0C4" : "#6D665A" }]}>إلغاء</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>



      {/* مودال إدارة محتوى المستوى (الحل الجذري الاحترافي) */}
      <Modal visible={!!managingLevel} transparent animationType="slide" onRequestClose={() => setManagingLevel(null)}>
        <View style={styles.premiumModalOverlay}>
          <Animated.View entering={FadeInDown} style={[styles.resultCard, { width: "90%", backgroundColor: isDark ? "#1E1E1E" : "#FFF", padding: 25 }]}>
            <View style={[styles.resultIconCircle, { backgroundColor: isDark ? "rgba(200,169,81,0.1)" : "rgba(139,0,0,0.05)", marginBottom: 15 }]}>
              <Feather name="package" size={45} color={isDark ? "#C8A951" : "#8B0000"} />
            </View>

            <Text style={[styles.resultTitle, { color: isDark ? "#FFF" : "#222", marginBottom: 5 }]}>إدارة محتوى المستوى</Text>
            <Text style={{ color: isDark ? "#C8A951" : "#8B0000", fontFamily: "Cairo_700Bold", fontSize: 16, marginBottom: 20 }}>
              {managingLevel === "1" ? "المستوى الأول" : "المستوى الثاني"}
            </Text>

            <View style={{ width: '100%', gap: 12, marginBottom: 25 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", borderRadius: 12 }}>
                <Text style={{ color: isDark ? "#AAA" : "#666", fontFamily: "Cairo_400Regular" }}>المساحة المشغولة:</Text>
                <Text style={{ color: isDark ? "#FFF" : "#222", fontFamily: "Cairo_700Bold" }}>{levelStats ? `${levelStats.size.toFixed(1)} MB` : "جاري الفحص..."}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", borderRadius: 12 }}>
                <Text style={{ color: isDark ? "#AAA" : "#666", fontFamily: "Cairo_400Regular" }}>الدروس المحملة:</Text>
                <Text style={{ color: "#4CAF50", fontFamily: "Cairo_700Bold" }}>{levelStats ? `${levelStats.files} / ${levelStats.totalNeeded}` : "..."}</Text>
              </View>
              {levelStats && levelStats.corrupted > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: "rgba(244,67,54,0.1)", borderRadius: 12 }}>
                  <Text style={{ color: "#F44336", fontFamily: "Cairo_700Bold" }}>ملفات تالفة مكتشفة:</Text>
                  <Text style={{ color: "#F44336", fontFamily: "Cairo_700Bold" }}>{levelStats.corrupted}</Text>
                </View>
              )}
            </View>

            <View style={{ width: '100%', gap: 12 }}>
              <TouchableOpacity
                style={[styles.resultDoneBtn, isRepairing && { opacity: 0.6 }]}
                disabled={isRepairing}
                onPress={() => managingLevel && repairLevel(managingLevel)}
              >
                <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.resultDoneGrad}>
                  {isRepairing ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="refresh-cw" size={18} color="#FFF" />
                      <Text style={styles.resultDoneText}>فحص وإصلاح المحتوى</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {isAdminMode && (
                <TouchableOpacity style={styles.resultDoneBtn} onPress={() => managingLevel && wipeLevel(managingLevel)}>
                  <LinearGradient colors={["#F44336", "#C62828"]} style={styles.resultDoneGrad}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="trash-2" size={18} color="#FFF" />
                      <Text style={styles.resultDoneText}>حذف الحزمة بالكامل</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              {/* زر تصفير الامتحانات للتجربة */}
              {isAdminMode && (
                <TouchableOpacity style={styles.resultDoneBtn} onPress={() => managingLevel && resetExamsProgress(managingLevel)}>
                  <LinearGradient colors={["#607D8B", "#455A64"]} style={styles.resultDoneGrad}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="rotate-ccw" size={18} color="#FFF" />
                      <Text style={styles.resultDoneText}>تصفير تقدم الامتحانات (لالتجربة)</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              {isAdminMode && (
                <TouchableOpacity style={[styles.resultDoneBtn, { marginTop: 10 }]} onPress={clearUserCode}>
                  <LinearGradient colors={["#FF5722", "#E64A19"]} style={styles.resultDoneGrad}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="user-x" size={18} color="#FFF" />
                      <Text style={styles.resultDoneText}>مسح الرقم الكودي المسجل</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={{ marginTop: 10, alignItems: 'center' }} onPress={() => setManagingLevel(null)}>
                <Text style={{ color: "#999", fontFamily: "Cairo_700Bold", fontSize: 16 }}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* اشعارات النظام الاحترافية (بديل Alert) */}
      <Modal visible={!!systemAlert} animationType="fade" transparent onRequestClose={() => setSystemAlert(null)}>
        <View style={{ flex: 1 }}>
          <View style={styles.premiumModalOverlay}>
            <Animated.View entering={systemAlert?.type === 'warning' ? SlideInLeft.duration(400) : FadeInDown.duration(400)} style={[styles.resultCard, { backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]}>
              <View style={[styles.resultIconCircle, { backgroundColor: systemAlert?.type === "success" ? "rgba(76,175,80,0.1)" : (systemAlert?.type === "error" ? "rgba(244,67,54,0.1)" : (systemAlert?.type === "warning" ? "rgba(255,152,0,0.1)" : "rgba(33,150,243,0.1)")) }]}>
                <Feather
                  name={systemAlert?.type === "success" ? "check-circle" : (systemAlert?.type === "error" ? "wifi-off" : (systemAlert?.type === "warning" ? "alert-triangle" : "info"))}
                  size={50}
                  color={systemAlert?.type === "success" ? "#4CAF50" : (systemAlert?.type === "error" ? "#F44336" : (systemAlert?.type === "warning" ? "#FF9800" : "#2196F3"))}
                />
              </View>
              <Text style={[styles.resultTitle, { color: systemAlert?.type === "success" ? "#4CAF50" : (systemAlert?.type === "error" ? "#F44336" : (systemAlert?.type === "warning" ? "#FF9800" : (isDark ? "#FFF" : "#222"))), textAlign: isRTL ? "right" : "left" }]}>
                {systemAlert?.title}
              </Text>
              <Text style={[
                styles.resultDesc,
                {
                  color: isDark ? "#AAA" : "#666",
                  textAlign: systemAlert?.forceLTR ? "left" : (systemAlert?.type === 'warning' ? "left" : (isRTL ? "right" : "left")),
                  writingDirection: systemAlert?.forceLTR ? "ltr" : (systemAlert?.type === 'warning' ? "ltr" : "auto")
                }
              ]}>
                {systemAlert?.message}
              </Text>
              <View style={{ flexDirection: "row", gap: 12, width: "100%", marginTop: 15 }}>
                {systemAlert?.actionLabel && (
                  <TouchableOpacity
                    style={{ flex: 1, borderRadius: 14, overflow: "hidden" }}
                    onPress={() => { triggerHaptic(); systemAlert.onAction?.(); setSystemAlert(null); }}
                  >
                    <LinearGradient
                      colors={isDark ? ["#444", "#222"] : ["#F5F5F5", "#E0E0E0"]}
                      style={{ height: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        allowFontScaling={false}
                        maxFontSizeMultiplier={1}
                        style={{ color: isDark ? "#FFF" : "#333", fontSize: 13, fontFamily: "Cairo_700Bold", textAlign: 'center' }}
                      >
                        {systemAlert.actionLabel}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{ flex: systemAlert?.actionLabel ? 1 : undefined, width: systemAlert?.actionLabel ? undefined : "100%", borderRadius: 14, overflow: "hidden" }}
                  onPress={() => { triggerHaptic(); setSystemAlert(null); }}
                >
                  <LinearGradient
                    colors={systemAlert?.type === "success" ? ["#4CAF50", "#2E7D32"] : (systemAlert?.type === "error" ? ["#F44336", "#C62828"] : (systemAlert?.type === "warning" ? ["#FF9800", "#F57C00"] : ["#2196F3", "#1565C0"]))}
                    style={{ height: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1}
                      style={{ color: "#FFF", fontSize: 13, fontFamily: "Cairo_700Bold", textAlign: 'center' }}
                    >
                      {t.notification.ok}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>

          {/* تأثير الكونفيتي كابن مباشر للمودال لضمان ظهوره فوق كل شيء */}
          {showConfetti && (
            <View style={[StyleSheet.absoluteFill, { zIndex: 99999, elevation: 2000 }]} pointerEvents="none">
              {confettiAnims.map((anim, i) => {
                const colors = ["#FFD700", "#FF6B6B", "#4CAF50", "#2196F3", "#FF9800", "#E91E63", "#9C27B0", "#00BCD4", "#C8A951", "#8B0000"];
                const color = colors[i % colors.length];
                const size = 8 + Math.random() * 8;
                const spin = anim.rotate.interpolate({ inputRange: [0, 10], outputRange: ['0deg', '360deg'] });
                return (
                  <RNAnimated.View
                    key={`conf_alert_${i}`}
                    style={{
                      position: 'absolute',
                      width: size,
                      height: size * 0.6,
                      backgroundColor: color,
                      borderRadius: 2,
                      transform: [{ translateX: anim.x }, { translateY: anim.y }, { rotate: spin }],
                      opacity: anim.opacity,
                      zIndex: 99999,
                      elevation: 2000,
                    }}
                  />
                );
              })}
            </View>
          )}
        </View>
      </Modal>

      {/* قاموس حروف الدرس للمستوى الأول */}
      <Modal visible={!!lessonGlossary} animationType="slide" onRequestClose={closeLessonGlossary}>
        <View style={[styles.learningModalBg, { backgroundColor: isDark ? "#121212" : "#F8F8F8", paddingBottom: insets.bottom }]}>
          <View style={styles.learningModalHeader}>
            <Text style={[styles.learningModalTitle, { color: isDark ? "#E5C76A" : "#8B0000", textAlign: "right", marginRight: 0 }]} numberOfLines={1}>
              قاموس كلمات الدرس {LESSON_ORDINAL_ARABIC[lessonGlossary?.lessonNumber ?? 1]}
            </Text>
            <TouchableOpacity style={styles.learningModalClose} onPress={closeLessonGlossary} accessibilityLabel="إغلاق قاموس الدرس">
              <Feather name="x" size={25} color={isDark ? "#E5C76A" : "#8B0000"} />
            </TouchableOpacity>
          </View>

          <View style={[styles.lessonGlossaryLetters, { backgroundColor: isDark ? "#1E1D1B" : "#FFF", borderColor: isDark ? "#3A352B" : "#E9E2D3" }]}>
            <Text style={[styles.lessonGlossaryLessonTitle, { color: isDark ? "#E5C76A" : "#8B0000" }]}>{lessonGlossary?.lessonTitle}</Text>
            <Text style={[styles.lessonGlossaryLettersLabel, { color: isDark ? "#AAA" : "#666" }]}>حروف الدرس</Text>
            <Text style={[styles.lessonGlossaryLettersText, { color: isDark ? "#E5C76A" : "#8B0000" }]}>
              {lessonGlossary?.letters.join("   ")}
            </Text>
            <Text style={[styles.lessonGlossaryCount, { color: isDark ? "#AAA" : "#777" }]}>
              {lessonGlossary?.loading ? "جاري تجهيز الكلمات..." : `${lessonGlossary?.words.length ?? 0} كلمة`}
            </Text>
          </View>

          {lessonGlossary?.loading ? (
            <View style={styles.lessonGlossaryLoading}>
              <ActivityIndicator size="large" color={isDark ? "#E5C76A" : "#8B0000"} />
              <Text style={[styles.lessonGlossaryEmptyText, { color: isDark ? "#BBB" : "#666" }]}>جارٍ إعداد قاموس الدرس...</Text>
            </View>
          ) : lessonGlossary?.error ? (
            <View style={styles.lessonGlossaryLoading}>
              <Feather name="wifi-off" size={34} color={isDark ? "#E5C76A" : "#8B0000"} />
              <Text style={[styles.lessonGlossaryEmptyText, { color: isDark ? "#BBB" : "#666" }]}>{lessonGlossary.error}</Text>
              <TouchableOpacity
                style={styles.lessonGlossaryRetryButton}
                activeOpacity={0.85}
                onPress={() => {
                  const lesson = lessons.find((item) => item.title === lessonGlossary.lessonTitle && (item.level === "1" || item.level === "المستوى الأول"));
                  if (lesson) void openLessonGlossary(lesson, lessonGlossary.lessonNumber);
                }}
              >
                <Feather name="refresh-cw" size={17} color="#FFF" />
                <Text style={styles.lessonGlossaryRetryText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={lessonGlossary?.words ?? []}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.lessonGlossaryList}
              initialNumToRender={18}
              maxToRenderPerBatch={24}
              windowSize={7}
              ListEmptyComponent={(
                <Text style={[styles.lessonGlossaryEmptyText, { color: isDark ? "#BBB" : "#666" }]}>
                  لم تُعثر على كلمات تتكوّن من حروف هذا الدرس في القاموس.
                </Text>
              )}
              renderItem={({ item: word, index }) => (
                <WordCard
                  entry={word.entry}
                  index={index}
                  query={word.coptic}
                  displayMeaning={word.arabic}
                  compactResult
                  wholeCopticWord
                  onPress={() => setSelectedGlossaryWord(word)}
                />
              )}
            />
          )}
        </View>
      </Modal>
      {selectedGlossaryWord ? (
        <WordDetailModal
          entry={selectedGlossaryWord.entry}
          searchTerm={selectedGlossaryWord.coptic}
          displayMeaning={selectedGlossaryWord.arabic}
          onClose={() => setSelectedGlossaryWord(null)}
        />
      ) : null}

      {/* عرض الشفوي / التدريب */}
      <Modal visible={!!viewingOral} transparent animationType="fade" onRequestClose={() => setViewingOral(null)}>
        <View style={[styles.learningModalBg, { backgroundColor: isDark ? "#121212" : "#FFF", paddingBottom: insets.bottom }]}>
          <View style={styles.learningModalHeader}>
            <View style={{ flexDirection: "row", gap: 15 }}>
              {(viewingOral?.level === "2" || viewingOral?.level === "المستوى الثاني") ? (
                <TouchableOpacity onPress={() => {
                  if (viewingOral?.oralId) {
                    Clipboard.setStringAsync(viewingOral.oralId);
                    setSystemAlert({ title: "تم النسخ", message: "تم نسخ نص التدريب بنجاح.", type: "success" });
                  }
                }}>
                  <Feather name="copy" size={24} color={isDark ? "#C8A951" : "#4CAF50"} />
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity onPress={() => viewingOral && exportImageToGallery(viewingOral)}>
                    <Feather name="download" size={24} color={isDark ? "#C8A951" : "#4CAF50"} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => viewingOral && viewingOral.localOral && shareMedia(viewingOral.localOral, viewingOral)}>
                    <Feather name="share-2" size={24} color={isDark ? "#C8A951" : "#2196F3"} />
                  </TouchableOpacity>
                </>
              )}
            </View>
            <Text style={[styles.learningModalTitle, { color: isDark ? "#FFF" : "#222" }]} numberOfLines={1}>
              {(viewingOral?.level === "2" || viewingOral?.level === "المستوى الثاني") ? "التدريب" : "الشفوي"}: {viewingOral?.title}
            </Text>
            <TouchableOpacity style={styles.learningModalClose} onPress={() => setViewingOral(null)}>
              <Feather name="x" size={28} color={isDark ? "#FFF" : "#000"} />
            </TouchableOpacity>
          </View>

          <View style={styles.mediaContainer} ref={oralViewRef} collapsable={false}>
            {viewingOral && (() => {
              const isL2 = viewingOral.level === "2" || viewingOral.level === "المستوى الثاني";
              const studentNameForMsg = validCodesMap[userEmail] || "غير معروف";
              const codeDisplay = userEmail || "لا يوجد";

              let trainingNum = "غير معروف";
              let filteredText = "";

              if (isL2) {
                const lines = (viewingOral.oralId || "").split("\n").filter(l => l.trim() !== "");
                trainingNum = lines.length > 0 ? lines[0].replace(/[*-]/g, "").trim() : "غير معروف";
                filteredText = (viewingOral.oralId || "")
                  .split("\n")
                  .filter(l => !l.includes("تُرسل إجابة") && !l.includes("t.me/") && !l.includes("wa.me/"))
                  .join("\n")
                  .trim();
              } else {
                trainingNum = viewingOral.title;
              }

              const handleWhatsApp = () => {
                const levelTxt = viewingOral.level.includes("المستوى") ? viewingOral.level : `المستوى ${viewingOral.level}`;

                // التنسيق المطلوب:
                // في المستوى الأول: شفوي: [العنوان]
                // في المستوى الثاني: التدريب [رقم التدريب] (الاسم موجود بالفعل في أول سطر)
                const activityTxt = isL2 ? trainingNum : `شفوي: ${trainingNum}`;

                const msg = `${levelTxt}\n${activityTxt}\nالاسم: ${studentNameForMsg}\nالرقم الكودي للمشترك: ${codeDisplay}`;
                const url = `https://wa.me/201207829388?text=${encodeURIComponent(msg)}`;
                Linking.openURL(url).catch(() => {
                  setSystemAlert({ title: "خطأ", message: "تعذر فتح واتساب. تأكد من تثبيت التطبيق.", type: "error" });
                });
              };

              const WhatsAppBtn = (
                <View style={{ marginTop: 25, borderTopWidth: 1, borderTopColor: isDark ? "#333" : "#EEE", paddingTop: 20, width: '100%' }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: "#25D366",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 12,
                      borderRadius: 15,
                      gap: 10
                    }}
                    onPress={() => { triggerHaptic(); handleWhatsApp(); }}
                  >
                    <Feather name="message-circle" size={20} color="#FFF" />
                    <Text style={{ color: "#FFF", fontFamily: "Cairo_700Bold", fontSize: 16 }}>إرسال الإجابة عبر واتساب</Text>
                  </TouchableOpacity>
                  <Text style={{ color: isDark ? "#888" : "#999", fontSize: 11, fontFamily: "Cairo_400Regular", textAlign: "center", marginTop: 8 }}>
                    سيتم الرد عليك خلال أسبوع من الإرسال
                  </Text>
                </View>
              );

              if (isL2) {
                return (
                  <View style={{ flex: 1, width: '100%', padding: 15 }}>
                    <Animated.View entering={FadeInUp.duration(600)} style={{
                      flex: 1,
                      backgroundColor: isDark ? "#1E1E1E" : "#FFF",
                      borderRadius: 30,
                      borderWidth: 1.5,
                      borderColor: isDark ? "rgba(200,169,81,0.3)" : "rgba(139,0,0,0.15)",
                      overflow: 'hidden',
                      elevation: 12,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 10 },
                      shadowOpacity: 0.3,
                      shadowRadius: 20,
                    }}>
                      <View style={{ backgroundColor: isDark ? "#2A2A2A" : "#F9F9F9", paddingVertical: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: isDark ? "#333" : "#EEE" }}>
                        <Text style={{ color: isDark ? "#C8A951" : "#8B0000", fontFamily: "Cairo_700Bold", fontSize: 13 }}>نص التدريب</Text>
                      </View>

                      <ScrollView
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 15 }}
                        style={{ flex: 1 }}
                      >
                        <View style={{ minHeight: 50 }}>
                          {renderMixed(filteredText, 18, undefined, "center")}
                        </View>
                      </ScrollView>

                      <View style={{
                        padding: 15,
                        backgroundColor: isDark ? "#252525" : "#F5F5F5",
                        borderTopWidth: 1,
                        borderTopColor: isDark ? "#333" : "#EEE"
                      }}>
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#25D366",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingVertical: 15,
                            borderRadius: 18,
                            gap: 12,
                            elevation: 4,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.2,
                            shadowRadius: 8
                          }}
                          onPress={() => { triggerHaptic(); handleWhatsApp(); }}
                        >
                          <Feather name="message-circle" size={24} color="#FFF" />
                          <Text style={{ color: "#FFF", fontFamily: "Cairo_700Bold", fontSize: 18 }}>إرسال الإجابة الآن</Text>
                        </TouchableOpacity>
                        <Text style={{ color: isDark ? "#888" : "#999", fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "center", marginTop: 10 }}>
                          سيتم الرد عليك خلال أسبوع من الإرسال
                        </Text>
                      </View>
                    </Animated.View>
                  </View>
                );
              } else {
                return (
                  <View style={{ flex: 1, width: '100%', padding: 15 }}>
                    <Animated.View entering={FadeInUp.duration(600)} style={{
                      flex: 1,
                      backgroundColor: isDark ? "#1E1E1E" : "#FFF",
                      borderRadius: 30,
                      borderWidth: 1.5,
                      borderColor: isDark ? "rgba(200,169,81,0.3)" : "rgba(139,0,0,0.15)",
                      overflow: 'hidden',
                      elevation: 12,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 10 },
                      shadowOpacity: 0.3,
                      shadowRadius: 20,
                    }}>
                      <View style={{ backgroundColor: isDark ? "#2A2A2A" : "#F9F9F9", paddingVertical: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: isDark ? "#333" : "#EEE" }}>
                        <Text style={{ color: isDark ? "#C8A951" : "#8B0000", fontFamily: "Cairo_700Bold", fontSize: 14 }}>صورة الشفوي</Text>
                      </View>

                      <ScrollView
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }}
                        style={{ flex: 1 }}
                      >
                        <View style={{ alignItems: 'center' }}>
                          <Image
                            source={viewingOral.localOral ? { uri: viewingOral.localOral.startsWith("file://") ? viewingOral.localOral : `file://${viewingOral.localOral}` } : { uri: `https://lh3.googleusercontent.com/d/${extractDriveId(viewingOral.oralId || "")}=w1000` }}
                            style={[styles.mediaContent, { height: height * 0.45, width: width - 80, borderRadius: 20 }]}
                            resizeMode="contain"
                          />
                        </View>
                      </ScrollView>

                      <View style={{
                        padding: 20,
                        backgroundColor: isDark ? "#252525" : "#F5F5F5",
                        borderTopWidth: 1,
                        borderTopColor: isDark ? "#333" : "#EEE"
                      }}>
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#25D366",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingVertical: 15,
                            borderRadius: 18,
                            gap: 12,
                            elevation: 4,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.2,
                            shadowRadius: 8
                          }}
                          onPress={() => { triggerHaptic(); handleWhatsApp(); }}
                        >
                          <Feather name="message-circle" size={24} color="#FFF" />
                          <Text style={{ color: "#FFF", fontFamily: "Cairo_700Bold", fontSize: 18 }}>إرسال الإجابة الآن</Text>
                        </TouchableOpacity>
                        <Text style={{ color: isDark ? "#888" : "#999", fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "center", marginTop: 10 }}>
                          سيتم الرد عليك خلال أسبوع من الإرسال
                        </Text>
                      </View>
                    </Animated.View>
                  </View>
                );
              }
            })()}
          </View>
        </View>
      </Modal>

      {/* عرض الملخص */}
      <Modal visible={!!viewingSummary} transparent animationType="fade" onRequestClose={() => setViewingSummary(null)}>
        <View style={[styles.learningModalBg, { backgroundColor: isDark ? "#121212" : "#FFF", paddingBottom: insets.bottom }]}>
          <View style={styles.learningModalHeader}>
            <View style={{ flexDirection: "row", gap: 15 }}>
              <TouchableOpacity onPress={() => viewingSummary && exportImageToGallery(viewingSummary, true)}>
                <Feather name="download" size={24} color={isDark ? "#C8A951" : "#4CAF50"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => viewingSummary && viewingSummary.localSummary && shareMedia(viewingSummary.localSummary, viewingSummary)}>
                <Feather name="share-2" size={24} color={isDark ? "#C8A951" : "#2196F3"} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.learningModalTitle, { color: isDark ? "#FFF" : "#222" }]} numberOfLines={1}>ملخص: {viewingSummary?.title}</Text>
            <TouchableOpacity style={styles.learningModalClose} onPress={() => setViewingSummary(null)}>
              <Feather name="x" size={28} color={isDark ? "#FFF" : "#000"} />
            </TouchableOpacity>
          </View>
          <View style={styles.mediaContainer} collapsable={false}>
            {viewingSummary && (
              <Image
                source={viewingSummary.localSummary ? { uri: viewingSummary.localSummary.startsWith("file://") ? viewingSummary.localSummary : `file://${viewingSummary.localSummary}` } : { uri: `https://lh3.googleusercontent.com/d/${viewingSummary.summaryId}=w1000` }}
                style={styles.mediaContent}
                resizeMode="contain"
              />
            )}
          </View>
        </View>
      </Modal>

      {/* مودال استخراج الشهادة */}
      <Modal visible={certModalVisible} animationType="slide" transparent onRequestClose={() => setCertModalVisible(false)}>
        <View style={{ flex: 1 }}>
          <View style={styles.premiumModalOverlay}>
            <Animated.View entering={FadeInDown.duration(400)} style={[styles.resultCard, { width: "90%", backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]}>



              <View style={{ width: "100%" }}>
                <Text style={{ fontFamily: "Cairo_700Bold", color: isDark ? "#FFF" : "#222", marginBottom: 5, textAlign: isRTL ? "left" : "left", writingDirection: isRTL ? "rtl" : "ltr", width: "100%" }}>أدخل الرقم الكودي</Text>
                <TextInput
                  style={[styles.premiumInput, { marginBottom: 20, color: isDark ? "#FFF" : "#000", borderBottomColor: isDark ? "#444" : "#C8A951", textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}
                  placeholder="رقمك الكودي هنا..."
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  value={certSearchCode}
                  onChangeText={(t) => {
                    certSearchIdRef.current++; // إلغاء أي بحث قديم جاري فوراً
                    setCertSearchCode(t);
                    setFoundCert(null);
                  }}
                />

                <TouchableOpacity
                  style={[styles.resultDoneBtn, !certSearchCode.trim() && { opacity: 0.6 }]}
                  onPress={() => handleSearchCertificate()}
                  onLongPress={() => handleSearchCertificate(true)} // الضغط المطول يجبر النظام على تحديث البيانات من السيرفر
                  disabled={!certSearchCode.trim()}
                >
                  <LinearGradient colors={["#C8A951", "#8B6B1E"]} style={styles.resultDoneGrad}>
                    <Text style={styles.resultDoneText}>الحصول على الشهادة</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {foundCert && !isSearchingCert && (
                  <Animated.View key={`res_${certSearchCode}`} entering={FadeInUp} style={{ marginTop: 25, alignItems: 'center', width: '100%' }}>


                    {foundCert.statusMessage ? (
                      <View style={{
                        backgroundColor: isDark ? "rgba(244,67,54,0.1)" : "rgba(244,67,54,0.05)",
                        padding: 18,
                        borderRadius: 15,
                        marginBottom: 15,
                        width: '100%',
                        borderWidth: 1,
                        borderColor: isDark ? "rgba(244,67,54,0.3)" : "rgba(244,67,54,0.2)"
                      }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#F44336", textAlign: "center", lineHeight: 28 }}>
                          {foundCert.statusMessage}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <View style={{
                          width: '100%',
                          aspectRatio: 16 / 9,
                          borderRadius: 12,
                          overflow: 'hidden',
                          marginBottom: 20,
                          borderWidth: 2,
                          borderColor: '#C8A951',
                          backgroundColor: isDark ? '#2A2A2A' : '#F9F9F9',
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}>
                          {isSearchingCert && (
                            <ActivityIndicator size="large" color="#C8A951" style={{ position: 'absolute' }} />
                          )}
                          <TouchableOpacity
                            style={{ width: '100%', height: '100%' }}
                            activeOpacity={0.8}
                            onLongPress={() => foundCert.url && WebBrowser.openBrowserAsync(foundCert.url)}
                          >
                            <Image
                              source={{ uri: foundCert.localImgPath ? (foundCert.localImgPath.startsWith('file://') ? foundCert.localImgPath : `file://${foundCert.localImgPath}`) : `https://docs.google.com/presentation/d/${foundCert.id}/export/png?size=1000` }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="stretch"
                              onLoadStart={() => setIsSearchingCert(true)}
                              onLoadEnd={() => setIsSearchingCert(false)}
                              onError={() => {
                                setIsSearchingCert(false);
                              }}
                            />
                            {!foundCert.localImgPath && !isSearchingCert && (
                              <ActivityIndicator size="small" color="#C8A951" style={{ position: 'absolute' }} />
                            )}
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.resultDoneBtn} onPress={downloadCertificate} disabled={isDownloadingCert}>
                          <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.resultDoneGrad}>
                            {isDownloadingCert ? <ActivityIndicator color="#FFF" /> : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Feather name={foundCert.localImgPath ? "image" : "download"} size={20} color="#FFF" />
                                <Text style={styles.resultDoneText}>حفظ الشهادة كصورة</Text>
                              </View>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </>
                    )}
                  </Animated.View>
                )}

                <TouchableOpacity style={{ marginTop: 15, alignItems: "center" }} onPress={() => { setCertModalVisible(false); setFoundCert(null); }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", color: "#999", fontSize: 16 }}>إغلاق</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>

          {/* تأثير الكونفيتي كابن مباشر للمودال لضمان ظهوره فوق كل شيء */}
          {showConfetti && (
            <View style={[StyleSheet.absoluteFill, { zIndex: 99999, elevation: 2000 }]} pointerEvents="none">
              {confettiAnims.map((anim, i) => {
                const colors = ["#FFD700", "#FF6B6B", "#4CAF50", "#2196F3", "#FF9800", "#E91E63", "#9C27B0", "#00BCD4", "#C8A951", "#8B0000"];
                const color = colors[i % colors.length];
                const size = 8 + Math.random() * 8;
                const spin = anim.rotate.interpolate({ inputRange: [0, 10], outputRange: ['0deg', '360deg'] });
                return (
                  <RNAnimated.View
                    key={`conf_cert_${i}`}
                    style={{
                      position: 'absolute',
                      width: size,
                      height: size * 0.6,
                      backgroundColor: color,
                      borderRadius: 2,
                      transform: [{ translateX: anim.x }, { translateY: anim.y }, { rotate: spin }],
                      opacity: anim.opacity,
                      zIndex: 99999,
                      elevation: 2000,
                    }}
                  />
                );
              })}
            </View>
          )}
        </View>
      </Modal>

      {/* عرض الفيديو في الحاوية كاملة مع فحص الاتصال */}
      <Modal visible={!!activeVideo} transparent animationType="fade" onRequestClose={() => setActiveVideo(null)}>
        <View style={[styles.learningModalBg, { backgroundColor: isDark ? "#121212" : "#FFF", paddingBottom: insets.bottom }]}>
          <View style={styles.learningModalHeader}>
            <View style={{ flexDirection: "row", gap: 15 }}>
              {activeVideo?.localVideo && (
                <>
                  <TouchableOpacity onPress={() => { triggerHaptic(); if (activeVideo) exportVideoToGallery(activeVideo.localVideo!); }}>
                    <Feather name="download" size={24} color={isDark ? "#C8A951" : "#4CAF50"} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { triggerHaptic(); if (activeVideo) shareMedia(activeVideo.localVideo!, activeVideo); }}>
                    <Feather name="share-2" size={24} color={isDark ? "#C8A951" : "#2196F3"} />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity onPress={() => { triggerHaptic(); takeScreenshot(videoViewRef); }}>
                <Feather name="camera" size={24} color={isDark ? "#C8A951" : "#673AB7"} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.learningModalTitle, { color: isDark ? "#FFF" : "#222" }]} numberOfLines={1}>{activeVideo?.title}</Text>
            <TouchableOpacity style={styles.learningModalClose} onPress={() => { triggerHaptic(); setActiveVideo(null); }}>
              <Feather name="x" size={28} color={isDark ? "#FFF" : "#000"} />
            </TouchableOpacity>
          </View>

          <View style={styles.mediaContainer} ref={videoViewRef} collapsable={false}>
            {activeVideo && (
              <View style={{ flex: 1, width: "100%" }}>
                <Video
                  ref={videoPlayerRef}
                  source={activeVideo.localVideo ? { uri: activeVideo.localVideo.startsWith('file://') ? activeVideo.localVideo : `file://${activeVideo.localVideo}` } : { uri: `https://drive.google.com/uc?export=download&id=${extractDriveId(activeVideo.videoId)}` }}
                  style={styles.mediaContent}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  usePoster={true}
                  posterSource={localCoverExists ? { uri: LOCAL_COVER_PATH } : { uri: `https://lh3.googleusercontent.com/d/${GLOBAL_COVER_ID}=w1000` }}
                  posterStyle={{ resizeMode: 'cover' }}
                  onLoad={(status: any) => {
                    if (status.isLoaded && playbackPositions[activeVideo.videoId]) {
                      videoPlayerRef.current?.setPositionAsync(playbackPositions[activeVideo.videoId]);
                    }
                  }}
                  onFullscreenUpdate={(e: any) => {
                    if (e.fullscreenUpdate === 1) logActivity("video_fullscreen_enter", undefined, activeVideo.title);
                    else if (e.fullscreenUpdate === 3) logActivity("video_fullscreen_exit", undefined, activeVideo.title);
                  }}
                  onPlaybackStatusUpdate={(status: any) => {
                    if (status.isLoaded) {
                      const pos = status.positionMillis;
                      const duration = status.durationMillis;

                      // تتبع القفز (Seek) لو المسافة كبيرة
                      if (lastPosRef.current !== undefined && Math.abs(pos - lastPosRef.current) > 3000 && !status.didJustFinish) {
                        logActivity("video_seek", undefined, `From ${Math.floor(lastPosRef.current / 1000)}s to ${Math.floor(pos / 1000)}s`);
                      }
                      lastPosRef.current = pos;

                      // حفظ موضع المشاهدة كل فترة
                      if (!status.didJustFinish && pos > 5000) {
                        setPlaybackPositions(prev => {
                          const updated = { ...prev, [activeVideo.videoId]: pos };
                          AsyncStorage.setItem("@playback_positions_v1", JSON.stringify(updated));
                          return updated;
                        });
                      }

                      // تحديث حالة "تمت المشاهدة"
                      if (status.didJustFinish || (duration && pos > duration * 0.95)) {
                        if (!watchedLessons.has(activeVideo.videoId)) {
                          const newSet = new Set(watchedLessons).add(activeVideo.videoId);
                          setWatchedLessons(newSet);
                          AsyncStorage.setItem(WATCHED_LESSONS_KEY, JSON.stringify(Array.from(newSet)));
                          triggerProgressNotification('lesson');
                          logActivity("lesson_view", undefined, `Completed: ${activeVideo.title}`);
                        }
                      }
                    }
                  }}
                  onError={(e) => {
                    console.log("Video Detailed Error:", e);
                    if (activeVideo.localVideo) {
                      // 🔥 حل جذري: إذا فشل تشغيل الملف المحلي، نقوم بحذفه فوراً ونحول المستخدم للتشغيل من السيرفر
                      const corruptedPath = activeVideo.localVideo;
                      FileSystem.deleteAsync(corruptedPath, { idempotent: true }).catch(() => { });

                      // تحديث الحالة لتبديل المصدر إلى السيرفر (Online)
                      setActiveVideo({ ...activeVideo, localVideo: undefined });

                      // تنبيه بسيط للمستخدم بدلاً من رسالة الخطأ القاتلة
                      setSystemAlert({
                        title: "تنبيه",
                        message: "حدثت مشكلة في الملف المحلي، جاري التشغيل من السيرفر الآن لضمان عدم توقفك.",
                        type: "info"
                      });
                    } else {
                      setSystemAlert({
                        title: "عذراً",
                        message: "حدث خطأ في تشغيل هذا المقطع من السيرفر. تأكد من جودة الإنترنت لديك.",
                        type: "error"
                      });
                      setActiveVideo(null);
                    }
                  }}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>
      {/* Hidden Snapshot View for Branded Export (Hidden Off-Screen) */}
      {snapshotQuestions && (
        <View style={{ position: 'absolute', left: -width * 2, top: 0, width: width }}>
          <View ref={examReviewRef} collapsable={false} style={{ backgroundColor: '#0A0505', padding: 30 }}>
            {/* Branding Header (Matching Image Style) */}
            <View style={{ alignItems: 'center', marginBottom: 35 }}>
              <Text style={{ fontSize: 60, fontFamily: 'CSAvaVeni-Regular', color: '#C8A951' }}>Ⲭⲏⲙⲓ</Text>
              <Text style={{ fontSize: 18, fontFamily: 'Cairo_700Bold', color: '#FFF', letterSpacing: 1, marginTop: -5 }}>COPTIC DICTIONARY</Text>
              <View style={{ width: 80, height: 2, backgroundColor: '#8B0000', marginTop: 15 }} />
            </View>

            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 18, borderRadius: 15, marginBottom: 30, borderWidth: 1, borderColor: 'rgba(200,169,81,0.2)' }}>
              <Text style={{ fontSize: 22, fontFamily: 'Cairo_700Bold', color: '#C8A951', textAlign: 'center' }}>
                إجابات امتحان {examResult?.title}
              </Text>
              {examResult?.level && (
                <Text style={{ fontSize: 16, fontFamily: 'Cairo_600SemiBold', color: '#AAA', textAlign: 'center', marginTop: 5 }}>
                  {examResult.level === "1" ? "المستوى الأول" : (examResult.level === "2" ? "المستوى الثاني" : `المستوى ${examResult.level}`)}
                </Text>
              )}
              <Text style={{ fontSize: 12, color: '#AAA', textAlign: 'center', marginTop: 5 }}>
                (الجزء {snapshotQuestions.page} من {snapshotQuestions.total})
              </Text>
            </View>

            {snapshotQuestions.questions.map((q: any, qIdx: number) => {
              const originalIdx = examResult?.reviewQuestions?.findIndex((ex: any) => ex.title === q.title) ?? 0;
              const userAnswer = examResult?.userAnswers?.[originalIdx] || "";
              const correctValue = q.correctValue ? String(q.correctValue).trim() : "";
              const isCheckbox = q.type === "CHECKBOX";
              const correctValues = correctValue ? correctValue.split(", ").map((v: string) => v.trim()) : [];
              const userValues = userAnswer ? userAnswer.split(", ").map((v: string) => v.trim()) : [];
              const isCorrect = correctValue && (isCheckbox
                ? (correctValues.length === userValues.length && correctValues.every((v: string) => userValues.includes(v)))
                : userAnswer.trim() === correctValue);

              return (
                <View key={qIdx} style={{
                  marginBottom: 20,
                  padding: 18,
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderRadius: 15,
                  borderWidth: 1,
                  borderColor: isCorrect ? '#4CAF5033' : '#F4433633',
                  borderRightWidth: 6,
                  borderRightColor: isCorrect ? '#4CAF50' : '#F44336'
                }}>
                  <Text style={{ fontSize: 16, fontFamily: 'Cairo_700Bold', color: '#FFF', textAlign: 'right', marginBottom: 12 }}>{q.title}</Text>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Cairo_700Bold', color: isCorrect ? '#4CAF50' : '#F44336', textAlign: 'right' }}>إجابتك: {userAnswer || "لم يتم الإجابة"}</Text>
                    <Text style={{ fontSize: 14, fontFamily: 'Cairo_700Bold', color: '#C8A951', textAlign: 'right' }}>الإجابة الصحيحة: {correctValue}</Text>
                  </View>
                </View>
              );
            })}

            {/* Branding Footer */}
            <View style={{ marginTop: 30, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 25 }}>
              <View style={{ backgroundColor: '#FFF', padding: 8, borderRadius: 12, marginBottom: 15 }}>
                <QRCode value={currentAppLink || "https://play.google.com/store/apps/details?id=com.khmi.coptic"} size={80} />
              </View>
              <Text style={{ fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: '#AAA', textAlign: 'center' }}>حمل التطبيق لتعلم القبطية مجانا</Text>
              <Text style={{ fontSize: 16, fontFamily: 'Cairo_700Bold', color: '#C8A951', textAlign: 'center', marginTop: 8 }}>Ebram merzik</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  loadingHost: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F8F8" },
  header: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EEE" },
  headerTxt: { fontSize: 21, fontFamily: "Cairo_700Bold" },
  centeredScroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24, gap: 16 },
  levCard: { borderRadius: 15, overflow: "hidden" },
  levCardInner: { padding: 30, alignItems: "center", gap: 10 },
  levCardTitle: { color: "#FFF", fontSize: 22, fontFamily: "Cairo_700Bold" },
  sizeText: { color: "#FFF", fontSize: 14, fontFamily: "Cairo_700Bold" },
  catBtn: { minHeight: 62, paddingHorizontal: 18, paddingVertical: 15, backgroundColor: "#FFF", borderRadius: 18, borderWidth: 1, borderColor: "#E9E2D3", flexDirection: "row", justifyContent: "space-between", alignItems: "center", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  catTxt: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#8B0000" },

  // Premium Level Card Styles
  premiumLevCard: { borderRadius: 24, overflow: "hidden", elevation: 6, shadowColor: "#3A1A12", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12, marginBottom: 2 },
  premiumLevInner: { padding: 22, borderRadius: 24 },
  levHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  premiumLevTitle: { fontSize: 23, fontFamily: "Cairo_700Bold", color: "#FFF" },
  levBadge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  levBadgeTxt: { color: "#FFF", fontSize: 14, fontFamily: "Cairo_700Bold" },
  levDescText: { color: "rgba(255,255,255,0.85)", fontSize: 15, fontFamily: "Cairo_700Bold", lineHeight: 22, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.15)", marginBottom: 20 },
  levActionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  levSizeBox: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.22)", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  levSizeTxt: { color: "#FFF", fontSize: 11, opacity: 0.95, fontFamily: "Cairo_700Bold" },
  levDownloadBtn: { minHeight: 46, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.96)", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 8, elevation: 2 },
  levDownloadTxt: { flexShrink: 1, color: "#8B0000", fontSize: 13, fontFamily: "Cairo_700Bold" },
  levProgressWrapper: { flexDirection: "row", alignItems: "center", justifyContent: "center", width: '100%', zIndex: 2 },
  levProgressTxt: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  levProgressContainer: { width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'center', alignItems: 'center' },
  levProgressBar: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: '#4CAF50', zIndex: 1 },
  levCompletedBox: { flexDirection: "row", alignItems: "center", justifyContent: "center" },

  lessonCard: { marginBottom: 14, borderRadius: 22, backgroundColor: "#FFF", overflow: "hidden", borderWidth: 1, borderColor: "#EAE5DC", elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
  videoHost: {
    height: 210,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(200,169,81,0.45)",
    borderRadius: 18,
    marginHorizontal: 8,
    marginTop: 8,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4
  },
  inlinePlayer: { flex: 1 },
  thumbWrapper: { flex: 1 },
  thumbCover: { flex: 1, justifyContent: "center", alignItems: "center" },
  playBtnCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(139,0,0,0.8)", justifyContent: "center", alignItems: "center" },
  offTag: { position: "absolute", top: 10, right: 10, backgroundColor: "#4CAF50", borderRadius: 10, padding: 2 },
  lessonBody: { paddingHorizontal: 14, paddingVertical: 12 },
  lessonTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", lineHeight: 27 },
  saveBtnInline: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(76,175,80,0.08)", borderRadius: 10, alignSelf: "flex-start", borderWidth: 1, borderColor: "rgba(76,175,80,0.2)" },
  saveBtnInlineTxt: { color: "#4CAF50", fontSize: 13, fontFamily: "Cairo_700Bold" },

  bottomActionsBar: { flexDirection: "row", gap: 12, paddingHorizontal: 15, paddingBottom: 15 },
  mainActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 15, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  mainActionBtnTxt: { color: "#FFF", fontSize: 15, fontFamily: "Cairo_700Bold" },

  sizeBadge: { backgroundColor: "rgba(0,0,0,0.03)", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  sizeBadgeTxt: { fontSize: 9, color: "#999" },
  watchedBadge: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    borderRadius: 10
  },
  watchedBadgeTxt: { fontSize: 9, color: "#FFF", fontFamily: "Cairo_700Bold" },
  downBtn: { position: "absolute", bottom: 0, left: 0, padding: 10 },
  modalBg: { flex: 1, backgroundColor: "#000" },
  modClose: { position: "absolute", top: 40, right: 20, zIndex: 10 },
  fullImg: { width: width, height: height * 0.8, alignSelf: "center", marginTop: 50 },

  premiumModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  resultCard: { width: "85%", borderRadius: 24, padding: 30, alignItems: "center", backgroundColor: "#FFF", elevation: 10 },
  codeModalCard: { maxHeight: "90%", borderRadius: 26, padding: 24, alignItems: "stretch", borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.24, shadowRadius: 22, elevation: 16 },
  codeModalIcon: { width: 58, height: 58, borderRadius: 20, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  codeModalTitle: { width: "100%", fontSize: 21, textAlign: "center" },
  codeModalLabel: { width: "100%", fontFamily: "Cairo_700Bold", fontSize: 14, marginBottom: 2 },
  codeModalInput: { borderWidth: 1, borderBottomWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52, marginTop: 4, fontSize: 16, fontFamily: "Cairo_400Regular" },
  codeModalValueCard: { minHeight: 84, justifyContent: "center", borderRadius: 18, borderWidth: 1, marginBottom: 18 },
  codeModalCancel: { minHeight: 46, marginTop: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 14 },
  codeModalCancelText: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  resultIconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(200,169,81,0.1)", justifyContent: "center", alignItems: "center", marginBottom: 20 },
  resultTitle: { fontSize: 22, fontFamily: "Cairo_700Bold", marginBottom: 10 },
  resultDesc: { fontSize: 14, marginBottom: 25, lineHeight: 22, fontFamily: "Cairo_700Bold" },
  scoreContainer: { backgroundColor: "rgba(103,58,183,0.05)", paddingHorizontal: 30, paddingVertical: 15, borderRadius: 15, marginBottom: 30, alignItems: "center" },
  scoreLabel: { fontSize: 14, color: "#C8A951", fontFamily: "Cairo_700Bold", marginBottom: 5 },
  scoreValue: { fontSize: 28, fontFamily: "Outfit_700Bold", color: "#8B0000" },
  resultDoneBtn: { width: "100%", borderRadius: 15, overflow: "hidden" },
  resultDoneGrad: { paddingVertical: 15, alignItems: "center" },
  resultDoneText: { color: "#FFF", fontSize: 18, fontFamily: "Cairo_700Bold" },

  // New Inline Styles
  examHeaderInline: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  backBtnSmall: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(200,169,81,0.1)", justifyContent: "center", alignItems: "center" },
  examTitleInline: { flex: 1, textAlign: "center", fontSize: 18, fontFamily: "Cairo_700Bold", marginHorizontal: 10 },
  premiumCardInline: { borderRadius: 20, padding: 20, marginBottom: 15, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  qLabelRow: { flexDirection: "row", marginBottom: 15, alignItems: "center" },
  qNumber: { fontSize: 20, color: "#C8A951", fontFamily: "Cairo_700Bold", marginRight: 8 },
  premiumQLab: { paddingHorizontal: 10, paddingVertical: 3, backgroundColor: "rgba(200,169,81,0.1)", borderRadius: 8 },
  premiumQLabTxt: { fontSize: 12, color: "#C8A951", fontFamily: "Cairo_700Bold" },
  choicesGrid: { marginTop: 15, gap: 10 },
  choiceBtn: { flexDirection: "row", alignItems: "center", padding: 15, borderRadius: 12, borderWidth: 1 },
  choiceCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#C8A951", marginRight: 12, justifyContent: "center", alignItems: "center" },
  choiceCircleActive: { backgroundColor: "rgba(200,169,81,0.2)" },
  choiceCircleInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#C8A951" },
  checkboxSquare: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: "#C8A951", marginRight: 12, justifyContent: "center", alignItems: "center" },
  checkboxSquareActive: { backgroundColor: "#C8A951" },
  premiumInput: {
    borderBottomWidth: 2,
    paddingVertical: 10,
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    marginTop: 10,
  },
  submitBtnInline: { marginTop: 20, marginBottom: 50, borderRadius: 15, overflow: "hidden" },
  submitGradInline: { paddingVertical: 18, alignItems: "center" },
  submitTextInline: { color: "#FFF", fontSize: 18, fontFamily: "Cairo_700Bold" },
  liveNameTxt: { fontSize: 16, color: "#C8A951", fontFamily: "Cairo_700Bold", textAlign: "right" },

  welcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,122,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,122,255,0.15)"
  },
  welcomeText: {
    fontSize: 14,
    color: "#007AFF",
    fontFamily: "Cairo_700Bold"
  },
  fullVideoBg: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  fullVideoClose: { position: "absolute", top: 40, right: 20, zIndex: 999, padding: 10 },
  fullVideoPlayer: { width: "100%", height: "100%" },

  // Learning Modal Styles
  learningModalBg: { flex: 1 },
  learningModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)"
  },
  learningModalTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", flex: 1, textAlign: "right", marginRight: 15 },
  learningModalClose: { padding: 5 },
  mediaContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(200,169,81,0.3)",
    margin: 10,
    borderRadius: 20,
    overflow: "hidden"
  },
  mediaContent: { width: "100%", height: "100%" },
  mediaBottomBar: {
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -20,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  premiumSaveBtn: { width: "100%", borderRadius: 12, overflow: "hidden", elevation: 2 },
  premiumSaveBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  premiumSaveBtnTxt: { color: "#FFF", fontSize: 14, fontFamily: "Cairo_700Bold" },

  iconOnlyBtn: { alignItems: "center", gap: 6 },
  iconOnlyBtnGrad: { width: 54, height: 54, borderRadius: 27, justifyContent: "center", alignItems: "center", elevation: 4 },
  iconLabel: { fontSize: 12, fontFamily: "Cairo_700Bold" },

  lessonItemContainer: { marginBottom: 20 },
  whiteSpaceAction: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3
  },
  downloadFloatingPanel: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    zIndex: 99999,
  },
  downloadFloatingInner: {
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(200,169,81,0.2)",
  },
  downloadInfoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 12,
  },
  downloadIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(200,169,81,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  downloadStatusTxt: {
    color: "#C8A951",
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  downloadLessonTxt: {
    color: "#FFF",
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
  },
  downloadPercentTxt: {
    color: "#FFF",
    fontFamily: "Cinzel_700Bold",
    fontSize: 18,
    marginRight: 10,
  },
  downloadProgressTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    marginBottom: 10,
    overflow: "hidden",
  },
  downloadProgressBar: {
    height: "100%",
    backgroundColor: "#C8A951",
    borderRadius: 3,
  },
  downloadFooterRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  downloadCountTxt: {
    color: "#AAA",
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
  },
  downloadHideBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  downloadHideTxt: {
    color: "#FFF",
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },
  premiumActionsBar: {
    flexDirection: "row",
    gap: 9,
    marginTop: 10,
    paddingHorizontal: 2,
    marginBottom: 4
  },
  premiumActionBtn: { flex: 1, borderRadius: 13, overflow: "hidden", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 5 },
  premiumActionInner: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 5, paddingVertical: 11 },
  premiumActionTxt: { color: "#FFF", fontSize: 14, fontFamily: "Cairo_700Bold" },
  lessonGlossaryButton: { marginHorizontal: 2, marginTop: 8, marginBottom: 10, borderRadius: 13, borderWidth: 1, overflow: "hidden", elevation: 2 },
  lessonGlossaryButtonInner: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 14, paddingVertical: 10 },
  lessonGlossaryButtonText: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  lessonGlossaryLetters: { marginHorizontal: 16, marginTop: 16, marginBottom: 10, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: "center", gap: 3 },
  lessonGlossaryLessonTitle: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  lessonGlossaryLettersLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  lessonGlossaryLettersText: { fontFamily: "CSAvaVeni-Regular", fontSize: 25, writingDirection: "ltr", textAlign: "center" },
  lessonGlossaryCount: { fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 2 },
  lessonGlossarySourceNote: { fontFamily: "Cairo_400Regular", fontSize: 10, textAlign: "center", marginTop: 3 },
  lessonGlossaryList: { paddingTop: 4, paddingBottom: 24 },
  lessonGlossaryLoading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  lessonGlossaryEmptyText: { margin: 22, textAlign: "center", fontFamily: "Cairo_600SemiBold", fontSize: 14, lineHeight: 24 },
  lessonGlossaryRetryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: "#8B0000" },
  lessonGlossaryRetryText: { color: "#FFF", fontFamily: "Cairo_700Bold", fontSize: 14 },
});
