import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLang } from "@/contexts/LanguageContext";
import { logActivity } from "@/hooks/useUserTracking";

const COPTIC_ROWS_LOWER = [
  ["ⲑ", "ⲱ", "ⲉ", "ⲣ", "ⲧ", "ⲯ", "ⲩ", "ⲓ", "ⲟ", "ⲡ", "ⲝ", "ϣ"],
  ["ⲁ", "ϭ", "ⲇ", "ϥ", "ⲅ", "ⲏ", "ϫ", "ⲕ", "ⲗ", "ϯ", "ϧ", "ϩ"],
  ["⬆", "ⲍ", "ⲭ", "ⲥ", "ⲫ", "ⲃ", "ⲛ", "ⲙ", "ⲋ", "◌̀", "⌫"],
];

const COPTIC_ROWS_UPPER = [
  ["Ⲑ", "Ⲱ", "Ⲉ", "Ⲣ", "Ⲧ", "Ⲯ", "Ⲩ", "Ⲓ", "Ⲟ", "Ⲡ", "Ⲝ", "Ϣ"],
  ["Ⲁ", "Ϭ", "Ⲇ", "Ϥ", "Ⲅ", "Ⲏ", "Ϫ", "Ⲕ", "Ⲗ", "Ϯ", "Ϧ", "Ϩ"],
  ["⬆", "Ⲍ", "Ⲭ", "Ⲥ", "Ⲫ", "Ⲃ", "Ⲛ", "Ⲙ", "Ⲋ", "◌̀", "⌫"],
];

interface CopticKeyboardProps {
  visible: boolean;
  onChar: (char: string) => void;
  onBackspace: () => void;
  onClose: () => void;
}

const KeyboardKey = React.memo(({ ch, onPress, isShift, keyBg, keyText, borderColor }: any) => {
  const isBackspace = ch === "⌫";
  const isShiftKey = ch === "⬆";

  return (
    <Pressable
      onPressIn={() => onPress(ch)}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: isBackspace ? "#5A0000" : isShiftKey ? (isShift ? "#C8A951" : "#3D0000") : keyBg,
          borderColor: isShiftKey && isShift ? "#F0D080" : borderColor,
          opacity: pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }]
        },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      {isBackspace ? (
        <Feather name="delete" size={19} color={keyText} />
      ) : isShiftKey ? (
        <Feather name="arrow-up" size={19} color={isShift ? "#000" : keyText} />
      ) : (
        <Text style={[styles.keyText, { color: keyText }]}>{ch}</Text>
      )}
    </Pressable>
  );
});

export function CopticKeyboard({ visible, onChar, onBackspace, onClose }: CopticKeyboardProps) {
  const { isDark } = useTheme();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const [isShift, setIsShift] = useState(false);

  const translateY = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start();
      logActivity("settings_change", undefined, "coptic_keyboard", undefined, "open");
    } else if (mounted) {
      Animated.timing(translateY, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible]);

  const bg = isDark ? "#1A0505" : "#2A0000";
  const keyBg = isDark ? "#2C0808" : "#3D0000";
  const keyText = "#F0D080";
  const borderColor = isDark ? "#4A1010" : "#5A0000";

  // Use a safer bottom inset to avoid overlap with Android navigation buttons
  const bottomPadding = Math.max(insets.bottom, 20);

  const handleKeyPress = useCallback((ch: string) => {
    if (ch === "⌫") {
      onBackspace();
    } else if (ch === "⬆") {
      setIsShift(prev => !prev);
    } else {
      const isMark = ch === "◌̀";
      onChar(isMark ? "̀" : ch);
      if (isShift && !isMark) setIsShift(false);
    }
  }, [isShift, onBackspace, onChar]);

  const rows = useMemo(() => {
    const currentRows = isShift ? COPTIC_ROWS_UPPER : COPTIC_ROWS_LOWER;
    return currentRows.map((row, ri) => (
      <View key={ri} style={[styles.row, ri === 2 && { marginBottom: 2 }]}>
        {row.map((ch) => (
          <KeyboardKey
            key={ch}
            ch={ch}
            isShift={isShift}
            onPress={handleKeyPress}
            keyBg={keyBg}
            keyText={keyText}
            borderColor={borderColor}
          />
        ))}
      </View>
    ));
  }, [isShift, handleKeyPress, keyBg, keyText, borderColor]);

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: bg,
            borderTopColor: borderColor,
            paddingBottom: bottomPadding,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Header - Slimmed down to save space */}
        <View style={styles.topBar}>
          <Text style={[styles.label, { color: keyText }]}>{t.keyboard.title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.6}>
            <Feather name="chevron-down" size={22} color={keyText} />
          </TouchableOpacity>
        </View>

        {/* Keys */}
        {rows}

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
    borderTopWidth: 1.5,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 4,
    paddingTop: 0,
    direction: "ltr",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 15,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    opacity: 0.9,
    letterSpacing: 0.6,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
  },
  row: {
    flexDirection: "row",
    direction: "ltr",
    justifyContent: "center",
    marginBottom: 8,
    gap: 5,
  },
  key: {
    flex: 1,
    height: 60,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.2,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  keyText: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: "CSAvaVeni-Regular"
  },
});