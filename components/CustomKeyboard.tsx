import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  ScrollView,
  Keyboard,
  BackHandler,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang, type Lang } from "@/contexts/LanguageContext";

interface CustomKeyboardProps {
  visible: boolean;
  onChar: (char: string) => void;
  onBackspace: () => void;
  onClose: () => void;
  onLangChange?: (lang: KeyboardLang) => void;
  initialLang?: KeyboardLang;
}

export type KeyboardLang = "ar" | "en" | "gr" | "cb" | "he" | "sy";

const KEYBOARD_LAYOUTS: Record<KeyboardLang, string[][]> = {
  ar: [
    ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د"],
    ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط", "ذ"],
    ["ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ", "أ", "إ", "آ"],
    [" ", "⌫"],
  ],
  en: [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
    [" ", "⌫"],
  ],
  gr: [
    ["ς", "ω", "ε", "ρ", "τ", "υ", "θ", "ι", "ο", "π"],
    ["α", "σ", "δ", "φ", "γ", "η", "ξ", "κ", "λ"],
    ["ζ", "χ", "ψ", "β", "ν", "μ"],
    [" ", "⌫"],
  ],
  cb: [
    ["ⲑ", "ⲱ", "ⲉ", "ⲣ", "ⲧ", "ⲯ", "ⲩ", "ⲓ", "ⲟ", "ⲡ", "ⲝ"],
    ["ⲁ", "ⲥ", "ⲇ", "ϥ", "ⲅ", "ⲏ", "ϫ", "ⲕ", "ⲗ", "ϯ", "ϣ"],
    ["ϧ", "ϩ", "ⲍ", "ⲭ", "ⲃ", "ⲛ", "ⲙ", "ϭ", "ⲫ", "ⲋ"],
    [" ", "⌫"],
  ],
  he: [
    ["ק", "ר", "א", "ט", "ו", "ן", "ם", "פ"],
    ["ש", "ד", "ג", "כ", "ע", "י", "ח", "ל", "ך", "ף"],
    ["ז", "ה", "ס", "ב", "נ", "מ", "צ", "ת", "ץ"],
    [" ", "⌫"],
  ],
  sy: [
    ["ܩ", "ܪ", "ܫ", "ܬ", "ܥ", "ܦ", "ܨ"],
    ["ܐ", "ܒ", "ܓ", "ܕ", "ܗ", "ܘ", "ܙ", "ܚ", "ܛ", "ܝ"],
    ["ܟ", "ܠ", "ܡ", "ܢ", "ܣ"],
    [" ", "⌫"],
  ],
};

const Key = React.memo(({ ch, onPress, isDark, keyBg, keyText, isCoptic, isBackspace, isSpace }: any) => (
  <TouchableOpacity
    style={[
      styles.key,
      {
        backgroundColor: isBackspace ? (isDark ? "#3A1A1A" : "#FEE2E2") : keyBg,
        flex: isSpace ? 1.5 : 1,
      },
    ]}
    onPress={() => onPress(ch)}
    activeOpacity={0.5}
  >
    {isBackspace ? (
      <Feather name="delete" size={20} color={isBackspace ? "#B91C1C" : keyText} />
    ) : isSpace ? (
      <View style={styles.spaceBar} />
    ) : (
      <Text
        style={[
          styles.keyText,
          { color: keyText },
          isCoptic && { fontFamily: "CSAvaVeni-Regular", fontSize: 22 },
        ]}
      >
        {ch}
      </Text>
    )}
  </TouchableOpacity>
));

export function CustomKeyboard({
  visible,
  onChar,
  onBackspace,
  onClose,
  onLangChange,
  initialLang = "ar",
}: CustomKeyboardProps) {
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const { t } = useLang();
  const insets = useSafeAreaInsets();

  const [currentLang, setCurrentLang] = useState<KeyboardLang>(initialLang);
  const [mounted, setMounted] = useState(false);
  const translateY = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setMounted(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      if (onLangChange) onLangChange(currentLang);

      const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
        onClose();
        return true;
      });
      return () => backHandler.remove();
    } else if (mounted) {
      Animated.timing(translateY, {
        toValue: 400,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible]);

  const handleLangChange = (l: KeyboardLang) => {
    setCurrentLang(l);
    if (onLangChange) onLangChange(l);
  };

  if (!mounted) return null;

  const safeBottom = Math.max(insets.bottom, 12);
  const currentLayout = KEYBOARD_LAYOUTS[currentLang];

  const bgColor = colors.card;
  const keyBg = colors.background;
  const keyText = colors.text;
  const borderColor = colors.separator;

  const toggleLanguage = () => {
    const langs: KeyboardLang[] = ["ar", "en", "gr", "cb", "he", "sy"];
    const currentIndex = langs.indexOf(currentLang);
    const nextIndex = (currentIndex + 1) % langs.length;
    setCurrentLang(langs[nextIndex]);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: bgColor,
            borderTopColor: borderColor,
            paddingBottom: safeBottom,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Top Bar with Close Button only */}
        <View style={styles.topBar}>
          <View />
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="chevron-down" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Language Selector Chips - Single Row */}
        <View style={styles.langSelector}>
          {(["ar", "cb", "en", "gr", "he", "sy"] as KeyboardLang[]).map((l) => (
            <TouchableOpacity
              key={l}
              onPress={() => handleLangChange(l)}
              style={[
                styles.langChip,
                currentLang === l && { backgroundColor: "rgba(200,169,81,0.2)", borderColor: colors.copticText },
              ]}
            >
              <Text
                style={[
                  styles.langChipText,
                  { color: currentLang === l ? colors.copticText : colors.textSecondary },
                  currentLang === l && { fontFamily: "Inter_700Bold" },
                ]}
              >
                {t.bible.keyboard[l]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Rows */}
        <View style={styles.keyboardArea}>
          {currentLayout.map((row, ri) => (
            <View key={ri} style={[styles.row, { direction: 'ltr' }]}>
              {row.map((ch, ci) => {
                const isBackspace = ch === "⌫";
                const isSpace = ch === " ";
                return (
                  <Key
                    key={`${ri}-${ci}`}
                    ch={ch}
                    isDark={isDark}
                    keyBg={keyBg}
                    keyText={keyText}
                    isCoptic={currentLang === "cb"}
                    isBackspace={isBackspace}
                    isSpace={isSpace}
                    onPress={(val: string) => {
                      if (isBackspace) onBackspace();
                      else onChar(val);
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    opacity: 0.6,
  },
  closeBtn: {
    padding: 4,
  },
  langSelector: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 4,
  },
  langChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  langChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  keyboardArea: {
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 6,
    gap: 4,
  },
  key: {
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  keyText: {
    fontSize: 19,
    fontFamily: Platform.OS === "ios" ? "System" : "Inter_500Medium",
  },
  spaceBar: {
    width: "35%",
    height: 4,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 2,
  },
});