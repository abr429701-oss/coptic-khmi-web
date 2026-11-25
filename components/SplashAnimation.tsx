// SplashAnimation.tsx — v20: زي v19 بس المدة 5 ثواني بدل 7.5 (كل التوقيتات × 2/3)
// + إصلاح خطأ الـ LogBox: خط التوقيع بقى بـ scaleX بدل width (width مش مدعومة بالـ native driver)
// (بطلب المستخدم 2026-11-18: "خلي الخلفية الفرعونية").
// في فتحة اللوجو: خلفية غامقة زي الفيديو. في فتحة توت: خلفية فرعونية
// باهتة بتظهر بالتدريج ورا كل حاجة.
// المدة 5 ثواني. بديل مباشر لملف components/SplashAnimation.tsx.
//  • في كل فتحة يظهر عنصر واحد فقط: Ⲁ أو الشعار أو قناع توت، بالتناوب
//  • الخيارات الثلاثة تشترك في مساحة وحجم وتوقيت الحركة نفسها
//  • 0.55s+: حروف ⲭⲏⲙⲓ واحد ورا التاني (0.09s بين كل حرف)
//  • 1.3–1.63s: الخط الدهبي بيترسم تحت الاسم
//  • 1.45–1.75s: COPTIC DICTIONARY بتظهر
//  • 2.4–3.07s: التوقيع بيطلع من تحت (CRAFTED BY + Ebram Merzik)
// المدة 5 ثواني. بديل مباشر لملف components/SplashAnimation.tsx.
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  Text,
  Dimensions,
  Platform,
  Image,
  useWindowDimensions,
} from "react-native";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

const GOLD = "#C8A951";
const GOLD_L = "#F0D878";
const BG = "#070202";

// توقيت الفتحة بالمللي ثانية — نفس فيديو v12
const T = {
  centerStart: 0, // ألفا والشعار وقناع توت يبدأون معًا
  centerDur: 533,
  lettersStart: 550,
  letterStep: 90,
  letterDur: 230,
  lineStart: 1300,
  lineDur: 333,
  subStart: 1450,
  subDur: 300,
  sigStart: 2400,
  sigDur: 667,
  nameStart: 2600,
  nameDur: 667,
  total: 5000,
};

// مقاسات متناسبة مع عرض الشاشة — نفس نسب فيديو v12 (1080×1920)
const LOGO_SIZE = Math.round(width * 0.278); // اللوجو 300 من 1080
const WORD_SIZE = Math.min(Math.round(width * 0.139), 60); // حروف الاسم 150 من 1080
const LETTER_GAP = Math.round(width * 0.007);
const LETTER_RISE = Math.round(width * 0.015); // طلوع الحروف 16 من 1080
const GAP = Math.round(width * 0.079); // المسافة بين اللوجو والاسم
const SUB_SIZE = Math.min(Math.round(width * 0.03), 14);
const ALPHA_SIZE = LOGO_SIZE;
const WORD = ["Ⲭ", "ⲏ", "ⲙ", "ⲓ"];

/* ─── صوت الويب — ناقوس كنسي احترافي ────────────────────── */
function playWebChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    function bell(freq: number, gain: number, startTime: number, decay: number) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const env = ctx.createGain();
      const reverb = ctx.createGain();
      osc.connect(env);
      osc2.connect(env);
      env.connect(reverb);
      reverb.connect(ctx.destination);
      osc.type = "sine";
      osc2.type = "sine";
      osc.frequency.value = freq;
      osc2.frequency.value = freq * 2.756;
      reverb.gain.value = 0.85;
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(gain, startTime + 0.012);
      env.gain.exponentialRampToValueAtTime(gain * 0.3, startTime + 0.3);
      env.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);
      osc.start(startTime); osc.stop(startTime + decay);
      osc2.start(startTime); osc.stop(startTime + decay);
    }

    const t = ctx.currentTime;
    bell(220.00, 0.35, t, 4.5);
    bell(329.63, 0.22, t, 3.8);
    bell(440.00, 0.16, t, 3.2);
    bell(659.25, 0.09, t, 2.5);
    bell(220.00, 0.18, t + 0.5, 3.5);
    bell(329.63, 0.11, t + 0.5, 3.0);
    bell(523.25, 0.14, t + 1.0, 3.0);
    bell(659.25, 0.09, t + 1.2, 2.5);
    bell(880.00, 0.06, t + 1.4, 2.0);
  } catch (_) { }
}

