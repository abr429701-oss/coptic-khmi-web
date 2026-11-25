import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
  ScrollView,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DownloadProgress } from "@/hooks/useOfflineDictionary";
import { useLang } from "@/contexts/LanguageContext";

interface DownloadScreenProps {
  onStartDownload: () => void;
  onSkip: () => void;
  progress: DownloadProgress;
  entryCount: number;
  audioCount: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function PhaseLabel({ progress, t }: { progress: DownloadProgress; t: any }) {
  switch (progress.phase) {
    case "data":
      return <Text style={styles.statusText}>{t.download.phaseData}</Text>;
    case "audio":
      return <Text style={styles.statusText}>{t.download.phaseAudio}</Text>;
    case "done":
      return <Text style={[styles.statusText, { color: "#4CAF50" }]}>{t.download.phaseDone}</Text>;
    case "error":
      return <Text style={[styles.statusText, { color: "#EF5350" }]}>{t.download.phaseError}</Text>;
    default:
      return null;
  }
}

export function DownloadScreen({
  onStartDownload,
  onSkip,
  progress,
  entryCount,
  audioCount,
}: DownloadScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const isDownloading = progress.phase === "data" || progress.phase === "audio";
  const isDone = progress.phase === "done";

  const progressRatio =
    progress.phase === "audio" && progress.total > 0
      ? progress.current / progress.total
      : progress.phase === "data"
      ? 0.05
      : isDone
      ? 1
      : 0;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== "web" }).start();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressRatio,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progressRatio]);

  useEffect(() => {
    if (!isDownloading) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: Platform.OS !== "web" }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isDownloading]);

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === "web" ? 60 : insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#8B0000" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <Animated.View style={[styles.logoCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={styles.logoIcon}
            />
          </Animated.View>

          <Text style={styles.appName}>{t.appName}</Text>
          <Text style={styles.appSub}>{t.appSub}</Text>

          {!isDownloading && !isDone && (
            <View style={styles.infoBox}>
              <Text style={styles.welcomeText}>{t.download.welcome}</Text>
            </View>
          )}

          {(isDownloading || isDone) && (
            <View style={styles.progressBox}>
              <PhaseLabel progress={progress} t={t} />

              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                      backgroundColor: isDone ? "#4CAF50" : "#C8A951",
                    },
                  ]}
                />
              </View>

              <Text style={styles.progressPercent}>
                {isDone ? "100%" : `${Math.round(progressRatio * 100)}%`}
              </Text>
            </View>
          )}

          {isDone && (
            <TouchableOpacity style={styles.btnPrimary} onPress={onSkip} activeOpacity={0.85}>
              <Feather name="check-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.btnPrimaryText}>{t.download.start}</Text>
            </TouchableOpacity>
          )}

          {!isDownloading && !isDone && (
            <>
              <TouchableOpacity style={styles.btnPrimary} onPress={onStartDownload} activeOpacity={0.85}>
                <Feather name="download-cloud" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.btnPrimaryText}>{t.download.downloadAll}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={onSkip} activeOpacity={0.75}>
                <Feather name="wifi" size={16} color="#AAAAAA" style={{ marginRight: 8 }} />
                <Text style={styles.btnSecondaryText}>{t.download.skip}</Text>
              </TouchableOpacity>
            </>
          )}

          {progress.phase === "error" && (
            <TouchableOpacity style={styles.btnPrimary} onPress={onStartDownload} activeOpacity={0.85}>
              <Feather name="refresh-cw" size={18} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.btnPrimaryText}>{t.download.retry}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  content: {
    alignItems: "center",
    gap: 20,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#8B0000",
    borderWidth: 3,
    borderColor: "#C8A951",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#C8A951",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
    overflow: "hidden",
  },
  logoIcon: {
    width: 94,
    height: 94,
    borderRadius: 47,
  },
  appName: {
    color: "#FFFFFF",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  appSub: {
    color: "#C8A951",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    letterSpacing: 2,
    textAlign: "center",
    marginTop: -8,
  },
  infoBox: {
    width: "100%",
    backgroundColor: "#2A2A2A",
    borderRadius: 20,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: "#3A3A3A",
  },
  welcomeText: {
    color: "#CCCCCC",
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 26,
    writingDirection: "rtl",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#333",
  },
  statNum: {
    color: "#FFFFFF",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    color: "#888",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  progressBox: {
    width: "100%",
    backgroundColor: "#2A2A2A",
    borderRadius: 20,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: "#3A3A3A",
    alignItems: "center",
  },
  statusText: {
    color: "#CCCCCC",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  currentWordText: {
    color: "#C8A951",
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    letterSpacing: 1,
  },
  progressTrack: {
    width: "100%",
    height: 10,
    backgroundColor: "#3A3A3A",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
  },
  progressPercent: {
    color: "#888",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  btnPrimary: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8B0000",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 24,
    shadowColor: "#8B0000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  btnSecondaryText: {
    color: "#888888",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});