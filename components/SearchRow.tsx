import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  Keyboard,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang } from "@/contexts/LanguageContext";

interface SearchRowProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onFilterPress: () => void;
  showCoptic: boolean;
  onToggleCoptic: () => void;
  showFilterButton?: boolean;
  showCopticKeyboard?: boolean;
  showClearButton?: boolean;
  showSearchLogo?: boolean;
}

export function SearchRow({
  value,
  onChangeText,
  onClear,
  onFilterPress,
  showCoptic,
  onToggleCoptic,
  showFilterButton = true,
  showCopticKeyboard = true,
  showClearButton = true,
  showSearchLogo = true,
}: SearchRowProps) {
  const colors = useThemeColors();
  const { t, isRTL } = useLang();
  const { remoteSettings } = useAppConfig();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  const focusAnim = useRef(new Animated.Value(0)).current;
  const copticScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isFocused]);

  const boxBorderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.cardBorder, colors.primary],
  });
  const boxBackgroundColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.card, colors.cardItem],
  });
  const boxScale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.99, 1],
  });
  const boxShadowOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.2],
  });
  const boxShadowRadius = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 16],
  });

  const handleCoptic = () => {
    Animated.sequence([
      Animated.timing(copticScale, { toValue: 0.88, duration: 90, useNativeDriver: true }),
      Animated.timing(copticScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    // ط¥ط°ط§ ط³ظٹطھظ… ظپطھط­ ط§ظ„ظƒظٹط¨ظˆط±ط¯ ط§ظ„ظ‚ط¨ط·ظٹطŒ ظ†ط؛ظ„ظ‚ ط§ظ„ط¹ط§ط¯ظٹ
    if (!showCoptic) {
      Keyboard.dismiss();
    }

    onToggleCoptic();
  };

  function isCopticText(text: string): boolean {
    return /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF]/.test(text);
  }

  const copticInput = isCopticText(value);

  const getTextDirection = (text: string, fallback = isRTL) => {
    // Follow the most recently typed strong character so a mobile keyboard language
    // switch changes direction immediately, just as the in-app Coptic keyboard does.
    for (let index = text.length - 1; index >= 0; index -= 1) {
      const character = text[index];
      if (/[\u0590-\u08FF\uFB1D-\uFEFC]/.test(character)) return true;
      if (/[A-Za-z\u2C80-\u2CFF\u0370-\u03FF]/.test(character)) return false;
    }
    return fallback;
  };
  const inputIsRTL = getTextDirection(value);
  const inputTextAlign = inputIsRTL ? "right" : "left";
  const inputWritingDirection = inputIsRTL ? "rtl" : "ltr";
  const inputFontFamily = copticInput
    ? "CSAvaVeni-Regular"
    : inputIsRTL
      ? "cairoNormal"
      : "Inter_500Medium";
  const inputFontSize = copticInput ? 24 : 16;
  const directionalPlaceholder = `${inputIsRTL ? "\u2067" : "\u2066"}${t.searchPlaceholder}\u2069`;
  const applyNativeDirection = (rtl: boolean) => {
    // Desktop/web: setNativeProps does not exist on DOM inputs; set style directly.
    const el: any = inputRef.current;
    if (!el) return;
    if (typeof el.setNativeProps === "function") {
      el.setNativeProps({
        style: { textAlign: rtl ? "right" : "left", writingDirection: rtl ? "rtl" : "ltr" },
      });
    } else if (el.style) {
      el.style.textAlign = rtl ? "right" : "left";
      el.style.direction = rtl ? "rtl" : "ltr";
    }
  };
  const handleNativeKeyPress = ({ nativeEvent }: any) => {
    const key = String(nativeEvent?.key || "");
    if (/[\u0590-\u08FF\uFB1D-\uFEFC]/.test(key)) {
      applyNativeDirection(true);
    } else if (/[A-Za-z\u2C80-\u2CFF\u0370-\u03FF]/.test(key)) {
      applyNativeDirection(false);
    }
  };
  const handleInputChange = (text: string) => {
    applyNativeDirection(getTextDirection(text));
    onChangeText(text);
  };
  const handleClear = () => {
    inputRef.current?.clear();
    onClear();
    requestAnimationFrame(() => {
      applyNativeDirection(isRTL);
      inputRef.current?.focus();
    });
  };
  const webStyle =
    Platform.OS === "web"
      ? ({
        outline: "none",
        outlineWidth: 0,
        caretColor: "#C8A951",
        direction: inputIsRTL ? "rtl" : "ltr",
        unicodeBidi: "embed",
      } as any)
      : {};

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background, borderBottomColor: colors.separator }]}>
      <Animated.View
        style={[
          styles.box,
          {
            borderColor: boxBorderColor as any,
            backgroundColor: boxBackgroundColor as any,
            borderWidth: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }),
            shadowColor: colors.primary,
            shadowOpacity: boxShadowOpacity,
            shadowRadius: boxShadowRadius,
            transform: [{ scale: boxScale }],
          },
        ]}
      >
        {/* ط£ظٹظ‚ظˆظ†ط© ط§ظ„ط¨ط­ط« */}
        {showSearchLogo && <TouchableOpacity
          onPress={() => inputRef.current?.focus()}
          style={[styles.searchIconBtn, { backgroundColor: colors.chipBg }]}
          activeOpacity={0.65}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Image
            source={require("@/assets/images/logo22.png")}
            style={styles.searchLogo}
            resizeMode="contain"
          />
        </TouchableOpacity>}

        {/* ط­ظ‚ظ„ ط§ظ„ط¥ط¯ط®ط§ظ„ */}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              color: colors.text,
              textAlign: inputTextAlign,
              writingDirection: inputWritingDirection,
              fontFamily: inputFontFamily,
              fontSize: inputFontSize,
            },
            copticInput && {
              lineHeight: 32,
              textAlignVertical: "center",
              includeFontPadding: false,
              paddingVertical: 0,
            },
            webStyle,
          ]}
          value={value}
          onChangeText={handleInputChange}
          onKeyPress={handleNativeKeyPress}
          placeholder={directionalPlaceholder}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          selectionColor={colors.primary}
          underlineColorAndroid="transparent"
          showSoftInputOnFocus={!showCoptic}
          maxLength={60}
          numberOfLines={1}
        />

        {/* ط²ط± ط§ظ„ظ…ط³ط­ */}
        {showClearButton && value.length > 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={remoteSettings.labels.button_search_clear.trim() || (isRTL ? "مسح البحث" : "Clear search")}
            onPress={handleClear}
            style={[styles.clearBtn, { backgroundColor: colors.chipBg }]}
            activeOpacity={0.65}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {/* ظپط§طµظ„ */}
        {(showCopticKeyboard || showFilterButton) && <View style={[styles.divider, { backgroundColor: colors.separator }]} />}

        {/* ط²ط± ط§ظ„ظƒظٹط¨ظˆط±ط¯ ط§ظ„ظ‚ط¨ط·ظٹ */}
        {showCopticKeyboard && <Animated.View style={{ transform: [{ scale: copticScale }] }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={remoteSettings.labels.button_search_keyboard.trim() || (isRTL ? "لوحة المفاتيح القبطية" : "Coptic keyboard")}
            onPress={handleCoptic}
            style={[styles.innerBtn, { backgroundColor: showCoptic ? colors.primary + "18" : colors.chipBg }]}
            activeOpacity={0.75}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[styles.copticLabel, {
              color: colors.copticText,
              fontFamily: "CSAvaVeni-Regular",
              fontSize: 16
            }]}>
              ⲀⲂ
            </Text>
          </TouchableOpacity>
        </Animated.View>}

        {/* ط²ط± ط§ظ„ظپظ„طھط± */}
        {showFilterButton && <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={remoteSettings.labels.button_search_filter.trim() || (isRTL ? "تصفية البحث" : "Search filters")}
          onPress={onFilterPress}
          style={[styles.innerBtn, { backgroundColor: colors.chipBg }]}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Feather name="sliders" size={17} color={colors.textSecondary} />
        </TouchableOpacity>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 0,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    height: 60,
    paddingLeft: 7,
    paddingRight: 10,
    overflow: "visible",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  searchIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: 2,
  },
  searchLogo: {
    width: 30,
    height: 30,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    paddingVertical: 0,
    textAlignVertical: "center",
    height: "100%",
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 2,
  },
  divider: {
    width: 0.8,
    height: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 7,
    flexShrink: 0,
  },
  innerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    flexShrink: 0,
  },
  copticLabel: {
    fontSize: 16,
    letterSpacing: 0.5,
  },
});

import { useAppConfig } from "@/contexts/AppConfigContext";