interface Props { onFinish: () => void }

// علم عالمي لضمان تشغيل الصوت مرة واحدة فقط في الجلسة الواحدة
let introSoundStarted = false;

export function SplashAnimation({ onFinish }: Props) {
  const viewport = useWindowDimensions();
  const safeInsets = useSafeAreaInsets();
  const estimatedLockupWidth = LOGO_SIZE + GAP + WORD_SIZE * 3.35;
  const availableWidth = Math.max(1, viewport.width - 32);
  const availableHeight = Math.max(1, viewport.height - safeInsets.top - safeInsets.bottom - 120);
  const lockupScale = Math.max(0.65, Math.min(1, availableWidth / estimatedLockupWidth, availableHeight / Math.max(LOGO_SIZE, 1)));

  const [splashMode, setSplashMode] = useState<'alpha' | 'logo' | 'tut'>('logo');
  const [modeReady, setModeReady] = useState(false);
  const [audioFinished, setAudioFinished] = useState(false);
  const [minimumDisplayElapsed, setMinimumDisplayElapsed] = useState(false);
  const [wordW, setWordW] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const lastMode = await AsyncStorage.getItem("@splash_config_mode");
        const nextMode = lastMode === "logo" ? "tut" : lastMode === "tut" ? "alpha" : "logo";
        await AsyncStorage.setItem("@splash_config_mode", nextMode);
        if (mounted) {
          setSplashMode(nextMode);
          setModeReady(true);
        }
      } catch {
        if (mounted) {
          setSplashMode("logo");
          setModeReady(true);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* ── تشغيل الصوت (نفس الكود الحالي) ─────────────────── */
  useEffect(() => {
    let mounted = true;
    let audioSafetyTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (!introSoundStarted) {
            introSoundStarted = true;
            playWebChime();
          }
          audioSafetyTimer = setTimeout(() => {
            if (mounted) setAudioFinished(true);
          }, 4800);
          return;
        }

        if (introSoundStarted) {
          if (mounted) setAudioFinished(true);
          return;
        }
        audioSafetyTimer = setTimeout(() => {
          if (mounted) setAudioFinished(true);
        }, 15000);

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });

        if (Platform.OS === "android") {
          await new Promise((r) => setTimeout(r, 300));
        }

        if (!mounted) return;

        const { sound } = await Audio.Sound.createAsync(
          require("@/assets/sounds/startup_bell.wav"),
          { shouldPlay: true, volume: 1.0, isMuted: false }
        );
        if (!mounted) {
          await sound.unloadAsync();
          return;
        }
        introSoundStarted = true;
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish && mounted) {
            setAudioFinished(true);
          }
        });
      } catch (_) {
        if (mounted) setAudioFinished(true);
      }
    })();
    return () => {
      mounted = false;
      if (audioSafetyTimer) clearTimeout(audioSafetyTimer);
      soundRef.current?.unloadAsync().catch(() => { });
    };
  }, []);

  /* ─── قيم الأنيميشن ─────────────────────────────────── */
  const exitOp = useRef(new Animated.Value(1)).current;
  const centerOp = useRef(new Animated.Value(0)).current;
  const centerSc = useRef(new Animated.Value(0.92)).current;
  const shineProgress = useRef(new Animated.Value(0)).current;
  const pharOp = useRef(new Animated.Value(0)).current;
  const lineTx = useRef(new Animated.Value(0)).current;
  const subOp = useRef(new Animated.Value(0)).current;
  const sigOp = useRef(new Animated.Value(0)).current;
  const sigY = useRef(new Animated.Value(70)).current;
  const nameOp = useRef(new Animated.Value(0)).current;
  const nameY = useRef(new Animated.Value(70)).current;
  const letters = useRef(WORD.map(() => ({
    op: new Animated.Value(0),
    y: new Animated.Value(LETTER_RISE),
  }))).current;

  const isAlpha = splashMode === "alpha";
  const isLogo = splashMode === "logo";
  const isTut = splashMode === "tut";

  /* ─── تشغيل تسلسل الفتحة — عنصر واحد فقط في كل تشغيل ─ */
  useEffect(() => {
    if (!modeReady) return;
    const rest = Animated.parallel([
      Animated.timing(pharOp, { toValue: isTut ? 0.15 : 0, duration: 1000, delay: 0, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      // لكل خيار زمن البداية والحجم والحركة نفسها.
      Animated.timing(centerOp, { toValue: 1, duration: T.centerDur, delay: T.centerStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(centerSc, { toValue: 1, tension: 60, friction: 9, delay: T.centerStart, useNativeDriver: true }),
      // لمعة واحدة تمر على العنصر المختار بعد ظهوره، من دون تكرار.
      Animated.timing(shineProgress, { toValue: 1, duration: 220, delay: T.centerDur + 180, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      // الخط الدهبي تحت الاسم (بيترسم من الشمال لليمين)
      Animated.timing(lineTx, { toValue: 1, duration: T.lineDur, delay: T.lineStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      // COPTIC DICTIONARY
      Animated.timing(subOp, { toValue: 1, duration: T.subDur, delay: T.subStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      // التوقيع بيطلع من تحت
      Animated.timing(sigOp, { toValue: 1, duration: T.sigDur, delay: T.sigStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(sigY, { toValue: 0, duration: T.sigDur, delay: T.sigStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(nameOp, { toValue: 1, duration: T.nameDur, delay: T.nameStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(nameY, { toValue: 0, duration: T.nameDur, delay: T.nameStart, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      // حروف الاسم واحد ورا التاني — بتطلع لفوق وتظهر
      ...letters.map((l, i) =>
        Animated.parallel([
          Animated.timing(l.op, { toValue: 1, duration: T.letterDur, delay: T.lettersStart + i * T.letterStep, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(l.y, { toValue: 0, duration: T.letterDur, delay: T.lettersStart + i * T.letterStep, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ])
      ),
    ]);

    rest.start();
    return () => rest.stop();
  }, [modeReady, isTut]);

  // أقل مدة عرض = مدة التسلسل الكاملة (5 ثواني)
  useEffect(() => {
    const minimumTimer = setTimeout(() => setMinimumDisplayElapsed(true), T.total);
    return () => clearTimeout(minimumTimer);
  }, []);

  useEffect(() => {
    if (!audioFinished || !minimumDisplayElapsed) return;
    const animation = Animated.timing(exitOp, {
      toValue: 0,
      duration: Platform.OS === "web" ? 300 : 380,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished) onFinishRef.current();
    });
    return () => animation.stop();
  }, [audioFinished, minimumDisplayElapsed, exitOp]);

  const shineX = shineProgress.interpolate({ inputRange: [0, 1], outputRange: [-LOGO_SIZE * 0.3, LOGO_SIZE * 0.3] });
  const shineOpacity = shineProgress.interpolate({ inputRange: [0, 0.12, 0.82, 1], outputRange: [0, 0.8, 0.72, 0] });

  // الخط بيترسم من الشمال لليمين (من برّه الدايرة لحد مكانها)
  const lineX = lineTx.interpolate({ inputRange: [0, 1], outputRange: [-Math.max(wordW, LOGO_SIZE), 0] });
  // خط التوقيع بيكبر من النص لبرّه — بـ scaleX (مش width، لأن width
  // خاصية layout والـ native animated module مابيدعمهاش)

  return (
    <Animated.View style={[styles.root, { opacity: exitOp }]}>

      {isTut && (
        <Animated.Image
          source={require("@/assets/images/pharaonic_bg_transparent.png")}
          style={[StyleSheet.absoluteFill, { width, height, opacity: pharOp }]}
          resizeMode="cover"
        />
      )}

      {/* عنصر واحد في كل فتحة: ألفا، ثم الشعار، ثم قناع توت بالتناوب */}
      <View style={[styles.lockup, { transform: [{ scale: lockupScale }] }]}> 

        <View style={styles.centerWrap}>
          <Animated.View style={[styles.centerVisual, { opacity: centerOp, transform: [{ scale: centerSc }] }]}> 
            {isAlpha ? (
              <Text style={styles.alphaLetter}>Ⲁ</Text>
            ) : (
              <Image
                source={isLogo ? require("@/assets/images/logo22.png") : require("@/assets/images/tut_mask_transparent.png")}
                style={styles.centerImgInner}
              />
            )}
            <Animated.View pointerEvents="none" style={[styles.shineClip, { opacity: shineOpacity }]}>
              <Animated.View style={[styles.shineBeam, { transform: [{ translateX: shineX }, { rotate: "24deg" }] }]}>
                <View style={styles.shineCore} />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </View>

        {/* الاسم */}
        <View style={styles.wordBlock}>
          <View style={styles.wordRow} onLayout={(e) => setWordW(e.nativeEvent.layout.width)}>
            {letters.map((l, i) => (
              <Animated.Text
                key={i}
                style={[styles.wordLetter, { opacity: l.op, transform: [{ translateY: l.y }], marginRight: i < WORD.length - 1 ? LETTER_GAP : 0 }]}
              >
                {WORD[i]}
              </Animated.Text>
            ))}
          </View>
          <View style={styles.lineWrap}>
            <Animated.View style={[styles.lineInner, { opacity: lineTx, transform: [{ translateX: lineX }] }]} />
          </View>
          <Animated.Text
            style={[styles.sub, { opacity: subOp, width: wordW, fontSize: Math.min(17, Math.max(15, SUB_SIZE + 2)) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            COPTIC DICTIONARY
          </Animated.Text>
        </View>
      </View>

      {/* التوقيع — أسفل الشاشة */}
      <Animated.View style={[styles.sigBlock, { bottom: Math.max(44, safeInsets.bottom + 20), opacity: sigOp, transform: [{ translateY: sigY }] }]}>
        <Text style={styles.sigLabel}>CRAFTED BY</Text>
        <Animated.Text style={[styles.sigName, { opacity: nameOp, transform: [{ translateY: nameY }] }]}>
          Ebram Merzik
        </Animated.Text>
      </Animated.View>

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 9999,
    elevation: 9999,
    alignItems: "center",
    justifyContent: "center",
    // الموبايل عربي (RTL) فبيقلب كل صف — نفرض LTR عشان يطابق الفيديو
    direction: "ltr",
    overflow: "hidden",
  },
  alphaLetter: {
    fontFamily: "CSAvaVeni-Regular",
    fontSize: ALPHA_SIZE,
    color: GOLD_L,
    textShadowColor: "rgba(240,216,120,0.45)",
    textShadowRadius: 24,
    textShadowOffset: { width: 0, height: 0 },
  },
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    direction: "ltr",
  },
  centerWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  centerVisual: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  shineClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  shineBeam: {
    position: "absolute",
    top: LOGO_SIZE * 0.225,
    left: LOGO_SIZE * 0.45,
    width: LOGO_SIZE * 0.10,
    height: LOGO_SIZE * 0.55,
    borderRadius: LOGO_SIZE * 0.05,
    backgroundColor: "rgba(240,216,120,0.22)",
    alignItems: "center",
  },
  shineCore: {
    width: 2,
    height: "100%",
    backgroundColor: "rgba(255,255,238,0.68)",
  },
  centerImgInner: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    resizeMode: "contain",
  },
  wordBlock: {
    marginLeft: GAP,
    alignItems: "flex-start",
  },
  wordRow: {
    flexDirection: "row",
    direction: "ltr",
  },
  wordLetter: {
    fontFamily: "CSAvaVeni-Regular",
    fontSize: WORD_SIZE,
    color: GOLD_L,
    lineHeight: WORD_SIZE * 1.15,
    textShadowColor: "rgba(200,169,81,0.35)",
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  lineWrap: {
    height: 3,
    marginTop: 10,
    overflow: "hidden",
    alignSelf: "stretch",
  },
  lineInner: {
    height: 3,
    width: "100%",
    backgroundColor: GOLD,
  },
  sub: {
    marginTop: 8,
    fontSize: SUB_SIZE,
    fontFamily: "Inter_600SemiBold",
    color: "#C4BAA6",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  sigBlock: {
    position: "absolute",
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  sigLabel: {
    fontSize: 8,
    fontFamily: "Inter_400Regular",
    color: "rgba(200,169,81,0.4)",
    letterSpacing: 4,
    marginBottom: 4,
  },
  sigName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(200,169,81,0.6)",
    letterSpacing: 2,
  },
});
