import type { Lang } from "@/contexts/LanguageContext";

// ─── أسماء الأيام (0=الأحد) ───────────────────────────────────────────────────
const DAYS: Record<Lang, string[]> = {
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  fr: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
};

// ─── أشهر ميلادية ────────────────────────────────────────────────────────────
const GREG_MONTHS: Record<Lang, string[]> = {
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  fr: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
};

// ─── أشهر قبطية (13 شهر) ────────────────────────────────────────────────────
const COPTIC_MONTHS_MAP: Record<Lang, string[]> = {
  ar: ["توت", "بابه", "هاتور", "كيهك", "طوبة", "أمشير", "برمهات", "برمودة", "بشنس", "بؤونه", "أبيب", "مسرى", "النسيء"],
  en: ["Tout", "Baba", "Hator", "Kiahk", "Toba", "Amshir", "Baramhat", "Baramouda", "Bashans", "Ba'ouna", "Abib", "Misra", "Nasie"],
  fr: ["Tout", "Baba", "Hathor", "Kiahk", "Toba", "Amshir", "Baramhat", "Baramouda", "Bachons", "Paôné", "Abib", "Misra", "Nasie"],
  de: ["Tout", "Baba", "Hator", "Kiahk", "Toba", "Amschir", "Baramhat", "Baramouda", "Baschans", "Bauna", "Abib", "Misra", "Nasi"],
};

// backward-compat exports
export const DAYS_AR = DAYS.ar;
export const MONTHS_AR = GREG_MONTHS.ar;
export const COPTIC_MONTHS = COPTIC_MONTHS_MAP.ar;

export interface CopticDate {
  year: number;
  month: number;   // 1–13
  day: number;     // 1–30 (النسيء 5 أو 6)
  monthName: string;
}

export interface DateInfo {
  dayName: string;
  copticDay: number;
  copticMonth: string;
  copticYear: number;
  gregDay: number;
  gregMonth: string;
  gregYear: number;
  pharaonicYear: number;
}

// ─── تحويل تاريخ ميلادي إلى Julian Day Number ────────────────────────────────
function toJDN(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

// ─── Epoch قبطي: 1 توت 1 ش = 29 أغسطس 284 م = JDN 1825030 ──────────────────
const COPTIC_EPOCH = toJDN(284, 8, 29); // 1825030

// ─── التحويل الرئيسي ──────────────────────────────────────────────────────────
export function gregorianToCoptic(
  gYear: number,
  gMonth: number,
  gDay: number,
  lang: Lang = "ar",
): CopticDate {
  const jdn = toJDN(gYear, gMonth, gDay);

  const cYear = Math.floor((4 * (jdn - COPTIC_EPOCH) + 3) / 1461) + 1;
  const dayOfYear = jdn - COPTIC_EPOCH - Math.floor(((cYear - 1) * 1461) / 4);
  const cMonth = Math.floor(dayOfYear / 30) + 1;
  const cDay = (dayOfYear % 30) + 1;

  return {
    year: cYear,
    month: cMonth,
    day: cDay,
    monthName: COPTIC_MONTHS_MAP[lang][cMonth - 1] ?? COPTIC_MONTHS_MAP.ar[cMonth - 1],
  };
}

// ─── بناء معلومات اليوم الكامل (مع دعم متعدد اللغات) ────────────────────────
export function buildDateInfo(date: Date = new Date(), lang: Lang = "ar"): DateInfo {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dow = date.getDay();

  const coptic = gregorianToCoptic(y, m, d, lang);

  return {
    dayName: DAYS[lang][dow],
    copticDay: coptic.day,
    copticMonth: coptic.monthName,
    copticYear: coptic.year,
    gregDay: d,
    gregMonth: GREG_MONTHS[lang][m - 1],
    gregYear: y,
    pharaonicYear: coptic.year + 5020, // 1742 + 5020 = 6762
  };
}