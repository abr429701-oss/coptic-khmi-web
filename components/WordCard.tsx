import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import type { DictionaryEntry } from "@/hooks/useDictionary";
import { useLang, translateTerm } from "@/contexts/LanguageContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { AudioPlayer } from "@/components/AudioPlayer";
import { useOfflineAudio } from "@/hooks/useOfflineAudio";
import { getLocalAudioBlobUrl } from "@/hooks/useOfflineStorage";
import { logActivity } from "@/hooks/useUserTracking";


interface WordCardProps {
  entry: DictionaryEntry;
  index?: number;
  query: string;
  displayMeaning?: string;
  forceLang?: string;
  audioDownloaded?: boolean;
  compactResult?: boolean;
  wholeCopticWord?: boolean;
  showMeaningCount?: boolean;
  meaningCount?: number;
  showAudio?: boolean;
  showSecondaryMeaning?: boolean;
  showMetadata?: boolean;
  showResultIndex?: boolean;
  cachePlayedAudio?: (entry: DictionaryEntry) => Promise<void>;
  onPress: (entry: DictionaryEntry) => void;
}

function isCopticQuery(query: string): boolean {
  return /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF]/.test(query);
}

function getDisplayedMeaning(arabic: string, query: string): string {
  if (!arabic) return "";
  const meanings = arabic.split(/[،,;\/]/).map((m) => m.trim()).filter(Boolean);
  if (meanings.length <= 1) return arabic;
  if (!query || query.length < 1) return meanings[0];

  // إذا كان البحث قبطي، اظهر المعنى الأول فقط (لأننا نريد المعنى الأساسي الأحادي)
  if (isCopticQuery(query)) return meanings[0];

  const q = query.toLowerCase();
  const matched = meanings.find((m) => m.toLowerCase().includes(q));
  return matched || meanings[0];
}

