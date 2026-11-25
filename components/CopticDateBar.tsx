import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { buildDateInfo, type DateInfo } from "@/lib/coptic-calendar";
import { useLang, type Lang } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

function toAr(n: number, lang: Lang): string {
  if (lang !== "ar") return n.toString();
  return n.toString()
    .replace(/0/g, "٠").replace(/1/g, "١").replace(/2/g, "٢")
    .replace(/3/g, "٣").replace(/4/g, "٤").replace(/5/g, "٥")
    .replace(/6/g, "٦").replace(/7/g, "٧").replace(/8/g, "٨")
    .replace(/9/g, "٩");
}

function useTodayDates(lang: Lang): DateInfo {
  const [dates, setDates] = useState<DateInfo>(() => buildDateInfo(new Date(), lang));
  useEffect(() => { setDates(buildDateInfo(new Date(), lang)); }, [lang]);
  useEffect(() => {
    function scheduleRefresh() {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      return setTimeout(() => {
        setDates(buildDateInfo(new Date(), lang));
        scheduleRefresh();
      }, tomorrow.getTime() - now.getTime());
    }
    const timer = scheduleRefresh();
    return () => clearTimeout(timer);
  }, [lang]);
  return dates;
}

export function CopticDateBar() {
  const { lang } = useLang();
  const { isDark } = useTheme();
  const d = useTodayDates(lang);
  const [infoCalendar, setInfoCalendar] = useState<"coptic" | "pharaonic" | null>(null);

  const isAr     = lang === "ar";
  const boldFont = isAr ? "Cairo_700Bold" : "Cinzel_700Bold";
  const calendarCopy = {
    coptic: {
      title: { ar: "التاريخ القبطي", en: "The Coptic Calendar", fr: "Le calendrier copte", de: "Der koptische Kalender" }[lang],
      body: {
        ar: "التاريخ القبطي هو امتدادٌ للتقويم المصري القديم، ويبدأ عصره من سنة ٢٨٤م، تخليدًا لشهداء الكنيسة القبطية في عهد دقلديانوس. ويتكوّن من ١٢ شهرًا، كلٌّ منها ٣٠ يومًا، بالإضافة إلى شهر النسيء الذي يتكوّن من ٥ أيام، أو ٦ أيام في السنة الكبيسة.",
        en: "The Coptic calendar continues the ancient Egyptian calendar. Its era began in AD 284 in commemoration of the martyrs of the Coptic Church under Diocletian. It has 12 months of 30 days each, followed by the short month of Pi Kogi Enavot, which has 5 days—or 6 in a leap year.",
        fr: "Le calendrier copte prolonge l’ancien calendrier égyptien. Son ère commence en 284 apr. J.-C., en mémoire des martyrs de l’Église copte sous Dioclétien. Il comprend 12 mois de 30 jours, suivis du mois intercalaire de Pi Kogi Enavot, qui compte 5 jours, ou 6 lors d’une année bissextile.",
        de: "Der koptische Kalender ist eine Fortführung des altägyptischen Kalenders. Seine Ära beginnt im Jahr 284 n. Chr. zum Gedenken an die Märtyrer der koptischen Kirche unter Diokletian. Er besteht aus 12 Monaten mit je 30 Tagen sowie dem Ergänzungsmonat Pi Kogi Enavot mit 5 Tagen – in Schaltjahren mit 6 Tagen.",
      }[lang],
    },
    pharaonic: {
      title: { ar: "التاريخ المصري القديم", en: "The Ancient Egyptian Calendar", fr: "Le calendrier de l’Égypte ancienne", de: "Der altägyptische Kalender" }[lang],
      body: {
        ar: "التاريخ المصري القديم هو تقويم ابتكره المصريون القدماء لتنظيم السنة الزراعية، ويتكوّن من ١٢ شهرًا، كلٌّ منها ٣٠ يومًا، بالإضافة إلى ٥ أيام تُضاف في نهاية السنة.",
        en: "The ancient Egyptian calendar was developed to organize the agricultural year. It consists of 12 months of 30 days each, plus 5 additional days at the end of the year.",
        fr: "Le calendrier de l’Égypte ancienne a été créé pour organiser l’année agricole. Il comprend 12 mois de 30 jours chacun, auxquels s’ajoutent 5 jours à la fin de l’année.",
        de: "Der altägyptische Kalender wurde zur Ordnung des landwirtschaftlichen Jahres entwickelt. Er besteht aus 12 Monaten mit je 30 Tagen sowie 5 zusätzlichen Tagen am Jahresende.",
      }[lang],
    },
  };
  const activeCalendarCopy = infoCalendar ? calendarCopy[infoCalendar] : null;

  const cells = [
    { day: toAr(d.copticDay, lang), month: d.copticMonth, year: toAr(d.copticYear, lang) },
    { day: toAr(d.copticDay, lang), month: d.copticMonth, year: toAr(d.pharaonicYear, lang) },
    { day: toAr(d.gregDay, lang), month: d.gregMonth, year: toAr(d.gregYear, lang) },
  ];

  const barBg         = isDark ? "rgba(0,0,0,0.45)"       : "rgba(255,255,255,0.90)";
  const cellBg        = isDark ? "rgba(10,10,10,0.70)"     : "#FFFFFF";
  const cellBorder    = isDark ? "rgba(200,169,81,0.25)"   : "rgba(0,0,0,0.05)";
  const dayColor      = isDark ? "#FFFFFF"                 : "#111111";
  const monthColor    = isDark ? "rgba(255,255,255,0.80)"  : "#444444";
  const yearColor     = isDark ? GOLD                      : "#8B0000";
  const dayNameColor  = isDark ? GOLD                      : "#8B0000";
  const dayPillBg     = isDark ? "rgba(10,10,10,0.70)"     : "#FFFFFF";
  const dayPillBorder = isDark ? GOLD + "88"               : "rgba(139,0,0,0.18)";
  const divColor      = isDark ? "rgba(200,169,81,0.25)"   : "rgba(0,0,0,0.08)";

  // اختصار اسم اليوم لثلاثة حروف في اللغات غير العربية
  const displayDayName = isAr ? d.dayName : d.dayName.substring(0, 3);

  return (
    <View style={[styles.bar, { backgroundColor: barBg }]}>

      {/* يوم الأسبوع - سطر واحد فقط */}
      <View style={[styles.dayPill, { backgroundColor: dayPillBg, borderColor: dayPillBorder }]}>
        <Text
          style={[styles.dayName, { color: dayNameColor, fontFamily: boldFont }]}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.6}
          textBreakStrategy="simple"
        >
          {displayDayName}
        </Text>
      </View>

      <View style={[styles.vDiv, { backgroundColor: divColor }]} />

      {/* التواريخ: اليوم + الشهر في نفس السطر */}
      {cells.map((c, i) => (
        <React.Fragment key={i}>
          {i < 2 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i === 0 ? "معلومات عن التاريخ القبطي" : "معلومات عن التاريخ المصري القديم"}
            onPress={() => setInfoCalendar(i === 0 ? "coptic" : "pharaonic")}
            style={[styles.cell, { backgroundColor: cellBg, borderColor: cellBorder }]}
          >

            {/* صف اليوم والشهر */}
            <View style={[styles.dayMonthRow, { flexDirection: "row" }]}>
              {isAr ? (
                // العربية: اسم الشهر ثم رقم اليوم
                <>
                  <Text 
                    style={[styles.monthName, { color: monthColor, fontFamily: boldFont }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    {c.day}
                  </Text>
                  <Text 
                    style={[styles.dayNum, { color: dayColor, fontFamily: boldFont }]}
                  >
                    {c.month}
                  </Text>
                </>
              ) : (
                // غير العربية: رقم اليوم ثم اسم الشهر
                <>
                  <Text 
                    style={[styles.dayNum, { color: dayColor, fontFamily: boldFont }]}
                  >
                    {c.month}
                  </Text>
                  <Text 
                    style={[styles.monthName, { color: monthColor, fontFamily: boldFont }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    {c.day}
                  </Text>
                </>
              )}
            </View>

            {/* السنة */}
            <Text style={[styles.yearNum, { color: yearColor, fontFamily: boldFont }]} numberOfLines={1}>
              {c.year}
            </Text>

          </Pressable>
          ) : (
          <View style={[styles.cell, { backgroundColor: cellBg, borderColor: cellBorder }]}>
            <View style={[styles.dayMonthRow, { flexDirection: "row" }]}>
              {isAr ? (
                <>
                  <Text style={[styles.monthName, { color: monthColor, fontFamily: boldFont }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{c.day}</Text>
                  <Text style={[styles.dayNum, { color: dayColor, fontFamily: boldFont }]}>{c.month}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.dayNum, { color: dayColor, fontFamily: boldFont }]}>{c.month}</Text>
                  <Text style={[styles.monthName, { color: monthColor, fontFamily: boldFont }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{c.day}</Text>
                </>
              )}
            </View>
            <Text style={[styles.yearNum, { color: yearColor, fontFamily: boldFont }]} numberOfLines={1}>{c.year}</Text>
          </View>
          )}

          {i < cells.length - 1 && (
            <View style={[styles.cellDiv, { backgroundColor: divColor }]} />
          )}
        </React.Fragment>
      ))}

      <Modal
        visible={infoCalendar !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoCalendar(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setInfoCalendar(null)} />
          <View style={[styles.infoCard, { backgroundColor: isDark ? "#211B17" : "#FFFEFA", borderColor: isDark ? "rgba(200,169,81,0.42)" : "rgba(139,0,0,0.14)" }]}>
            <View style={styles.infoIcon}><Feather name={infoCalendar === "coptic" ? "calendar" : "sun"} size={22} color={GOLD} /></View>
            <Text style={[styles.infoTitle, { color: isDark ? "#F2D98B" : "#7D1B16" }]}>
              {activeCalendarCopy?.title}
            </Text>
            <Text style={[styles.infoText, { color: isDark ? "#F1EDE5" : "#39342E", textAlign: "left", writingDirection: isAr ? "rtl" : "ltr" }]}>
              {activeCalendarCopy?.body}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setInfoCalendar(null)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>{({ ar: "إغلاق", en: "Close", fr: "Fermer", de: "Schließen" } as const)[lang]}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const GOLD = "#C8A951";

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 7,
    paddingVertical: 2,
    gap: 3,
  },
  dayPill: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 45,
    maxWidth: 65,
  },
  dayName: {
    fontSize: 10,  // تصغير الخط الأساسي
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 12,
  },
  vDiv: {
    width: 1,
    alignSelf: "center",
    height: 32,
    borderRadius: 1,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  modalRoot: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.58)" },
  infoCard: { width: "100%", maxWidth: 440, borderRadius: 24, borderWidth: 1, padding: 24, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 18, elevation: 12 },
  infoIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(200,169,81,0.14)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  infoTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, textAlign: "center", marginBottom: 12 },
  infoText: { width: "100%", fontFamily: "Cairo_400Regular", fontSize: 15, lineHeight: 29 },
  closeButton: { alignSelf: "stretch", marginTop: 20, backgroundColor: "#8B0000", borderRadius: 14, paddingVertical: 11, alignItems: "center" },
  closeButtonText: { color: "#FFF", fontFamily: "Cairo_700Bold", fontSize: 14 },
  dayMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    flexWrap: "nowrap",
  },
  dayNum: {
    fontSize: 10,
    includeFontPadding: false,
    lineHeight: 13,
  },
  monthName: {
    fontSize: 9,
    includeFontPadding: false,
    lineHeight: 11,
    textAlign: "center",
  },
  yearNum: {
    fontSize: 10.5,
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 13,
    letterSpacing: 0.3,
  },
  cellDiv: {
    width: 1,
    alignSelf: "center",
    height: 24,
    borderRadius: 1,
    opacity: 0.6,
  },
});
