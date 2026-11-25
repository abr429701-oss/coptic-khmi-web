import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang } from "@/contexts/LanguageContext";

interface EmptyStateProps {
  type: "empty" | "no-results" | "error" | "start-search";
  onRetry?: () => void;
  searchQuery?: string;
}

export function EmptyState({ type, onRetry, searchQuery }: EmptyStateProps) {
  const colors = useThemeColors();
  const { t } = useLang();
  const [displayStep, setDisplayStep] = useState(0); // 0: Tut, 1: Nefertiti, 2: Ankh, 3: Letter, 4: Dictionary logo
  const [letterIndex, setLetterIndex] = useState(0);

  const copticLetters = ["Ⲁ", "Ⲃ", "Ⲅ", "Ⲇ", "Ⲉ", "Ⲋ", "Ⲍ", "Ⲏ", "Ⲑ", "Ⲓ", "Ⲕ", "Ⲗ", "Ⲙ", "Ⲛ", "Ⲝ", "Ⲟ", "Ⲡ", "Ⲣ", "Ⲥ", "Ⲧ", "Ⲩ", "Ⲫ", "Ⲭ", "Ⲯ", "Ⲱ", "Ϣ", "Ϥ", "Ϧ", "Ϩ", "Ϫ", "Ϭ", "Ϯ"];

  useEffect(() => {
    if (type !== "start-search") return;

    const updateStep = () => {
      const now = new Date();
      const block = now.getHours() * 2 + Math.floor(now.getMinutes() / 30); // 0 - 47
      setDisplayStep(block % 5);
      setLetterIndex(Math.floor(block / 5) % copticLetters.length);
    };

    updateStep(); // حساب فوري عند الفتح

    // بيتحقق كل دقيقة لو الساعة اتغيرت
    const interval = setInterval(updateStep, 60000);
    return () => clearInterval(interval);
  }, [type]);

  if (type === "start-search") {
    return (
      <View style={styles.welcomeContainer}>
        <View style={styles.copticDecor}>
          <View style={[styles.decorLine, { backgroundColor: colors.primary + "30" }]} />
          {displayStep === 3 ? (
            <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 40, color: colors.primary, fontFamily: "CSAvaVeni-Regular" }}>
                {copticLetters[letterIndex]}
              </Text>
            </View>
          ) : displayStep === 4 ? (
            <Image
              source={require("@/assets/images/logo22.png")}
              style={styles.dictionaryLogo}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={
                displayStep === 0
                  ? require("@/assets/images/tut_mask_transparent.png")
                  : displayStep === 1
                    ? require("@/assets/images/nefertiti_transparent.png")
                    : require("@/assets/images/ankh_clean.png")
              }
              style={{
                width: 44,
                height: 44,
                transform: [{ scale: displayStep === 0 ? 1 : displayStep === 1 ? 1.35 : 1 }]
              }}
              resizeMode="contain"
            />
          )}
          <View style={[styles.decorLine, { backgroundColor: colors.primary + "30" }]} />
        </View>
        <Text style={[styles.welcomeTitle, { color: colors.text }]}>{t.welcome}</Text>
      </View>
    );
  }

  const configs = {
    empty: { icon: "book-open" as const, title: t.emptyDict, subtitle: t.emptyDictSub },
    "no-results": {
      icon: "search" as const,
      title: t.noResults,
      subtitle: searchQuery ? t.noResultsSub(searchQuery) : t.noResultsSubEmpty,
    },
    error: { icon: "wifi-off" as const, title: t.loadError, subtitle: t.loadErrorSub },
  };

  const config = configs[type as keyof typeof configs];

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "25" }]}>
        <Feather name={config.icon} size={32} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{config.title}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{config.subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 24,
    gap: 12,
    minHeight: 140,
  },
  welcomeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 16,
    minHeight: 120,
  },
  copticDecor: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  dictionaryLogo: { width: 42, height: 42 },
  decorLine: { width: 50, height: 1 },
  copticCross: { fontSize: 28, lineHeight: 34 },
  welcomeTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: 0.3 },
  iconContainer: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4, borderWidth: 1 },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
