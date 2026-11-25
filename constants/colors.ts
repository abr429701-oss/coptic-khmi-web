const primary = "#8B0000";
const primaryDk = "#6B0000";
const primaryLt = "#C41E3A";
const gold = "#C8A951";
const goldLight = "#E8C878";

export default {
  light: {
    // نصوص
    text: "#1A1A1A",
    textSecondary: "#5A5A5A",
    textOnPrimary: "#FFFFFF",

    // خلفيات
    background: "#F2EDE6",
    listBg: "#F2EDE6",
    card: "#FFFFFF",
    cardItem: "#FAF7F3",
    sheetBg: "#FFFFFF",
    modalBg: "#FDFAF6",
    inputBg: "#FFFFFF",
    darkCard: "#FAF7F3",

    // حدود
    border: "rgba(139,0,0,0.14)",
    cardBorder: "rgba(139,0,0,0.10)",
    separator: "rgba(139,0,0,0.08)",

    // ألوان العلامة التجارية
    primary,
    primaryDark: primaryDk,
    primaryLight: primaryLt,
    gold,
    goldLight,
    tint: primary,
    badge: primary,

    // رأس الصفحة (يبقى داكناً دائماً — تصميم قبطي)
    headerBg: primary,
    headerText: "#FFFFFF",

    // بطاقات الكلمات
    copticText: primary,
    arabicText: "#1A1A1A",
    chipBg: "rgba(139,0,0,0.06)",

    // أيقونات التنقل
    tabIconDefault: "#999999",
    tabIconSelected: primary,

    // ظل
    shadow: "rgba(0,0,0,0.10)",

    // صوت
    audioBtnBg: "rgba(139,0,0,0.07)",
    audioBtnBorder: "rgba(139,0,0,0.20)",
    audioBtnText: primary,

    // متفرقات
    tagBg: "rgba(139,0,0,0.08)",
    tagText: "#8B0000",
    placeholder: "#AAAAAA",
  },

  dark: {
    // نصوص
    text: "#F0F0F0",
    textSecondary: "#AAAAAA",
    textOnPrimary: "#FFFFFF",

    // خلفيات
    background: "#141414",
    listBg: "#141414",
    card: "#1E1E1E",
    cardItem: "#282828",
    sheetBg: "#161616",
    modalBg: "#111111",
    inputBg: "#222222",
    darkCard: "#3C3C3C",

    // حدود
    border: "rgba(200,169,81,0.12)",
    cardBorder: "rgba(200,169,81,0.08)",
    separator: "#2A2A2A",

    // ألوان العلامة التجارية
    primary: gold,
    primaryDark: goldLight,
    primaryLight: "#D4AA5A",
    gold,
    goldLight,
    tint: gold,
    badge: "#8B0000",

    // رأس الصفحة
    headerBg: "#1A0000",
    headerText: gold,

    // بطاقات الكلمات
    copticText: gold,
    arabicText: "#F0F0F0",
    chipBg: "rgba(200,169,81,0.07)",

    // أيقونات التنقل
    tabIconDefault: "#666666",
    tabIconSelected: gold,

    // ظل
    shadow: "rgba(0,0,0,0.40)",

    // صوت
    audioBtnBg: "rgba(200,169,81,0.10)",
    audioBtnBorder: "rgba(200,169,81,0.35)",
    audioBtnText: gold,

    // متفرقات
    tagBg: "rgba(255,255,255,0.1)",
    tagText: gold,
    placeholder: "#555555",
  },
};
