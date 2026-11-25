import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  BackHandler,
  Keyboard,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as MediaLibrary from "expo-media-library";
import ViewShot, { captureRef } from "react-native-view-shot";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";
import QRCode from 'react-native-qrcode-svg';

import { generateQRMatrix } from "@/utils/qrcodegen";
import { useTheme } from "@/contexts/ThemeContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang } from "@/contexts/LanguageContext";

import { logActivity } from "@/hooks/useUserTracking";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import AsyncStorage from '@react-native-async-storage/async-storage';




const englishMap: Record<string, string> = {
  'a': 'ⲁ', 'b': 'ⲃ', 'c': 'ⲕ', 'd': 'ⲇ', 'e': 'ⲉ',
  'f': 'ϥ', 'g': 'ϫ', 'h': 'ϩ', 'i': 'ⲓ', 'j': 'ϫ',
  'k': 'ⲕ', 'l': 'ⲗ', 'm': 'ⲙ', 'n': 'ⲛ', 'o': 'ⲟ',
  'p': 'ⲡ', 'q': 'ⲕ', 'r': 'ⲣ', 's': 'ⲥ', 't': 'ⲧ',
  'u': 'ⲟⲩ', 'v': 'ⲃ', 'w': 'ⲱ', 'x': 'ⲝ', 'y': 'ⲓ', 'z': 'ⲍ'
};

const multiMap: Record<string, string> = {
  'sh': 'ϣ',
  'ch': 'ⲭ',
  'ph': 'ⲫ',
  'th': 'ⲑ',
  'ps': 'ⲯ',
  'ks': 'ⲝ',
  'gh': 'ⲅ',
  'kh': 'ϧ',
  'ea': 'ⲏ',
};

function transliterate(text: string): string {
  if (!text) return "";
  let result = "";
  let i = 0;
  
  while (i < text.length) {
    const char = text[i];
    const nextChar = i < text.length - 1 ? text[i + 1] : "";
    const lowerPair = (char + nextChar).toLowerCase();
    const lowerChar = char.toLowerCase();

    // Check for multi-letter combinations (e.g., "sh", "ch")
    if (multiMap[lowerPair]) {
      const mapped = multiMap[lowerPair];
      const isUpper = char === char.toUpperCase() && char !== char.toLowerCase();
      result += isUpper ? mapped.toUpperCase() : mapped;
      i += 2;
      continue;
    }

    // Check for single English letter
    if (englishMap[lowerChar]) {
      let mapped = englishMap[lowerChar];
      
      // Special logic for 'c' based on lookahead
      if (lowerChar === 'c') {
        const nextLower = nextChar.toLowerCase();
        if (['e', 'i', 'y'].includes(nextLower)) {
          mapped = 'ⲥ';
        } else if (['l', 'a', 'o', 'u', 'r'].includes(nextLower)) {
          mapped = 'ⲕ';
        }
      }

      const isUpper = char === char.toUpperCase() && char !== char.toLowerCase();
      result += isUpper ? mapped.toUpperCase() : mapped;
      i++;
      continue;
    }

    // Pass through spaces or unknown non-alphanumeric chars
    if (!/[a-zA-Z]/.test(char)) {
      result += char;
    }
    i++;
  }
  return result;
}

