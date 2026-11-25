import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang } from "@/contexts/LanguageContext";
import { logActivity } from "@/hooks/useUserTracking";

interface AudioPlayerProps {
  audioUrl: string;
  fullWidth?: boolean;
  compact?: boolean;
  resolvedSource?: string | null;
  resolveSource?: () => Promise<string | null>;
  onPlaybackStarted?: () => void | Promise<void>;
}

const stopRegistry = new Set<() => void>();

function broadcastStopAll() {
  stopRegistry.forEach((fn) => { try { fn(); } catch { } });
}

async function resolvePlayableSource(
  audioUrl: string,
  resolvedSource?: string | null,
  sourceResolver?: () => Promise<string | null>
): Promise<string> {
  if (resolvedSource) return resolvedSource;
  const local = sourceResolver ? await sourceResolver().catch(() => null) : null;
  return local ?? audioUrl;
}

export function AudioPlayer({
  audioUrl,
  fullWidth = false,
  compact = false,
  resolvedSource,
  resolveSource,
  onPlaybackStarted,
}: AudioPlayerProps) {
  const colors = useThemeColors();
  const { t } = useLang();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const stopSelf = useCallback(() => {
    if (webAudioRef.current) {
      webAudioRef.current.pause();
      webAudioRef.current.src = "";
      webAudioRef.current = null;
    }
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => { });
      soundRef.current.unloadAsync().catch(() => { });
      soundRef.current = null;
    }
    if (blobUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    stopRegistry.add(stopSelf);
    return () => {
      stopSelf();
      stopRegistry.delete(stopSelf);
    };
  }, [stopSelf]);

  const playWeb = async (src: string) => {
    const audio = new (window as any).Audio() as HTMLAudioElement;
    webAudioRef.current = audio;
    await new Promise<void>((resolve, reject) => {
      audio.oncanplaythrough = () => resolve();
      audio.onerror = () => reject(new Error("Audio load error"));
      audio.src = src;
      audio.load();
    });
    audio.onended = () => {
      setIsPlaying(false);
      if (blobUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      webAudioRef.current = null;
      logActivity("audio_play", undefined, audioUrl, undefined, "completed");
    };
    await audio.play();
    setIsPlaying(true);
  };

  const playNative = async (src: string) => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri: src },
      { shouldPlay: true, volume: 1.0 }
    );
    soundRef.current = sound;
    setIsPlaying(true);
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        setIsPlaying(false);
        sound.unloadAsync().catch(() => { });
        soundRef.current = null;
        logActivity("audio_play", undefined, audioUrl, undefined, "completed");
      }
    });
  };

  const handlePress = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { }
    if (isPlaying) {
      logActivity("audio_stop", undefined, audioUrl);
      stopSelf();
      return;
    }
    broadcastStopAll();
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const src = await resolvePlayableSource(audioUrl, resolvedSource, resolveSource);
      blobUrlRef.current = src;
      logActivity("audio_play", undefined, audioUrl, undefined, "start");
      if (Platform.OS === "web") { await playWeb(src); }
      else { await playNative(src); }
      void Promise.resolve().then(() => onPlaybackStarted?.()).catch(() => undefined);
    } catch {
      setErrorMsg(t.audio.error);
      stopSelf();
    } finally {
      setIsLoading(false);
    }
  };

  const hasError = !!errorMsg;

  /* ── Compact ─────────────────────────────────────────────── */
  if (compact) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={[
          styles.compactBtn,
          {
            backgroundColor: isPlaying ? "#8B0000" : colors.copticText + "10",
            borderColor: isPlaying ? "#8B0000" : colors.copticText + "30",
          },
        ]}
      >
        <View style={[styles.compactIconCircle, { backgroundColor: isPlaying ? "#FFFFFF20" : colors.copticText + "20" }]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={isPlaying ? "#FFFFFF" : colors.copticText} />
          ) : (
            <Feather
              name={isPlaying ? "pause" : "play"}
              size={12}
              color={isPlaying ? "#FFFFFF" : colors.copticText}
            />
          )}
        </View>
        <Text style={[styles.compactText, { color: isPlaying ? "#FFFFFF" : colors.copticText }]}>
          {isLoading ? "..." : isPlaying ? t.audio.stop : t.audio.listen}
        </Text>
      </TouchableOpacity>
    );
  }

  /* ── Full Width ──────────────────────────────────────────── */
  if (fullWidth) {
    const btnBg = isPlaying ? "#8B0000" : hasError ? colors.border : colors.copticText;
    const btnTextColor = isPlaying ? "#FFFFFF" : (hasError ? colors.text : "#FFFFFF");
    return (
      <View style={styles.fullContainer}>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.85}
          style={[styles.fullBtn, { backgroundColor: btnBg }]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={btnTextColor} />
          ) : (
            <Feather
              name={isPlaying ? "pause-circle" : "play-circle"}
              size={24}
              color={btnTextColor}
            />
          )}
          <Text style={[styles.fullBtnText, { color: btnTextColor }]}>
            {isLoading ? t.audio.loadingFull : isPlaying ? t.audio.stop : t.audio.listenFull}
          </Text>
        </TouchableOpacity>
        {hasError && <Text style={[styles.errorText, { color: colors.textSecondary }]}>{errorMsg}</Text>}
      </View>
    );
  }

  /* ── Icon Only ───────────────────────────────────────────── */
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      style={[
        styles.iconBtn,
        {
          backgroundColor: isPlaying ? colors.copticText + "22" : colors.chipBg,
          borderColor: hasError ? colors.border : colors.copticText,
        },
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.copticText} />
      ) : (
        <Feather
          name={isPlaying ? "pause" : "volume-2"}
          size={18}
          color={isPlaying ? colors.copticText : hasError ? colors.textSecondary : colors.copticText}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  compactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 14,
    paddingVertical: 4,
    borderRadius: 24,
    borderWidth: 1,
    minWidth: 110,
  },
  compactIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  compactText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fullContainer: { gap: 8 },
  fullBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 16,
  },
  fullBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