export function WordCard({ entry, index, query, displayMeaning, forceLang, audioDownloaded = false, compactResult = false, wholeCopticWord = false, showMeaningCount = false, meaningCount: providedMeaningCount, showAudio = true, showSecondaryMeaning = true, showMetadata = true, showResultIndex = true, cachePlayedAudio, onPress }: WordCardProps) {
  const { lang: appLang, isRTL: appIsRTL, t } = useLang();

  const lang = forceLang || appLang;
  const isRTL = lang === "ar";

  const colors = useThemeColors();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const copticFirst = query ? isCopticQuery(query) : false;

  // الاعتماد على لغة التطبيق أو اللغة الفعلية للكلمة (forceLang) لتحديد اتجاه البطاقة
  const firstStrongQueryChar = query.match(/[\u0590-\u08FF\uFB1D-\uFEFC]|[A-Za-z\u2C80-\u2CFF\u0370-\u03FF]/)?.[0];
  const queryRTL = firstStrongQueryChar
    ? /[\u0590-\u08FF\uFB1D-\uFEFC]/.test(firstStrongQueryChar)
    : isRTL;
  const cardRTL = isRTL;

  const audioId = entry.audioId || entry.id;
  const localAudio = useOfflineAudio(audioId, entry.audioUrl, audioDownloaded, entry.id);
  const resolveLocalAudio = async () => {
    const current = await getLocalAudioBlobUrl(audioId).catch(() => null);
    if (current) return current;
    return audioId !== entry.id ? getLocalAudioBlobUrl(entry.id).catch(() => null) : null;
  };

  const handlePressIn = () =>
    Animated.spring(scaleAnim, {
      toValue: 0.975,
      useNativeDriver: Platform.OS !== "web",
      tension: 300, friction: 10,
    }).start();

  const handlePressOut = () =>
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: Platform.OS !== "web",
      tension: 300, friction: 10,
    }).start();

  const handlePress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
    onPress(entry);
  };

  const arabicToShow = displayMeaning || getDisplayedMeaning(entry.arabic || "", query);
  const alternateMeaningCount = Array.isArray((entry as any)._alternateEntries)
    ? (entry as any)._alternateEntries.length
    : 0;
  const suppliedMeaningCount = Number(providedMeaningCount ?? (entry as any)._meaningCount);
  const meaningCount = Number.isFinite(suppliedMeaningCount) && suppliedMeaningCount > 0
    ? suppliedMeaningCount
    : 1 + alternateMeaningCount;
  const hasMeta = !!(entry.origin || entry.wordType);

  const primaryText = compactResult
    ? (copticFirst ? entry.coptic : (displayMeaning || arabicToShow)) || "—"
    : copticFirst ? (entry.coptic || "—") : (arabicToShow || "—");
  const primaryStyle = copticFirst ? styles.copticPrimary : compactResult && !/[\u0600-\u06FF]/.test(primaryText) ? styles.latinPrimary : styles.arabicPrimary;

  const secondaryText = copticFirst
    ? (arabicToShow || null)
    : (entry.coptic || null);

  return (
    <Animated.View style={[styles.cardWrap, { transform: [{ scale: scaleAnim }] }]}>
      <View style={[styles.card, {
        backgroundColor: colors.card,
        borderColor: colors.cardBorder,
        shadowColor: colors.shadow,
        direction: cardRTL ? "rtl" : "ltr",
      }]}>

        {/* الشريط الجانبي + المحتوى — يمين لو عربي، يسار لو قبطي */}
        <View style={[styles.innerRow]}>

          {/* الشريط الذهبي الجانبي */}
          <View style={[styles.accentBar, { backgroundColor: colors.copticText }]} />

          {/* المحتوى الكامل */}
          <View style={styles.contentCol}>

            <TouchableOpacity
              activeOpacity={1}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={handlePress}
              onLongPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch { }
                logActivity("long_press_word", entry);
              }}
              style={[styles.pressArea]}
            >
              <View style={[styles.body, compactResult && { alignItems: "flex-start" }]}>
                <Text
                  style={[
                    primaryStyle,
                    {
                      color: copticFirst ? colors.copticText : colors.arabicText,
                      ...(compactResult ? {
                        textAlign: "left",
                        writingDirection: queryRTL ? "rtl" : "ltr",
                        alignSelf: "stretch",
                      } : {}),
                    },
                  ]}
                  numberOfLines={wholeCopticWord ? undefined : 2}
                >
                  {primaryText}
                </Text>

                {!compactResult && showSecondaryMeaning && secondaryText ? (
                  <Text
                    style={[
                      copticFirst ? styles.arabicSecondary : styles.copticSecondary,
                      {
                        color: copticFirst ? colors.textSecondary : colors.copticText + "88",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {secondaryText}
                  </Text>
                ) : null}

                {!compactResult && showMetadata && hasMeta && (
                  <View style={[styles.chips]}>
                    {entry.wordType ? (
                      <View style={[styles.chip, {
                        backgroundColor: "rgba(91,155,213,0.08)",
                        borderColor: "rgba(91,155,213,0.25)",
                      }]}>
                        <Text style={[styles.chipText, { color: "#5B9BD5" }]}>
                          {translateTerm(entry.wordType, (forceLang || lang) as any)}
                        </Text>
                      </View>
                    ) : null}
                    {entry.origin ? (
                      <View style={[styles.chip, {
                        backgroundColor: colors.chipBg,
                        borderColor: colors.copticText + "33",
                      }]}>
                        <Text style={[styles.chipText, { color: colors.copticText }]}>
                          {translateTerm(entry.origin, (forceLang || lang) as any)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>

              <View style={[styles.chevronWrap, showMeaningCount && styles.chevronWrapWithCount]}>
                {!compactResult && showResultIndex && index !== undefined && (
                  <View style={styles.indexBadge}>
                    <Text style={styles.indexText}>{String(index + 1).padStart(2, "0")}</Text>
                  </View>
                )}
                {showMeaningCount ? (
                  <View
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={t.word.meaningCount(meaningCount)}
                    style={[styles.meaningCountCircle, { backgroundColor: colors.chipBg, borderColor: colors.copticText + "55" }]}
                  >
                    <Text style={[styles.meaningCountCircleText, { color: colors.copticText }]} numberOfLines={1}>
                      {meaningCount}
                    </Text>
                  </View>
                ) : null}
                <Feather
                  name={cardRTL ? "chevron-right" : "chevron-left"}
                  size={16}
                  color={colors.copticText + "55"}
                />
              </View>
            </TouchableOpacity>

            {!compactResult && showAudio && entry.audioUrl ? (
              <View style={[
                styles.audioRow,
                { borderTopColor: colors.separator },
              ]}>
                <AudioPlayer
                  audioUrl={localAudio ?? entry.audioUrl}
                  resolvedSource={localAudio}
                  resolveSource={resolveLocalAudio}
                  onPlaybackStarted={cachePlayedAudio ? () => cachePlayedAudio(entry) : undefined}
                  compact
                />
              </View>
            ) : null}

          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    marginHorizontal: 14,
    marginVertical: 6,
  },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 4,
  },

  // ── الصف الداخلي ─────────────────────────────────────────────────────
  innerRow: {
    flexDirection: "row",          // RTL/LTR يتماشى تلقائيا
  },

  accentBar: {
    width: 5,
    opacity: 0.9,
  },
  contentCol: {
    flex: 1,
  },

  // ── منطقة الضغط ──────────────────────────────────────────────────────
  pressArea: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },

  // ── المحتوى النصي ─────────────────────────────────────────────────────
  body: {
    flex: 1,
    gap: 5,
    alignItems: "flex-start",   // start aligns text with layout naturally
  },

  arabicPrimary: {
    fontSize: 20,
    fontFamily: "Cairo_600SemiBold",
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 30,
  },
  copticPrimary: {
    fontSize: 24,
    fontFamily: "CSAvaVeni-Regular",
    textAlign: "right",
    lineHeight: 32,
  },
  latinPrimary: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "left",
    writingDirection: "ltr",
    lineHeight: 27,
  },
  arabicSecondary: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
  },
  copticSecondary: {
    fontSize: 16,
    fontFamily: "CSAvaVeni-Regular",
    textAlign: "right",
  },

  // ── الـ Chips ──────────────────────────────────────────────────────────
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 3,
    justifyContent: "flex-start",
  },
  chevronWrapWithCount: {
    width: 44,
    flexDirection: "row",
    gap: 4,
  },
  meaningCountCircle: {
    width: 24,
    height: 24,
    flexShrink: 0,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  meaningCountCircleText: { fontSize: 10, fontFamily: "Inter_700Bold", textAlign: "center" },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  chevronWrap: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  indexBadge: {
    width: 28,
    height: 25,
    borderRadius: 9,
    backgroundColor: "rgba(200,169,81,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  indexText: { color: "#A58836", fontSize: 10, fontFamily: "Inter_700Bold" },

  // ── الصوت ─────────────────────────────────────────────────────────────
  audioRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "stretch",
    minHeight: 44,
  },
});
