import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  PanResponder,
  Dimensions,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  BackHandler,
} from "react-native";
import { Svg, Path, G } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { useTheme } from "@/contexts/ThemeContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { COPTIC_ALPHABET, CopticLetterCategory } from "@/constants/CopticAlphabet";
import Animated, {
  ZoomIn,
  FadeInUp,
  FadeOutUp,
  useSharedValue,
  withSpring,
  withSequence,
} from "react-native-reanimated";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { logActivity } from "@/hooks/useUserTracking";

const { width, height } = Dimensions.get("window");
const CANVAS_SIZE = width * 0.62;
const IDEAL_MARGIN = CANVAS_SIZE * 0.15;


interface Props {
  visible: boolean;
  onClose: () => void;
}

interface LetterScore {
  char: string;
  score: number;
  date: string;
}

export function CopticHandwritingModal({ visible, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const { t, language, isRTL } = useLanguage();
  const { currentAppLink } = useAppUpdate();
  const insets = useSafeAreaInsets();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isSmallMode, setIsSmallMode] = useState(false);
  const [allDrawings, setAllDrawings] = useState<Record<string, string[]>>({});
  const [scoresHistory, setScoresHistory] = useState<LetterScore[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [accuracy, setAccuracy] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  
  const drawingKey = `${currentIdx}_${isSmallMode ? 's' : 'c'}`;

  const posterRef = useRef<View>(null);
  const scale = useSharedValue(1);

  const stateRef = useRef({ currentIdx, isSmallMode, drawingKey, currentPath, allDrawings });
  useEffect(() => {
    stateRef.current = { currentIdx, isSmallMode, drawingKey, currentPath, allDrawings };
  }, [currentIdx, isSmallMode, drawingKey, currentPath, allDrawings]);

  useEffect(() => {
    const loadData = async () => {
      const [savedDrawings, savedScores] = await Promise.all([
        AsyncStorage.getItem("@coptic_handwriting_v5_draw"),
        AsyncStorage.getItem("@coptic_handwriting_v5_scores")
      ]);
      if (savedDrawings) setAllDrawings(JSON.parse(savedDrawings));
      if (savedScores) setScoresHistory(JSON.parse(savedScores));
    };
    if (visible) loadData();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handleBack = () => {
      onClose();
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => sub.remove();
  }, [visible, onClose]);

  const triggerHaptic = (type: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== "web") Haptics.impactAsync(type);
  };

  const playSound = async (type: 'success' | 'click' | 'wrong') => {
    try {
      const soundFile = type === 'success' ? require("../assets/sounds/success.mp3") : type === 'wrong' ? require("../assets/sounds/wrong.mp3") : require("../assets/sounds/click.mp3");
      const { sound } = await Audio.Sound.createAsync(soundFile);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && s.didJustFinish) sound.unloadAsync(); });
    } catch (e) { }
  };

  const saveAsImage = async () => {
    try {
      setIsSaving(true);

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t.handwriting.title, t.toast.saveFailedSub);
        setIsSaving(false);
        return;
      }

      await new Promise(r => setTimeout(r, 600));

      const uri = await captureRef(posterRef, {
        format: "png",
        quality: 1,
        result: "tmpfile"
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      setToastMsg(t.handwriting.imageSaved);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      Alert.alert(t.handwriting.title, t.toast.unexpectedError);
    } finally {
      setIsSaving(false);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath(`M${locationX},${locationY}`);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prev) => `${prev} L${locationX},${locationY}`);
      },
      onPanResponderRelease: () => {
        const { drawingKey, currentPath } = stateRef.current;
        if (currentPath) {
          const newDrawings = {
            ...stateRef.current.allDrawings,
            [drawingKey]: [...(stateRef.current.allDrawings[drawingKey] || []), currentPath],
          };
          setAllDrawings(newDrawings);
          AsyncStorage.setItem("@coptic_handwriting_v5_draw", JSON.stringify(newDrawings));
          setCurrentPath("");
        }
      },
    })
  ).current;

  const clearCanvas = () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    const newDrawings = { ...allDrawings, [drawingKey]: [] };
    setAllDrawings(newDrawings);
    AsyncStorage.setItem("@coptic_handwriting_v5_draw", JSON.stringify(newDrawings));
    setCurrentPath("");
    setShowResult(false);
  };

  const undoLastStroke = () => {
    triggerHaptic();
    const strokes = allDrawings[drawingKey] || [];
    if (strokes.length === 0) return;
    const newDrawings = { ...allDrawings, [drawingKey]: strokes.slice(0, -1) };
    setAllDrawings(newDrawings);
    AsyncStorage.setItem("@coptic_handwriting_v5_draw", JSON.stringify(newDrawings));
  };

  const validateDrawing = () => {
    const strokes = allDrawings[drawingKey] || [];
    if (strokes.length === 0) return;

    setIsAnalyzing(true);
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    const points: { x: number; y: number }[] = [];
    strokes.forEach(s => {
      const matches = s.match(/[-+]?[0-9]*\.?[0-9]+/g);
      if (matches) {
        for (let i = 0; i < matches.length; i += 2) {
          points.push({ x: parseFloat(matches[i]), y: parseFloat(matches[i + 1]) });
        }
      }
    });

    setTimeout(() => {
      setIsAnalyzing(false);
      setShowResult(true);

      const minX = Math.min(...points.map(p => p.x));
      const maxX = Math.max(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      const maxY = Math.max(...points.map(p => p.y));

      const drawWidth = maxX - minX;
      const drawHeight = maxY - minY;
      const totalLen = points.length;
      const occupiedArea = drawWidth * drawHeight;
      const canvasArea = CANVAS_SIZE * CANVAS_SIZE;

      let score = 0;
      let msg = "";

      // 1. Precise Out of Bounds Check (Tighter)
      const outOfBounds = points.some(p => 
        p.x < 10 || p.x > CANVAS_SIZE - 10 || 
        p.y < 10 || p.y > CANVAS_SIZE - 10
      );

      // 2. Grid Density Analysis (4x4 Grid)
      const GRID_SIZE = 4;
      const cellSize = CANVAS_SIZE / GRID_SIZE;
      const grid = Array(GRID_SIZE * GRID_SIZE).fill(0);
      
      points.forEach(p => {
        const gx = Math.min(GRID_SIZE - 1, Math.floor(p.x / cellSize));
        const gy = Math.min(GRID_SIZE - 1, Math.floor(p.y / cellSize));
        grid[gy * GRID_SIZE + gx]++;
      });

      // Normalize grid densities
      const maxDensity = Math.max(...grid);
      const normalizedGrid = grid.map(v => v / (maxDensity || 1));

      // 3. Jitter / Smoothness Analysis
      let totalDist = 0;
      for (let i = 1; i < points.length; i++) {
        totalDist += Math.sqrt(Math.pow(points[i].x - points[i-1].x, 2) + Math.pow(points[i].y - points[i-1].y, 2));
      }
      const smoothness = Math.min(100, (totalDist / (points.length * 5)) * 100);

      // 4. Centroid & Aspect Ratio
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const distFromCenter = Math.sqrt(Math.pow(centerX - CANVAS_SIZE / 2, 2) + Math.pow(centerY - CANVAS_SIZE / 2, 2));
      const aspectRatio = drawWidth / (drawHeight || 1);
      
      

      if (outOfBounds) {
        score = 5;
        msg = t.handwriting.feedback.outOfBounds;
      } else if (totalLen < 30) {
        score = 10;
        msg = t.handwriting.feedback.tooSmall;
      } else if (occupiedArea > canvasArea * 0.85) {
        score = 15;
        msg = t.handwriting.feedback.scribble;
      } else {
        // COMPLEX SCORING FORMULA
        // A: Coverage Score (Ideal range is 0.15 to 0.5)
        const occupancyRatio = occupiedArea / canvasArea;
        let coverageScore = 0;
        if (occupancyRatio >= 0.15 && occupancyRatio <= 0.5) coverageScore = 100;
        else coverageScore = Math.max(0, 100 - Math.abs(0.3 - occupancyRatio) * 150);
        
        // B: Centering Score (More forgiving margin)
        const centeringScore = Math.max(0, 100 - (distFromCenter / (CANVAS_SIZE * 0.25)) * 100);
        
        // C: Form Score (Complexity & Grid Spread)
        // High spread relative to occupied cells is better
        const activeCells = grid.filter(v => v > 5).length;
        const formScore = Math.min(100, (activeCells / (GRID_SIZE * 1.5)) * 100);

        // D: Smoothness Bonus (Total distance vs points ratio)
        const smoothnessScore = Math.min(100, (points.length / (totalDist / 50)) * 10);

        // Final Calculation with balanced weights
        score = Math.floor(
          (coverageScore * 0.25) + 
          (centeringScore * 0.25) + 
          (formScore * 0.4) +
          (smoothnessScore * 0.1)
        );

        // Cap and refine
        score = Math.max(0, Math.min(100, score));
        
        // Logical check for extreme distortions
        if (aspectRatio > 4 || aspectRatio < 0.15) {
          score = Math.floor(score * 0.5); 
        }

        if (score < 40) msg = t.handwriting.feedback.wrongSize;
        else if (score < 75) msg = t.handwriting.feedback.good;
        else msg = t.handwriting.feedback.excellent;
      }

      setAccuracy(score);
      setFeedbackMsg(msg);

      const newScoreEntry: LetterScore = {
        char: isSmallMode ? getSmallChar(COPTIC_ALPHABET[currentIdx].char) : COPTIC_ALPHABET[currentIdx].char,
        score: score,
        date: new Date().toLocaleString('ar-EG'),
      };
      const newHistory = [newScoreEntry, ...scoresHistory].slice(0, 100);
      setScoresHistory(newHistory);
      AsyncStorage.setItem("@coptic_handwriting_v5_scores", JSON.stringify(newHistory));
      
      // Log activity to Google Sheet
      const trainingDetails = `Handwriting Practice: ${newScoreEntry.char}, Accuracy: ${score}%`;
      logActivity("training_session", undefined, trainingDetails);

      if (score >= 80) {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
      } else {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
      }
      scale.value = withSequence(withSpring(1.2), withSpring(1));
    }, 1800);
  };

  const nextLetter = () => {
    if (currentIdx < COPTIC_ALPHABET.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setCurrentPath("");
      setShowResult(false);
      triggerHaptic();
    }
  };

  const prevLetter = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
      setCurrentPath("");
      setShowResult(false);
      triggerHaptic();
    }
  };

  const currentChar = COPTIC_ALPHABET[currentIdx];
  const currentPaths = allDrawings[drawingKey] || [];

  const getSmallChar = (char: string) => {
    const code = char.charCodeAt(0);
    if (code >= 0x2C80 && code <= 0x2CFE && code % 2 === 0) return String.fromCharCode(code + 1);
    if (code >= 0x03E2 && code <= 0x03EF && code % 2 === 0) return String.fromCharCode(code + 1);
    return char.toLowerCase();
  };

  const bestScore = Math.max(...scoresHistory.filter(s => s.char === currentChar.char).map(s => s.score), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
        <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: isDark ? "#1A1A1A" : "#FDFDFD" }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color={isDark ? "#FFF" : "#333"} />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', direction: 'ltr' }}>
              <Text style={[styles.copticFontHeader, { color: colors.text }]}>{currentChar.char} {getSmallChar(currentChar.char)}</Text>
            </View>
            <Text style={{ color: colors.gold, fontSize: 20, marginHorizontal: 5 }}>—</Text>
            <Text style={[styles.headerLetterName, { color: colors.gold }]}>{currentChar.name[language]}</Text>
          </View>
          
          <TouchableOpacity onPress={saveAsImage} style={styles.saveBtn}>
            <Feather name="download" size={20} color={colors.gold} />
            <Text style={[styles.saveBtnText, { color: colors.gold }]}>{t.handwriting.savePoster}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          <View style={styles.content}>
            {/* Top Navigation & Mode Toggle Row */}
            <View style={styles.topNavRowCompact}>
              <TouchableOpacity style={styles.navBtnSmall} onPress={prevLetter} disabled={currentIdx === 0}>
                <Feather name={isRTL ? "chevron-right" : "chevron-left"} size={22} color={currentIdx === 0 ? "#DDD" : colors.gold} />
              </TouchableOpacity>
              
              <View style={styles.modeToggleRowCompact}>
                <TouchableOpacity 
                  style={[styles.modeBtnCompact, !isSmallMode && { backgroundColor: colors.gold }]} 
                  onPress={() => { setIsSmallMode(false); setShowResult(false); triggerHaptic(); }}
                >
                  <Text style={[styles.modeBtnTextCompact, !isSmallMode ? { color: "#FFF" } : { color: colors.text }, { fontFamily: "CSAvaVeni-Regular" }]}>{currentChar.char}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modeBtnCompact, isSmallMode && { backgroundColor: colors.gold }]} 
                  onPress={() => { setIsSmallMode(true); setShowResult(false); triggerHaptic(); }}
                >
                  <Text style={[styles.modeBtnTextCompact, isSmallMode ? { color: "#FFF" } : { color: colors.text }, { fontFamily: "CSAvaVeni-Regular" }]}>{getSmallChar(currentChar.char)}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.letterInfoPill}>
                <Text style={styles.progressTextSmall}>{currentIdx + 1} / {COPTIC_ALPHABET.length}</Text>
              </View>

              <TouchableOpacity style={styles.navBtnSmall} onPress={nextLetter} disabled={currentIdx === COPTIC_ALPHABET.length - 1}>
                <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={currentIdx === COPTIC_ALPHABET.length - 1 ? "#DDD" : colors.gold} />
              </TouchableOpacity>
            </View>

            {/* Explanation Section */}
            <View style={[styles.detailBox, { backgroundColor: isDark ? "rgba(200,169,81,0.08)" : "#FFF9E6", minHeight: 130, maxHeight: 190, justifyContent: 'center', paddingVertical: 25, paddingHorizontal: 15 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ gap: 8, paddingHorizontal: 5, alignItems: 'flex-start' }}>
                    {currentChar.rule[language].split('|').map((part, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                        <View style={{ width: 20, alignItems: 'flex-start' }}>
                          <Text style={{ color: colors.gold, fontFamily: "Cairo_700Bold", fontSize: 16 }}>-</Text>
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: 5 }}>
                          <Text selectable={true} style={[styles.ruleText, { color: colors.text, fontSize: 16, lineHeight: 24, textAlign: 'left' }]}>
                            {currentChar.char !== 'Ⲋ' && (
                              <Text style={{ fontFamily: "Cairo_700Bold", color: colors.gold }}>{t.handwriting.pronouncedAs} </Text>
                            )}
                            {part.trim()}
                          </Text>
                        </View>
                      </View>
                    ))}

                    <View style={{ height: 1, backgroundColor: colors.gold, opacity: 0.1, alignSelf: 'center', width: '60%', marginVertical: 4 }} />

                    <Text style={{ textAlign: 'center', fontSize: 15 }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", color: "#888" }}>(</Text>
                      {currentChar.category === "egyptian" ? (
                        <Text style={{ color: "#E91E63", fontFamily: "Cairo_700Bold" }}>
                          {language === 'ar' ? "حرف مصري قبطي الأصل" : "Egyptian Coptic Origin"})
                        </Text>
                      ) : (
                        <>
                          {currentChar.category !== "none" && (
                            <Text style={{ color: "#03A9F4", fontFamily: "Cairo_700Bold" }}>{t.handwriting.categories[currentChar.category]} </Text>
                          )}
                          <Text style={{ color: "#E91E63", fontFamily: "Cairo_700Bold" }}>
                            {currentIdx <= 24 ? t.handwriting.origins.greek : t.handwriting.origins.egyptian})
                          </Text>
                        </>
                      )}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <TouchableOpacity 
                    onPress={async () => {
                      try {
                        const soundPart = currentChar.sound[language];
                        const rules = currentChar.rule[language].split('|').map(r => `- ${t.handwriting.pronouncedAs} ${r.trim()}`).join('\n');
                        const catPart = currentChar.category !== "none" ? t.handwriting.categories[currentChar.category] : "";
                        const originPart = currentIdx <= 24 ? t.handwriting.origins.greek : t.handwriting.origins.egyptian;
                        const fullText = `${rules}\n\n(${t.handwriting.andItIs} ${catPart} ${originPart})`;
                        
                        await Clipboard.setStringAsync(fullText);
                        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        
                        setToastMsg(language === 'ar' ? "تم نسخ الشرح بنجاح ✅" : "Copied successfully ✅");
                        setShowSaveSuccess(true);
                        setTimeout(() => setShowSaveSuccess(false), 2000);
                      } catch (err) {
                        Alert.alert("Error", "Could not copy text");
                      }
                    }}
                    style={styles.copyBtn}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  >
                    <Feather name="copy" size={20} color={colors.gold} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>


            {/* Drawing Canvas */}
            <View style={styles.canvasSection}>
              <Text style={styles.drawHint}>{t.handwriting.drawInstruction}</Text>
              <View style={[styles.canvasContainer, { borderColor: colors.gold }]}>
                <View style={[styles.canvasWrapper, { backgroundColor: isDark ? "#0A0A0A" : "#FAFAFA" }]}>
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Text style={[styles.guideChar, { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}>
                      {isSmallMode ? getSmallChar(currentChar.char) : currentChar.char}
                    </Text>
                  </View>

                  <View {...panResponder.panHandlers} style={styles.canvas}>
                    <Svg width={CANVAS_SIZE} height={CANVAS_SIZE}>
                      <G>
                        {currentPaths.map((p, i) => (
                          <Path key={i} d={p} fill="none" stroke={colors.gold} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
                        ))}
                        {currentPath ? (
                          <Path d={currentPath} fill="none" stroke={colors.gold} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
                        ) : null}
                      </G>
                    </Svg>
                  </View>

                  {isAnalyzing && (
                    <View style={styles.overlay}>
                      <ActivityIndicator size="large" color={colors.gold} />
                      <Text style={[styles.overlayText, { color: colors.gold }]}>{t.handwriting.analyzing}</Text>
                    </View>
                  )}

                  {showResult && (
                    <Animated.View entering={ZoomIn} style={styles.overlay}>
                    <LinearGradient colors={accuracy >= 80 ? ["#4CAF50", "#2E7D32"] : ["#F44336", "#C62828"]} style={styles.resultBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 10 }}>
                        <Feather name={accuracy >= 80 ? "check-circle" : "alert-triangle"} size={32} color="#FFF" />
                        <Text style={[styles.resultValue, { marginVertical: 0 }]}>{accuracy}%</Text>
                      </View>
                      <Text style={styles.resultMsg}>{feedbackMsg}</Text>
                      <TouchableOpacity style={styles.retryBtn} onPress={() => setShowResult(false)}>
                        <Text style={styles.retryText}>{t.handwriting.close}</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                    </Animated.View>
                  )}
                </View>
              </View>
            </View>

            {/* Tools */}
            <View style={styles.toolsRow}>
              <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isDark ? "#333" : "#F5F5F5" }]} onPress={clearCanvas}>
                <Feather name="trash-2" size={18} color="#FF5252" />
                <Text style={[styles.toolText, { color: "#FF5252" }]}>{t.handwriting.clear}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.toolBtn, { backgroundColor: isDark ? "#333" : "#F5F5F5" }]} onPress={undoLastStroke}>
                <Feather name="rotate-ccw" size={18} color={colors.gold} />
                <Text style={[styles.toolText, { color: colors.gold }]}>{t.handwriting.undo}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.toolBtn, { backgroundColor: colors.gold }]} onPress={validateDrawing}>
                <Feather name="check" size={18} color="#FFF" />
                <Text style={[styles.toolText, { color: "#FFF" }]}>{t.handwriting.verify}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* 🔔 Custom Professional Save Toast */}
        {showSaveSuccess && (
          <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[styles.toastContainer, { top: insets.top + 70 }]}>
            <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.toastInner}>
              <Feather name="check-circle" size={20} color="#FFF" />
              <Text style={styles.toastText}>{toastMsg}</Text>
            </LinearGradient>
          </Animated.View>
        )}

        {/* 🖼️ Hidden Poster for Capturing */}
        <View style={styles.hiddenPosterContainer} pointerEvents="none">
          <View ref={posterRef} collapsable={false} style={styles.poster}>
            <LinearGradient colors={["#1A0101", "#0A0000"]} style={styles.posterGradient}>
              <View style={styles.posterFrame} />
              
              {/* Header */}
              <View style={[styles.pAbs, { top: 50, alignItems: 'center' }]}>
                <Text style={styles.posterAppName}>ⲬⲎⲘⲒ</Text>
                <Text style={styles.posterAppSub}>COPTIC DICTIONARY</Text>
              </View>

              {/* Main Letters */}
              <View style={[styles.pAbs, { top: 180, flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 30, direction: 'ltr' }]}>
                <Text style={styles.posterCharBig}>{currentChar.char}</Text>
                <Text style={styles.posterCharSmall}>{getSmallChar(currentChar.char)}</Text>
              </View>

              {/* Info Section */}
              <View style={[styles.pAbs, { top: 480, alignItems: 'center' }]}>
                <View style={styles.posterLine} />
                <Text style={styles.posterNameTitle}>{currentChar.name[language]} ({currentChar.sound[language]})</Text>
                
                <View style={{ width: 520, marginVertical: 10, paddingHorizontal: 20, alignItems: 'center' }}>
                  {currentChar.rule[language].split('|').map((part, idx) => (
                    <View key={idx} style={{ alignItems: 'center', marginBottom: 8, width: '100%' }}>
                      <Text style={[styles.posterRuleText, { textAlign: 'center', width: '100%', marginTop: 0 }]}>
                        {currentChar.char !== 'Ⲋ' && (
                          <Text style={{ color: colors.gold, fontFamily: "Cairo_700Bold" }}>{t.handwriting.pronouncedAs} </Text>
                        )}
                        {part.trim()}
                      </Text>
                    </View>
                  ))}
                </View>


                <Text style={[styles.posterOriginText, { marginTop: 10 }]}>
                  <Text style={{ color: "#888", fontSize: 16 }}>(</Text>
                  <Text style={{ color: "#D32F2F" }}>
                    {currentChar.category === "egyptian" 
                      ? (language === 'ar' ? "حرف مصري قبطي الأصل" : "Egyptian Coptic Origin")
                      : (currentChar.category !== "none" ? t.handwriting.categories[currentChar.category] + " " : "") + (currentIdx <= 24 ? t.handwriting.origins.greek : t.handwriting.origins.egyptian)}
                  </Text>
                  <Text style={{ color: "#888", fontSize: 16 }}>)</Text>
                </Text>
                
                <View style={styles.posterLine} />
              </View>

              {/* Footer */}
              <View style={[styles.pAbs, { bottom: 40, alignItems: "center" }]}>
                <View style={styles.posterQRContainer}>
                   <QRCode value={currentAppLink} size={90} backgroundColor="white" color="black" quietZone={2} />
                </View>
                <Text style={styles.posterBottomPromo}>{t.handwriting.promo}</Text>
                <Text style={styles.posterBottomCredit}>Ebram merzik</Text>
              </View>
            </LinearGradient>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 15, paddingBottom: 15, elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, zIndex: 10 },
  headerTitle: { fontSize: 18, fontFamily: "Cairo_700Bold" },
  closeBtn: { padding: 8 },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 5, padding: 8, borderRadius: 10, backgroundColor: "rgba(200,169,81,0.1)" },
  saveBtnText: { fontSize: 12, fontFamily: "Cairo_700Bold" },

  content: { padding: 15 },
  topNavRowCompact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15, paddingHorizontal: 10 },
  navBtnSmall: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.03)", justifyContent: "center", alignItems: "center" },
  letterInfoPill: { alignItems: "center", backgroundColor: "rgba(200,169,81,0.05)", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 25, borderWidth: 1, borderColor: "rgba(200,169,81,0.1)" },
  letterNameSmall: { fontSize: 20, fontFamily: "Cairo_700Bold" },
  progressRowSmall: { flexDirection: "row", alignItems: "center" },
  progressTextSmall: { fontSize: 12, color: "#888", fontFamily: "Cairo_600SemiBold" },
  copticFontSmall: { fontFamily: "CSAvaVeni-Regular", fontSize: 18 },

  detailBox: { padding: 10, borderRadius: 15, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#C8A951", minHeight: 80, maxHeight: 150, justifyContent: "center" },
  detailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  detailTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailLabel: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  categoryText: { color: "#FFF", fontSize: 12, fontFamily: "Cairo_700Bold" },
  ruleContent: { gap: 5 },
  ruleText: { fontSize: 16, fontFamily: "Cairo_600SemiBold", lineHeight: 24 },

  canvasSection: { alignItems: "center", marginBottom: 20 },
  drawHint: { fontSize: 14, fontFamily: "Cairo_700Bold", color: "#888", marginBottom: 10 },
  copyBtn: { padding: 8, borderRadius: 10, backgroundColor: "rgba(200,169,81,0.1)", justifyContent: "center", alignItems: "center" },
  canvasContainer: { padding: 5, borderRadius: 30, borderWidth: 3, borderStyle: "dashed", elevation: 15, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12 },
  canvasWrapper: { width: CANVAS_SIZE, height: CANVAS_SIZE, borderRadius: 25, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
  guideChar: { fontSize: CANVAS_SIZE * 0.8, fontFamily: "CSAvaVeni-Regular", textAlign: "center", lineHeight: CANVAS_SIZE },

  toolsRow: { flexDirection: "row", justifyContent: "center", gap: 12 },
  toolBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, elevation: 2 },
  toolText: { fontSize: 14, fontFamily: "Cairo_700Bold" },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.9)", justifyContent: "center", alignItems: "center", zIndex: 100, borderRadius: 25 },
  overlayText: { marginTop: 10, fontFamily: "Cairo_700Bold" },
  resultBox: { padding: 20, borderRadius: 25, alignItems: "center", width: "85%", elevation: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 15 },
  resultValue: { color: "#FFF", fontSize: 40, fontFamily: "Cairo_700Bold", textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 4 },
  resultMsg: { color: "#FFF", fontSize: 15, fontFamily: "Cairo_700Bold", textAlign: "center", marginBottom: 20, lineHeight: 22, paddingHorizontal: 5 },
  retryBtn: { backgroundColor: "#FFF", paddingHorizontal: 30, paddingVertical: 10, borderRadius: 12, elevation: 5 },
  retryText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#333" },

  toastContainer: { position: "absolute", left: 20, right: 20, zIndex: 9999 },
  toastInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 15, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  toastText: { color: "#FFF", fontFamily: "Cairo_700Bold", fontSize: 14 },

  hiddenPosterContainer: { position: "absolute", top: height + 500, left: 0, opacity: 0.01 },
  poster: { width: 600, height: 1000, backgroundColor: "#150505", overflow: 'hidden' },
  pAbs: { position: 'absolute', left: 0, right: 0 },
  posterGradient: { flex: 1, padding: 0 },
  posterFrame: { position: "absolute", top: 20, bottom: 20, left: 20, right: 20, borderWidth: 1.5, borderColor: "#B8934E", borderRadius: 30, opacity: 0.25 },
  
  posterAppName: { color: "#B8934E", fontSize: 60, fontFamily: "CSAvaVeni-Regular", textAlign: 'center' },
  posterAppSub: { color: "#FFF", fontSize: 16, fontFamily: "Cinzel_700Bold", letterSpacing: 4, marginTop: -5, textAlign: 'center' },
  
  posterCharBig: { color: "#FFF", fontSize: 270, fontFamily: "CSAvaVeni-Regular" },
  posterCharSmall: { color: "#B8934E", fontSize: 145, fontFamily: "CSAvaVeni-Regular" },
  
  posterLine: { width: 400, height: 1, backgroundColor: "#B8934E", opacity: 0.15, marginVertical: 12 },
  posterNameTitle: { color: "#FFF", fontSize: 46, fontFamily: "Cairo_700Bold", textAlign: 'center', width: 520 },
  posterRuleText: { color: "#DDD", fontSize: 19, fontFamily: "Cairo_400Regular", marginTop: 5, textAlign: 'center', width: 500, lineHeight: 28 },
  
  posterBadge: { paddingHorizontal: 15, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5, borderColor: "#D32F2F" },
  posterBadgeText: { color: "#D32F2F", fontSize: 20, fontFamily: "Cairo_700Bold" },
  
  posterOriginText: { color: "#E91E63", fontSize: 18, fontFamily: "Cairo_700Bold" },
  
  posterQRContainer: { padding: 10, backgroundColor: "#FFF", borderRadius: 15, marginBottom: 15 },
  posterBottomPromo: { color: "#B8934E", fontSize: 15, fontFamily: "Cairo_600SemiBold", opacity: 0.6 },
  posterBottomCredit: { color: "#B8934E", fontSize: 14, fontFamily: "Cairo_400Regular", opacity: 0.5, marginTop: 4 },

  headerTitleContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  headerLetterName: { fontSize: 22, fontFamily: "Cairo_700Bold" },
  copticFontHeader: { fontFamily: "CSAvaVeni-Regular", fontSize: 26 },

  modeToggleRowCompact: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: 3 },
  modeBtnCompact: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 8 },
  modeBtnTextCompact: { fontSize: 18 },
});
