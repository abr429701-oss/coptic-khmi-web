export interface RemoteVisibility {
  lessons: Record<string, boolean>;
  bibleBooks: Record<string, boolean>;
  bibleTranslations: Record<string, boolean>;
}

export const DEFAULT_REMOTE_VISIBILITY: RemoteVisibility = {
  lessons: {},
  bibleBooks: {},
  bibleTranslations: { ar: true, en: true, gr: true, he: true, cb: true, sy: true },
};

export const BIBLE_BOOK_VISIBILITY_ITEMS = [
  { id: "1", title: "التكوين", testament: "old" },
  { id: "2", title: "الخروج", testament: "old" },
  { id: "3", title: "اللاويين", testament: "old" },
  { id: "4", title: "العدد", testament: "old" },
  { id: "5", title: "التثنية", testament: "old" },
  { id: "6", title: "يشوع", testament: "old" },
  { id: "7", title: "القضاة", testament: "old" },
  { id: "8", title: "راعوث", testament: "old" },
  { id: "9", title: "صموئيل الأول", testament: "old" },
  { id: "10", title: "صموئيل الثاني", testament: "old" },
  { id: "11", title: "الملوك الأول", testament: "old" },
  { id: "12", title: "الملوك الثاني", testament: "old" },
  { id: "13", title: "أخبار الأيام الأول", testament: "old" },
  { id: "14", title: "أخبار الأيام الثاني", testament: "old" },
  { id: "15", title: "عزرا", testament: "old" },
  { id: "16", title: "نحميا", testament: "old" },
  { id: "17", title: "أستير", testament: "old" },
  { id: "18", title: "أيوب", testament: "old" },
  { id: "19", title: "المزامير", testament: "old" },
  { id: "20", title: "الأمثال", testament: "old" },
  { id: "21", title: "الجامعة", testament: "old" },
  { id: "22", title: "نشيد الأنشاد", testament: "old" },
  { id: "23", title: "إشعياء", testament: "old" },
  { id: "24", title: "إرميا", testament: "old" },
  { id: "25", title: "مراثي إرميا", testament: "old" },
  { id: "26", title: "حزقيال", testament: "old" },
  { id: "27", title: "دانيال", testament: "old" },
  { id: "28", title: "هوشع", testament: "old" },
  { id: "29", title: "يوئيل", testament: "old" },
  { id: "30", title: "عاموس", testament: "old" },
  { id: "31", title: "عوبديا", testament: "old" },
  { id: "32", title: "يونان", testament: "old" },
  { id: "33", title: "ميخا", testament: "old" },
  { id: "34", title: "ناحوم", testament: "old" },
  { id: "35", title: "حبقوق", testament: "old" },
  { id: "36", title: "صفنيا", testament: "old" },
  { id: "37", title: "حجي", testament: "old" },
  { id: "38", title: "زكريا", testament: "old" },
  { id: "39", title: "ملاخي", testament: "old" },
  { id: "40", title: "إنجيل متى", testament: "new" },
  { id: "41", title: "إنجيل مرقس", testament: "new" },
  { id: "42", title: "إنجيل لوقا", testament: "new" },
  { id: "43", title: "إنجيل يوحنا", testament: "new" },
  { id: "44", title: "أعمال الرسل", testament: "new" },
  { id: "45", title: "رومية", testament: "new" },
  { id: "46", title: "1 كورنثوس", testament: "new" },
  { id: "47", title: "2 كورنثوس", testament: "new" },
  { id: "48", title: "غلاطية", testament: "new" },
  { id: "49", title: "أفسس", testament: "new" },
  { id: "50", title: "فيلبي", testament: "new" },
  { id: "51", title: "كولوسي", testament: "new" },
  { id: "52", title: "1 تسالونيكي", testament: "new" },
  { id: "53", title: "2 تسالونيكي", testament: "new" },
  { id: "54", title: "1 تيموثاوس", testament: "new" },
  { id: "55", title: "2 تيموثاوس", testament: "new" },
  { id: "56", title: "تيطس", testament: "new" },
  { id: "57", title: "فليمون", testament: "new" },
  { id: "58", title: "العبرانيين", testament: "new" },
  { id: "59", title: "يعقوب", testament: "new" },
  { id: "60", title: "1 بطرس", testament: "new" },
  { id: "61", title: "2 بطرس", testament: "new" },
  { id: "62", title: "1 يوحنا", testament: "new" },
  { id: "63", title: "2 يوحنا", testament: "new" },
  { id: "64", title: "3 يوحنا", testament: "new" },
  { id: "65", title: "يهوذا", testament: "new" },
  { id: "66", title: "الرؤيا", testament: "new" },
  { id: "67", title: "سفر طوبيا", testament: "deutero" },
  { id: "68", title: "سفر يهوديت", testament: "deutero" },
  { id: "69", title: "تتمة سفر أستير", testament: "deutero" },
  { id: "70", title: "سفر الحكمة", testament: "deutero" },
  { id: "71", title: "سفر يشوع بن سيراخ", testament: "deutero" },
  { id: "72", title: "سفر نبوة باروخ", testament: "deutero" },
  { id: "73", title: "تتمة سفر دانيال", testament: "deutero" },
  { id: "74", title: "سفر المكابيين الأول", testament: "deutero" },
  { id: "75", title: "سفر المكابيين الثاني", testament: "deutero" },
  { id: "76", title: "المزمور 151", testament: "deutero" },
] as const;

export const BIBLE_TRANSLATION_VISIBILITY_ITEMS = [
  { id: "ar", label: "العربية" },
  { id: "en", label: "الإنجليزية" },
  { id: "gr", label: "اليونانية" },
  { id: "he", label: "العبرية" },
  { id: "cb", label: "القبطية" },
  { id: "sy", label: "السريانية" },
] as const;

export function normalizeLessonLevel(level: string | number): "1" | "2" {
  const value = String(level).trim().toLowerCase().replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  return value.includes("الثاني") || /(?:^|\D)2(?:\D|$)/.test(value) ? "2" : "1";
}

export function lessonVisibilityKey(level: string | number, videoId: string): string {
  return `l${normalizeLessonLevel(level)}_${videoId}`;
}

export function mergeRemoteVisibility(value?: Partial<RemoteVisibility> | null): RemoteVisibility {
  return {
    lessons: { ...DEFAULT_REMOTE_VISIBILITY.lessons, ...(value?.lessons || {}) },
    bibleBooks: { ...DEFAULT_REMOTE_VISIBILITY.bibleBooks, ...(value?.bibleBooks || {}) },
    bibleTranslations: { ...DEFAULT_REMOTE_VISIBILITY.bibleTranslations, ...(value?.bibleTranslations || {}) },
  };
}