export function NameInCopticScreen() {
  const { isDark } = useTheme();
  const { t } = useLang();
  const [name, setName] = useState("");
  const copticName = transliterate(name);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const viewRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  
  const insets = useSafeAreaInsets();
  const bgColor = isDark ? "#140303" : "#F5F5F5";
  const cardBg = isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF";
  const textColor = isDark ? "#FFFFFF" : "#333333";
  
  const colors = useThemeColors();
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [isShifted, setIsShifted] = useState(true);
  const { currentAppLink } = useAppUpdate();

  useEffect(() => {

    const handleBack = () => {

      if (showKeyboard) {
        setShowKeyboard(false);
        return true; 
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => sub.remove();
  }, [showKeyboard]);

  useEffect(() => {
    if (showKeyboard) {
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    }
  }, [showKeyboard]);

  // Log when keyboard is dismissed (finished typing)
  useEffect(() => {
    if (!showKeyboard && name.trim()) {
      logActivity("name_coptic", undefined, JSON.stringify({ en: name, cop: copticName }));
    }
  }, [showKeyboard]);

  const nameRef = useRef(name);
  const copRef = useRef(copticName);
  useEffect(() => {
    nameRef.current = name;
    copRef.current = copticName;
  }, [name, copticName]);

  useEffect(() => {
    if (!name.trim()) return;

    // Debounce logging so it doesn't fire on every keystroke
    const timer = setTimeout(() => {
      logActivity("name_coptic", undefined, JSON.stringify({ en: name, cop: copticName }));
    }, 2000);

    return () => clearTimeout(timer);
  }, [name, copticName]);

  // Ensure logging on unmount (exiting the screen)
  useEffect(() => {
    return () => {
      if (nameRef.current.trim()) {
        logActivity("name_coptic", undefined, JSON.stringify({ en: nameRef.current, cop: copRef.current }));
      }
    };
  }, []);

  const handleNameChange = (val: string) => {
    const filtered = val.replace(/[^a-zA-Z ]/g, "");
    const formatted = filtered
      .split(" ")
      .map((word) => {
        if (word.length === 0) return "";
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");

    setName(formatted);
  };

  const insertKeyboardChar = (char: string) => {
    handleNameChange(name + (isShifted ? char.toUpperCase() : char));
    setIsShifted(false);
  };

  const insertKeyboardSpace = () => {
    handleNameChange(name + " ");
    setIsShifted(true);
  };

  const handleKeyboardBackspace = () => {
    const nextName = name.slice(0, -1);
    handleNameChange(nextName);
    setIsShifted(!nextName || nextName.endsWith(" "));
  };

  const handleCopy = async () => {
    if (!copticName) return;
    const appLink = currentAppLink || "https://play.google.com/store/apps/details?id=com.khmi.coptic";
    const promo = `${t.nameInCoptic.copyPromoPrefix}${appLink}`;
    const fullText = `${copticName}\n\n${promo}`;

    try {
      await Clipboard.setStringAsync(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Log to Google Sheet
      logActivity("name_coptic", undefined, JSON.stringify({ en: name, cop: copticName }));
    } catch (err) {
      console.warn("Clipboard error", err);
    }
  };

  const handleSaveImage = async () => {
    if (!copticName || isSaving) return;
    setIsSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        alert(t.toast.saveFailedSub);
        setIsSaving(false);
        return;
      }

      const uri = await captureRef(viewRef, {
        format: "png",
        quality: 1,
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      logActivity("save_name_image", undefined, `Name: ${name}`);
    } catch (err) {
      console.warn("Capture error", err);
      alert(t.toast.captureError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      <ScrollView 
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll, 
          { paddingBottom: insets.bottom + 20 }, 
          showKeyboard && { padding: 10, paddingTop: 10, paddingBottom: insets.bottom + 12, flexGrow: 1 }
        ]}
        scrollEnabled={!showKeyboard}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={[styles.header, showKeyboard && { marginTop: 0, marginBottom: 0 }]}>
          {!showKeyboard && (
            <>
              <View style={styles.iconCircle}>
                <Feather name="edit-3" size={26} color="#C8A951" />
              </View>
              <Text style={[styles.title, { color: textColor }]}>
                {t.nameInCoptic.title}
              </Text>
              <Text style={styles.description}>
                {t.nameInCoptic.description}
              </Text>
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }, showKeyboard && { padding: 10, marginBottom: 10, marginTop: 0 }]}>
          <TextInput
            style={[styles.input, { color: textColor }, showKeyboard && { fontSize: 18, paddingVertical: 4 }]}
            placeholder={t.nameInCoptic.placeholder}
            placeholderTextColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
            value={name}
            onChangeText={handleNameChange}
            contextMenuHidden
            autoCapitalize="words"
            autoCorrect={false}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setShowKeyboard(true);
              Keyboard.dismiss();
            }}
            onPressIn={() => {
              setShowKeyboard(true);
              Keyboard.dismiss();
            }}
          />
        </View>

        {copticName.length > 0 && (
          <View style={[
            styles.resultCard, 
            { backgroundColor: "rgba(139,0,0,0.05)", borderColor: "rgba(139,0,0,0.2)" },
            showKeyboard && { padding: 12, marginBottom: 0 }
          ]}>
            {!showKeyboard ? (
              /* ViewShot Container (Premium Card View) */
              <View collapsable={false} ref={viewRef} style={styles.captureWrapper}>
                <LinearGradient
                  colors={isDark ? ["#1A0505", "#140303"] : ["#FFFFFF", "#F9F9F9"]}
                  style={[styles.captureContainer, { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" }]}
                >
                  <View style={styles.captureContent}>
                    <Text 
                      style={styles.copticTextCapture}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.3}
                    >
                      {copticName}
                    </Text>
                    
                    <View style={styles.captureFooter}>
                      <View style={[styles.captureLine, { backgroundColor: "#8B0000" }]} />
                      <Text style={[styles.captureWatermark, { fontFamily: "CSAvaVeni-Regular", fontSize: 20 }]}>ⲭⲏⲙⲓ</Text>
                      <View style={[styles.captureLine, { backgroundColor: "#8B0000" }]} />
                    </View>

                    <View style={styles.captureQrRow}>
                       <View style={{ padding: 6, backgroundColor: '#fff', borderRadius: 8, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 }}>
                          <QRCode
                            value={currentAppLink || "https://play.google.com/store/apps/details?id=com.khmi.coptic"}

                            size={90}
                            color="#000000"
                            backgroundColor="#ffffff"
                          />
                        </View>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ) : (
              /* Compact Preview (Simple Text) */
              <View style={styles.compactPreview}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                  <Text 
                    style={[styles.copticTextPreview, { color: "#8B0000", flex: 1 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.3}
                  >
                    {copticName}
                  </Text>
                  <View style={{ padding: 6, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}>
                    <QRCode
                      value={currentAppLink || "https://play.google.com/store/apps/details?id=com.khmi.coptic"}

                      size={52}
                      color="#000000"
                      backgroundColor="#ffffff"
                    />
                  </View>
                </View>
                {/* Hidden ViewShot for capture while keyboard is open if needed, 
                    but usually user closes keyboard before saving. 
                    If they save while keyboard is open, we need a hidden ref. */}
                <View style={{ position: 'absolute', opacity: 0, left: -5000 }}>
                   <View collapsable={false} ref={viewRef} style={[styles.captureWrapper, { width: 350 }]}>
                    <LinearGradient
                      colors={isDark ? ["#1A0505", "#140303"] : ["#FFFFFF", "#F9F9F9"]}
                      style={styles.captureContainer}
                    >
                      <View style={styles.captureContent}>
                        <Text 
                          style={styles.copticTextCapture}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.3}
                        >
                          {copticName}
                        </Text>
                        <View style={styles.captureFooter}>
                          <View style={[styles.captureLine, { backgroundColor: "#8B0000" }]} />
                          <Text style={[styles.captureWatermark, { fontFamily: "CSAvaVeni-Regular", fontSize: 20 }]}>ⲭⲏⲙⲓ</Text>
                          <View style={[styles.captureLine, { backgroundColor: "#8B0000" }]} />
                        </View>

                        <View style={styles.captureQrRow}>
                          <View style={{ padding: 6, backgroundColor: '#fff', borderRadius: 8 }}>
                             <QRCode
                              value={currentAppLink || "https://play.google.com/store/apps/details?id=com.khmi.coptic"}

                              size={90}
                              color="#000000"
                              backgroundColor="#ffffff"
                            />
                          </View>
                        </View>
                      </View>
                    </LinearGradient>
                  </View>
                </View>
              </View>
            )}
            
            <View style={[styles.actionRow, showKeyboard && { marginTop: 5 }]}>
              <TouchableOpacity 
                style={[styles.copyBtn, showKeyboard && { paddingVertical: 8, paddingHorizontal: 16 }]} 
                onPress={handleCopy}
                activeOpacity={0.7}
              >
                <Feather name={copied ? "check" : "copy"} size={16} color="#fff" />
                <Text style={[styles.copyBtnText, showKeyboard && { fontSize: 14 }]}>
                  {copied ? t.nameInCoptic.copied : t.nameInCoptic.copy}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.saveBtn, showKeyboard && { paddingVertical: 8, paddingHorizontal: 16 }, { backgroundColor: colors.copticText + "20", borderColor: colors.copticText }]} 
                onPress={handleSaveImage}
                activeOpacity={0.7}
                disabled={isSaving}
              >
                <Feather name={saved ? "check" : "image"} size={16} color={colors.copticText} />
                <Text style={[styles.saveBtnText, { color: colors.copticText }, showKeyboard && { fontSize: 14 }]}>
                  {saved ? t.word.saved : t.word.save}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Standard left-to-right QWERTY keyboard */}
      {showKeyboard && (
        <View style={[
          styles.keyboard, 
          { 
            backgroundColor: colors.card,
            borderTopColor: colors.separator,
            paddingBottom: insets.bottom > 0 ? insets.bottom : (Platform.OS === "ios" ? 20 : 8)
          }
        ]}>
          <View style={styles.handle}>
            <View style={[styles.handleBar, { backgroundColor: colors.separator }]} />
          </View>
          
          <View style={styles.topBar}>
            <View style={[styles.langBtn, { borderColor: colors.copticText }]}>
              <Text style={[styles.langText, { color: colors.copticText }]}>QWERTY</Text>
            </View>
            <TouchableOpacity onPress={() => setShowKeyboard(false)} style={styles.closeBtn} activeOpacity={0.7}>
              <Feather name="chevron-down" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Row 1: Q-P (QWERTY) */}
          <View style={styles.keyRow}>
            {['q','w','e','r','t','y','u','i','o','p'].map((k) => (
              <TouchableOpacity 
                key={k} 
                style={[styles.key, { backgroundColor: colors.chipBg, borderColor: colors.separator }]} 
                onPress={() => insertKeyboardChar(k)}
                activeOpacity={0.6}
              >
                <Text style={[styles.keyText, { color: colors.text }]}>{isShifted ? k.toUpperCase() : k}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Row 2: A-L (QWERTY) */}
          <View style={[styles.keyRow, { paddingHorizontal: 15 }]}>
            {['a','s','d','f','g','h','j','k','l'].map((k) => (
              <TouchableOpacity 
                key={k} 
                style={[styles.key, { backgroundColor: colors.chipBg, borderColor: colors.separator }]} 
                onPress={() => insertKeyboardChar(k)}
                activeOpacity={0.6}
              >
                <Text style={[styles.keyText, { color: colors.text }]}>{isShifted ? k.toUpperCase() : k}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Row 3: Shift + Z-M (QWERTY) + Delete */}
          <View style={[styles.keyRow]}>
            <TouchableOpacity 
              style={[styles.key, { backgroundColor: colors.chipBg, borderColor: colors.separator, flex: 1.3 }, isShifted && { backgroundColor: colors.copticText + "20", borderColor: colors.copticText }]} 
              onPress={() => setIsShifted((current) => !current)}
              activeOpacity={0.6}
            >
              <Feather name="arrow-up" size={20} color={isShifted ? colors.copticText : textColor} />
            </TouchableOpacity>

            {['z','x','c','v','b','n','m'].map((k) => (
              <TouchableOpacity 
                key={k} 
                style={[styles.key, { backgroundColor: colors.chipBg, borderColor: colors.separator }]} 
                onPress={() => insertKeyboardChar(k)}
                activeOpacity={0.6}
              >
                <Text style={[styles.keyText, { color: colors.text }]}>{isShifted ? k.toUpperCase() : k}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity 
              style={[styles.key, { backgroundColor: colors.chipBg, borderColor: colors.separator, flex: 1.3 }]} 
              onPress={handleKeyboardBackspace}
              activeOpacity={0.6}
            >
              <Feather name="delete" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Row 4: Space Bar (مسافة) */}
          <View style={[styles.keyRow, { paddingHorizontal: 10 }]}>
            <TouchableOpacity 
              style={[styles.key, { backgroundColor: colors.chipBg, borderColor: colors.separator, flex: 1 }]} 
              onPress={insertKeyboardSpace}
              activeOpacity={0.6}
            >
              <Text style={[styles.keyText, { color: colors.text, fontSize: 17 }]}>مسافة</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
    maxWidth: 300,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(200,169,81,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    fontSize: 13,
    color: "#888888",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  input: {
    fontSize: 18,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  resultCard: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
  },
  copticText: {
    fontSize: 36,
    fontFamily: "Inter_600SemiBold",
    color: "#8B0000",
    textAlign: "center",
    marginBottom: 20,
  },
  copticTextCapture: {
    fontSize: 68,
    fontFamily: "CSAvaVeni-Regular",
    color: "#8B0000",
    textAlign: "center",
    marginVertical: 40,
    letterSpacing: 2,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8B0000",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  copyBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  captureWrapper: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 10,
  },
  captureContainer: {
    padding: 40,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  captureContent: {
    alignItems: "center",
    width: "100%",
  },
  captureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginBottom: 10,
  },
  captureLine: {
    height: 1,
    flex: 1,
    opacity: 0.3,
  },
  captureAppTitle: {
    fontSize: 14,
    color: "#8B0000",
    fontFamily: "Inter_700Bold",
    opacity: 0.8,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  captureFooter: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(139,0,0,0.2)",
    gap: 15,
  },
  captureNameEn: {
    fontSize: 16,
    color: "#888",
    fontFamily: "Inter_500Medium",
  },
  captureWatermark: {
    fontSize: 14,
    color: "#8B0000",
    opacity: 0.6,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  keyboard: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
    direction: "ltr",
  },
  handle: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  langBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  langText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    opacity: 0.7,
  },
  closeBtn: {
    padding: 6,
  },
  keyRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignSelf: "stretch",
    marginBottom: 4,
    gap: 3,
    flexWrap: "nowrap",
    direction: "ltr",
  },
  key: {
    minWidth: 0,
    height: 40,
    flex: 1,
    paddingHorizontal: 0,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  keyText: {
    fontSize: 20,
    fontFamily: Platform.select({ android: undefined, default: "Inter_500Medium" }),
  },
  compactPreview: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  copticTextPreview: {
    fontSize: 30,
    fontFamily: "CSAvaVeni-Regular",
    textAlign: "center",
  },
   captureQrRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    opacity: 0.9,
  },
});
