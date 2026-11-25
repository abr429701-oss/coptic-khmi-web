import React from "react";
import { View, Text, StyleSheet, Platform, Image } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function HeaderLogo() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPadding + 12 }]}>
      <View style={styles.logoRow}>
        <View style={[styles.crossContainer, { borderColor: colors.gold }]}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={styles.iconImg}
          />
        </View>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.gold }]}>ⲭⲏⲙⲓ</Text>
          <Text style={[styles.subtitle, { color: "#FFFFFF" }]}>Coptic Dictionary</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  crossContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(200, 169, 81, 0.15)",
    overflow: "hidden",
  },
  iconImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: Platform.select({ android: undefined, default: "Inter_700Bold" }),
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: 2,
    marginTop: 2,
    opacity: 0.9,
  },
});
