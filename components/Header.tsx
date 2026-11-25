import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLang } from "@/contexts/LanguageContext";
import { CopticDateBar } from "@/components/CopticDateBar";

interface HeaderProps {
  onMenuPress: () => void;
  onSyncPress: () => void;
  isOfflineReady: boolean;
  isAbout?: boolean;
  compact?: boolean;
  showDateBar?: boolean;
  title?: string;
  subTitle?: string;
}

export function Header({ onMenuPress, onSyncPress, isOfflineReady, isAbout = false, compact = false, showDateBar = true, title, subTitle }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const topPad = Platform.OS === "web" ? 16 : insets.top;
  return (
    <LinearGradient
      colors={["#5A0710", "#850A18", "#3E0710"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, compact && styles.compactContainer, { paddingTop: topPad }]}
    >
      <View style={styles.btnRow}>
        <TouchableOpacity
          onPress={onMenuPress}
          style={styles.sideBtn}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.hamburger}>
            <View style={styles.bar} />
            <View style={[styles.bar, styles.barMid]} />
            <View style={[styles.bar, styles.barShort]} />
          </View>
        </TouchableOpacity>

        {!compact && (
          <TouchableOpacity onPress={onSyncPress} style={styles.sideBtn} activeOpacity={0.7}>
            {isOfflineReady ? (
              <View style={styles.syncWrap}>
                <Feather name="download-cloud" size={21} color="#4CAF50" />
                <View style={styles.greenDot} />
              </View>
            ) : (
              <Feather name="download-cloud" size={21} color="#FFCC80" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {!compact && !isAbout ? (
        <View style={styles.titleBlock}>
          <View style={styles.crossRow}>
            <View style={styles.ornamentLine} />
            <Text style={styles.crossSymbol}>☩</Text>
            <View style={styles.ornamentLine} />
          </View>
          <Text style={styles.mainTitle}>{title || t.appName}</Text>
          <Text style={styles.subTitle}>{subTitle || t.appSub}</Text>
        </View>
      ) : !compact ? (
        <View style={styles.simpleTitleBlock}>
          <Text style={styles.mainTitle}>{t.aboutTitle}</Text>
        </View>
      ) : null}

      {/* شريط التاريخ القبطي والميلادي */}
      {!compact && !isAbout && showDateBar && <CopticDateBar />}

      {!compact && <View style={styles.goldenBar} />}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: "hidden",
    borderBottomWidth: 1,
    borderColor: "rgba(232,200,120,0.42)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  compactContainer: {
    paddingBottom: 4,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 0,
  },
  sideBtn: {
    width: 46,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,200,120,0.28)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  hamburger: { gap: 5 },
  bar: {
    width: 22,
    height: 2.5,
    backgroundColor: "#D4AF85",
    borderRadius: 2,
  },
  barMid: { width: 16 },
  barShort: { width: 19 },
  syncWrap: { position: "relative" },
  greenDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
    bottom: -2,
    right: -2,
    borderWidth: 1.5,
    borderColor: "#700000",
  },
  titleBlock: {
    alignItems: "center",
    paddingTop: 5,
    paddingBottom: 8,
    gap: 2,
  },
  simpleTitleBlock: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 14,
  },
  crossRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 1,
  },
  ornamentLine: {
    width: 48,
    height: 1,
    backgroundColor: "rgba(200,169,81,0.5)",
  },
  crossSymbol: {
    fontSize: 20,
    color: "#C8A951",
    lineHeight: 24,
  },
  mainTitle: {
    color: "#FFFFFF",
    fontSize: 38,
    fontFamily: "CSAvaVeni-Regular",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.24)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  subTitle: {
    color: "#C8A951",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    letterSpacing: 2,
    opacity: 0.9,
  },
  goldenBar: {
    height: 3,
    backgroundColor: "#D8BA69",
    opacity: 0.78,
  },
});
