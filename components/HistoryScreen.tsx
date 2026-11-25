import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHistory } from "@/contexts/HistoryContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang, translateTerm } from "@/contexts/LanguageContext";
import type { DictionaryEntry } from "@/hooks/useDictionary";

interface HistoryScreenProps {
  onWordPress: (entry: DictionaryEntry) => void;
}

export function HistoryScreen({ onWordPress }: HistoryScreenProps) {
  const { history, clearHistory } = useHistory();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, lang } = useLang();

  if (history.length === 0) {
    return (
      <View style={[styles.empty, { paddingBottom: insets.bottom + 40 }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "25" }]}>
          <Feather name="clock" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          {isRTL ? "لا يوجد سجل بعد" : "No history yet"}
        </Text>
        <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
          {isRTL ? "ستظهر هنا الكلمات التي فتحتها" : "Words you open will appear here"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { direction: isRTL ? "rtl" : "ltr" }]}>
        <Text style={[styles.topBarTitle, { color: colors.text }, isRTL && { textAlign: "right" }]}>
          {isRTL ? `السجل (${history.length})` : `History (${history.length})`}
        </Text>
        <TouchableOpacity onPress={clearHistory} style={[styles.clearBtn, { direction: isRTL ? "rtl" : "ltr" }]} activeOpacity={0.7}>
          <Feather name="trash-2" size={16} color="#8B0000" />
          <Text style={styles.clearText}>{isRTL ? "مسح" : "Clear"}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item, i) => `${item.id ?? i}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingTop: 10 }}
        renderItem={({ item }) => {
          const itemLang = (item as any)._lang || lang;
          const itemIsRTL = itemLang === "ar";

          // جلب المعنى الأول فقط كما طلب المستخدم
          let meaning = "";
          if (itemLang === "en") meaning = item.english || item.arabic || "";
          else if (itemLang === "fr") meaning = item.french || item.arabic || "";
          else if (itemLang === "de") meaning = item.german || item.arabic || "";
          else meaning = item.arabic || "";
          meaning = meaning.split(/[،,;\n]/)[0].trim();

          const hasMeta = !!(item.wordType || item.origin || item.gender);
          const isCopticSearch = (item as any)._query ? /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF]/.test((item as any)._query) : false;

          const primaryText = isCopticSearch ? (item.coptic || "—") : (meaning || "—");
          const secondaryText = isCopticSearch ? (meaning || "—") : (item.coptic || "—");

          const isPrimaryArabic = !isCopticSearch && itemIsRTL;
          const isSecondaryArabic = isCopticSearch && itemIsRTL;

          return (
            <TouchableOpacity
              style={[
                styles.historyCard,
                { backgroundColor: colors.card, borderColor: colors.primary + "20" },
                { direction: itemIsRTL ? "rtl" : "ltr" }
              ]}
              onPress={() => onWordPress(item)}
              activeOpacity={0.75}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.primary + "10" }]}>
                <Feather name="clock" size={16} color={colors.primary + "90"} />
              </View>

              <View style={[styles.contentWrap, itemIsRTL ? { alignItems: "flex-start" } : { alignItems: "flex-start" }]}>

                <Text
                  style={[
                    isPrimaryArabic ? styles.arabicPrimary : styles.copticPrimary,
                    { color: isPrimaryArabic ? colors.arabicText : colors.copticText }
                  ]}
                  numberOfLines={1}
                >
                  {primaryText}
                </Text>

                <View style={[styles.subRow]}>
                  <Text
                    style={[
                      isSecondaryArabic ? styles.arabicSecondary : styles.copticSecondary,
                      { color: isSecondaryArabic ? colors.text : colors.copticText }
                    ]}
                    numberOfLines={1}
                  >
                    {secondaryText}
                  </Text>

                  {hasMeta && (
                    <View style={[styles.metaDataRow]}>
                      <View style={[styles.dot, { backgroundColor: colors.primary + "40" }]} />


                      {item.gender ? (
                        <Text style={[styles.metaText, { color: "#CC4444" }]}>{translateTerm(item.gender, itemLang as any)}</Text>
                      ) : null}

                      {item.wordType ? (
                        <Text style={[styles.metaText, { color: "#5B9BD5" }]}>{translateTerm(item.wordType, itemLang as any)}</Text>
                      ) : null}

                      {item.origin ? (
                        <Text style={[styles.metaText, { color: "#C8A951" }]}>{translateTerm(item.origin, itemLang as any)}</Text>
                      ) : null}
                    </View>
                  )}
                </View>

              </View>

              <View style={styles.arrowWrap}>
                <Feather
                  name={itemIsRTL ? "chevron-left" : "chevron-right"}
                  size={18}
                  color={colors.primary + "40"}
                />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(200,169,81,0.2)",
  },
  topBarTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(139,0,0,0.08)",
  },
  clearText: { color: "#8B0000", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  contentWrap: {
    flex: 1,
    gap: 4,
  },
  arabicPrimary: {
    fontSize: 18,
    fontFamily: "Cairo_600SemiBold",
    lineHeight: 26,
    textAlign: "right",
    writingDirection: "rtl",
  },
  copticPrimary: {
    fontSize: 20,
    fontFamily: "CSAvaVeni-Regular",
  },
  arabicSecondary: {
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    opacity: 0.9,
    textAlign: "right",
    writingDirection: "rtl",
  },
  copticSecondary: {
    fontSize: 14,
    fontFamily: "CSAvaVeni-Regular",
    opacity: 0.9,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  metaDataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    flexShrink: 1,
    maxWidth: "100%",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 2,
  },
  metaText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
    minWidth: 0,
  },
  arrowWrap: {
    paddingLeft: 4,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
