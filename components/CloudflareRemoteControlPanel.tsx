import React, { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { CLOUDFLARE_API_BASE, DEFAULT_REMOTE_SETTINGS, type CloudflareAdminSession, type RemoteAppSettings } from "@/lib/cloudflare";
import { INITIAL_LESSONS } from "@/assets/lessonCatalog";
import { previewDictionarySource, type DictionarySourceConfig } from "@/hooks/useDictionary";
import { CloudflareBibleAdminPanel } from "@/components/CloudflareBibleAdminPanel";
import { BIBLE_BOOK_VISIBILITY_ITEMS, BIBLE_TRANSLATION_VISIBILITY_ITEMS, lessonVisibilityKey, mergeRemoteVisibility, normalizeLessonLevel, type RemoteVisibility } from "@/lib/remoteVisibility";
import { useAppConfig } from "@/contexts/AppConfigContext";

interface Props { session: CloudflareAdminSession | null; }

const CONTROL_GROUPS: { title: string; fields: { key: keyof RemoteAppSettings["controls"]; label: string }[] }[] = [
  { title: "عناصر القائمة الرئيسية", fields: [
    { key: "nav_home", label: "الرئيسية" }, { key: "nav_learn_coptic", label: "تعلم اللغة القبطية" }, { key: "nav_coptic_bible", label: "الكتاب المقدس" },
    { key: "nav_name_coptic", label: "اكتب اسمك بالقبطي" }, { key: "nav_training", label: "التدريبات" },
    { key: "nav_favorites", label: "المفضلة" }, { key: "nav_history", label: "السجل" },
    { key: "nav_download", label: "تنزيل القاموس" }, { key: "nav_about", label: "عن التطبيق" },
  ] },
  { title: "العناصر الداخلية للقائمة الجانبية", fields: [
    { key: "drawer_dark_mode", label: "مفتاح الوضع الليلي" },
    { key: "drawer_language", label: "اختيار لغة التطبيق" },
    { key: "drawer_contact_heading", label: "عنوان قسم تواصل معنا" },
    { key: "drawer_social_section", label: "منطقة روابط التواصل الاجتماعي" },
    { key: "drawer_admin_message", label: "رسالة الإدارة داخل القائمة" },
    { key: "drawer_version_label", label: "رقم إصدار التطبيق" },
  ] },
  { title: "القاموس والبحث", fields: [
    { key: "dictionary_filter_button", label: "زر التصفية في البحث" },
    { key: "dictionary_coptic_keyboard", label: "زر لوحة المفاتيح القبطية" },
    { key: "dictionary_result_counter", label: "عداد النتائج" },
    { key: "dictionary_result_index", label: "ترقيم بطاقات النتائج" },
    { key: "dictionary_meaning_count", label: "عدد المعاني الإضافية" },
    { key: "dictionary_result_audio", label: "زر نطق الكلمة في النتائج" },
    { key: "dictionary_secondary_meaning", label: "إظهار الكلمة المقابلة أسفل النتيجة" },
    { key: "dictionary_word_metadata", label: "نوع الكلمة وأصلها" },
    { key: "dictionary_clear_query", label: "زر مسح عبارة البحث" },
    { key: "dictionary_search_logo", label: "أيقونة القاموس بجوار البحث" },
    { key: "home_coptic_date_bar", label: "شريط التاريخ القبطي في الرئيسية" },
  ] },
  { title: "أقسام شاشة عن التطبيق", fields: [
    { key: "about_features", label: "مميزات التطبيق" }, { key: "about_sources", label: "المراجع المعجمية" },
    { key: "about_social", label: "وسائل التواصل" }, { key: "about_bots", label: "بوتات مفيدة" },
    { key: "about_whatsapp_channel", label: "قناة واتساب" }, { key: "about_suggestion", label: "تقديم اقتراح" },
    { key: "about_website", label: "الموقع الإلكتروني" }, { key: "about_share", label: "مشاركة التطبيق" },
    { key: "about_computer_download", label: "تحميل التطبيق للكمبيوتر" },
  ] },
  { title: "اختصارات وروابط", fields: [
    { key: "link_social_facebook", label: "رابط فيسبوك الاجتماعي" }, { key: "link_social_whatsapp", label: "رابط واتساب الاجتماعي" },
    { key: "link_social_telegram", label: "رابط تيليجرام الاجتماعي" },
    { key: "link_bot_whatsapp", label: "بوت واتساب" }, { key: "link_bot_facebook", label: "بوت فيسبوك" },
    { key: "link_bot_telegram_learning", label: "بوت تعلم تيليجرام" }, { key: "link_bot_telegram_dictionary", label: "بوت قاموس تيليجرام" },
    { key: "link_whatsapp_channel", label: "قناة واتساب" },
    { key: "home_favorites_shortcut", label: "اختصار المفضلة في الرئيسية" },
    { key: "home_connection_status", label: "حالة الاتصال في الرئيسية" }, { key: "home_announcement", label: "إظهار إعلان الرئيسية" },
  ] },
  { title: "أجزاء داخل تعلم اللغة القبطية", fields: [
    { key: "learn_intro_video", label: "الفيديو التعريفي" }, { key: "learn_letter_intro", label: "مقدمة الحروف" },
    { key: "learn_review_videos", label: "فيديوهات المراجعة" },
    { key: "learn_summary_button", label: "زر ملخص الدرس" }, { key: "learn_oral_button", label: "زر الشفوي / التدريب" },
    { key: "learn_exam_button", label: "زر امتحان الدرس" }, { key: "learn_glossary_button", label: "زر قاموس كلمات الدرس" },
    { key: "learn_download_button", label: "زر تنزيل محتوى الدرس" },
  ] },
  { title: "أنماط داخل قائمة التدريبات", fields: [
    { key: "training_listening", label: "التدريب بالاستماع" }, { key: "training_handwriting", label: "تدريب الكتابة" },
    { key: "training_grammar_quiz", label: "تدريب القواعد" }, { key: "training_word_scramble", label: "ترتيب الحروف" },
    { key: "training_matching", label: "توصيل الكلمات" }, { key: "training_stats", label: "إحصائيات الكتابة" },
  ] },
  { title: "أقسام داخل قائمة الكتاب المقدس", fields: [
    { key: "bible_old_testament", label: "أسفار العهد القديم" },
    { key: "bible_new_testament", label: "أسفار العهد الجديد" },
    { key: "bible_deuterocanonical", label: "الأسفار القانونية الثانية" },
    { key: "bible_search", label: "البحث عن آية أو سفر" },
    { key: "bible_translation_controls", label: "اختيار الترجمات الظاهرة" },
    { key: "bible_cross_references", label: "الإحالات المرجعية" },
    { key: "bible_export_controls", label: "أزرار تصدير الفصل" },
    { key: "bible_layout_modes", label: "أزرار نمط عرض الترجمات" },
    { key: "bible_verse_actions", label: "نسخ ومشاركة الآية" },
  ] },
];

const LABEL_FIELDS: { key: keyof RemoteAppSettings["labels"]; label: string; fallback: string }[] = [
  { key: "nav_home", label: "الرئيسية", fallback: "الرئيسية" },
  { key: "nav_learn_coptic", label: "تعلم اللغة القبطية", fallback: "تعلم اللغة القبطية" },
  { key: "nav_coptic_bible", label: "الكتاب المقدس", fallback: "الكتاب المقدس" },
  { key: "nav_name_coptic", label: "اكتب اسمك بالقبطي", fallback: "اكتب اسمك بالقبطي" },
  { key: "nav_training", label: "التدريبات", fallback: "التدريبات" },
  { key: "nav_favorites", label: "المفضلة", fallback: "المفضلة" },
  { key: "nav_history", label: "السجل", fallback: "السجل" },
  { key: "nav_download", label: "تنزيل القاموس", fallback: "تنزيل القاموس" },
  { key: "nav_about", label: "عن التطبيق", fallback: "عن التطبيق" },
  { key: "about_desktop_download", label: "تحميل التطبيق للكمبيوتر", fallback: "تحميل التطبيق للكمبيوتر" },
];

const BUTTON_LABEL_FIELDS: { key: keyof RemoteAppSettings["labels"]; label: string; fallback: string }[] = [
  { key: "button_home_favorites", label: "اختصار المفضلة في الرئيسية", fallback: "المفضلة" },
  { key: "button_search_filter", label: "زر تصفية البحث", fallback: "تصفية البحث" },
  { key: "button_search_keyboard", label: "زر لوحة المفاتيح القبطية", fallback: "لوحة المفاتيح القبطية" },
  { key: "button_search_clear", label: "زر مسح البحث", fallback: "مسح البحث" },
  { key: "button_training_listening", label: "زر تدريب الاستماع", fallback: "تدريب الاستماع" },
  { key: "button_training_handwriting", label: "زر تدريب الكتابة", fallback: "تدريب الكتابة" },
  { key: "button_training_grammar_quiz", label: "زر تدريب القواعد", fallback: "تدريب القواعد" },
  { key: "button_training_word_scramble", label: "زر ترتيب الحروف", fallback: "ترتيب الحروف" },
  { key: "button_training_matching", label: "زر توصيل الكلمات", fallback: "توصيل الكلمات" },
  { key: "button_training_stats", label: "زر إحصائيات التدريب", fallback: "إحصائيات الكتابة" },
  { key: "button_bible_scope_all", label: "زر نطاق البحث: الكل", fallback: "الكل" },
  { key: "button_bible_scope_old", label: "زر نطاق البحث: العهد القديم", fallback: "العهد القديم" },
  { key: "button_bible_scope_new", label: "زر نطاق البحث: العهد الجديد", fallback: "العهد الجديد" },
  { key: "button_bible_scope_deuterocanonical", label: "زر نطاق البحث: الأسفار القانونية الثانية", fallback: "الأسفار القانونية الثانية" },
  { key: "button_bible_scope_book", label: "زر اختيار سفر", fallback: "اختيار سفر" },
  { key: "button_bible_layout_stacked", label: "زر عرض الترجمات المتتابع", fallback: "متتابع" },
  { key: "button_bible_layout_table", label: "زر العرض الجدولي للترجمات", fallback: "جدولي" },
  { key: "button_bible_export_word", label: "زر تصدير Word", fallback: "تصدير إلى Word" },
  { key: "button_bible_export_pptx", label: "زر تصدير PowerPoint", fallback: "تصدير إلى PowerPoint" },
  { key: "button_bible_export_pdf", label: "زر تصدير PDF", fallback: "تصدير إلى PDF" },
  { key: "button_bible_export_excel", label: "زر تصدير Excel", fallback: "تصدير إلى Excel" },
  { key: "button_bible_verse_download", label: "زر حفظ الآية كصورة", fallback: "حفظ الآية كصورة" },
  { key: "button_bible_verse_copy", label: "زر نسخ الآية", fallback: "نسخ الآية" },
  { key: "button_lesson_summary", label: "زر ملخص الدرس", fallback: "ملخص" },
  { key: "button_lesson_training", label: "زر التدريب/الشفوي للدرس", fallback: "الشفوي / التدريب" },
  { key: "button_lesson_exam", label: "زر امتحان الدرس", fallback: "الامتحان" },
  { key: "button_lesson_glossary", label: "زر قاموس كلمات الدرس", fallback: "قاموس كلمات الدرس" },
  { key: "button_lesson_download", label: "زر تنزيل الدرس", fallback: "تنزيل الدرس" },
  { key: "button_final_exam", label: "زر الامتحان النهائي", fallback: "الامتحان النهائي" },
  { key: "button_get_certificate", label: "زر الحصول على الشهادة", fallback: "الحصول على الشهادة" },
  { key: "button_about_share", label: "زر مشاركة التطبيق", fallback: "مشاركة التطبيق" },
  { key: "button_about_suggestion", label: "زر إرسال اقتراح", fallback: "تقديم اقتراح" },
  { key: "button_about_website", label: "زر فتح الموقع", fallback: "فتح الموقع" },
  { key: "button_about_whatsapp_channel", label: "زر قناة واتساب", fallback: "قناة واتساب" },
];

type VisibilityLesson = { level: string; title: string; category?: string; videoId: string };
const VISIBILITY_LESSONS = (INITIAL_LESSONS as VisibilityLesson[]).filter((lesson) => /الدرس|lesson/i.test(lesson.category || lesson.title || ""));
const LESSONS_BY_LEVEL = {
  "1": VISIBILITY_LESSONS.filter((lesson) => normalizeLessonLevel(lesson.level) === "1"),
  "2": VISIBILITY_LESSONS.filter((lesson) => normalizeLessonLevel(lesson.level) === "2"),
};

const CONTENT_FIELDS: { key: keyof RemoteAppSettings["content"]; label: string; multiline?: boolean; hint?: string }[] = [
  { key: "announcementText", label: "نص إعلان الرئيسية", multiline: true, hint: "اتركه فارغًا لإخفاء الإعلان. يدعم تاريخ بداية ونهاية اختياريين أدناه." },
  { key: "announcementTextAr", label: "الإعلان بالعربية", multiline: true },
  { key: "announcementTextEn", label: "الإعلان بالإنجليزية", multiline: true },
  { key: "announcementTextFr", label: "الإعلان بالفرنسية", multiline: true },
  { key: "announcementTextDe", label: "الإعلان بالألمانية", multiline: true },
  { key: "announcementStartsAt", label: "بداية الإعلان (ISO أو اتركه فارغًا)", hint: "مثال: 2026-12-01T09:00:00+02:00" },
  { key: "announcementEndsAt", label: "نهاية الإعلان (ISO أو اتركه فارغًا)", hint: "مثال: 2026-12-05T23:59:00+02:00" },
  { key: "drawerMessage", label: "رسالة القائمة الجانبية", multiline: true },
  { key: "drawerMessageAr", label: "رسالة القائمة بالعربية", multiline: true },
  { key: "drawerMessageEn", label: "رسالة القائمة بالإنجليزية", multiline: true },
  { key: "drawerMessageFr", label: "رسالة القائمة بالفرنسية", multiline: true },
  { key: "drawerMessageDe", label: "رسالة القائمة بالألمانية", multiline: true },
  { key: "appLatestVersion", label: "إصدار Cloudflare للتطبيق", hint: "صيغة مثل 2.4.1. يقارن التطبيق هذا الرقم مع Google Sheet ويختار الأعلى؛ املأ رابط التنزيل معه ليُعتمد كإصدار Cloudflare كامل." },
  { key: "appUpdateUrl", label: "رابط تنزيل التحديث المباشر", hint: "رابط HTTPS مباشر لملف APK. يُربط برقم Cloudflare، أو يُستخدم مع رقم الجدول إذا لم تضع رقم Cloudflare. QR والمشاركة يتبعان رابط الإصدار المختار." },
  { key: "desktopDownloadUrl", label: "رابط تنزيل نسخة الكمبيوتر", hint: "اتركه فارغًا حتى تجهز رابط التحميل. يجب أن يبدأ بـ https://." },
  { key: "appWhatsNewAr", label: "ما الجديد - العربية", multiline: true, hint: "اتركه فارغًا لاستخدام النص الموجود في Google Sheet." },
  { key: "appWhatsNewEn", label: "What's new - English", multiline: true, hint: "Leave blank to use the Google Sheet text." },
  { key: "appWhatsNewFr", label: "Nouveautés - français", multiline: true, hint: "Laissez vide pour utiliser le texte de Google Sheet." },
  { key: "appWhatsNewDe", label: "Neuigkeiten - Deutsch", multiline: true, hint: "Leer lassen, um den Text aus Google Sheet zu verwenden." },
  { key: "dictionaryMaxResults", label: "أقصى عدد نتائج البحث (1–10000)", hint: "5000 افتراضيًا." },
  { key: "dictionaryMinSearchLength", label: "الحد الأدنى لطول عبارة البحث (1–5)", hint: "يحدد متى يبدأ التطبيق بعرض النتائج." },
  { key: "dictionarySortMode", label: "ترتيب نتائج القاموس", hint: "source أو coptic أو meaning أو audio." },
  { key: "websiteUrl", label: "رابط الموقع" }, { key: "socialFacebookUrl", label: "رابط فيسبوك" },
  { key: "socialWhatsAppUrl", label: "رابط واتساب الاجتماعي" }, { key: "socialTelegramUrl", label: "رابط تيليجرام" },
  { key: "usefulBotsWhatsAppUrl", label: "رابط بوت واتساب" }, { key: "usefulBotsFacebookUrl", label: "رابط بوت فيسبوك" },
  { key: "usefulBotsTelegramLearningUrl", label: "رابط بوت تعلم تيليجرام" }, { key: "usefulBotsTelegramDictionaryUrl", label: "رابط بوت القاموس تيليجرام" },
  { key: "whatsappChannelUrl", label: "رابط قناة واتساب" },
];

async function parseResponse(response: Response) { return response.json().catch(() => ({})); }

export function CloudflareRemoteControlPanel({ session }: Props) {
  const { refreshRemoteSettings } = useAppConfig();
  const [settings, setSettings] = useState<RemoteAppSettings>(DEFAULT_REMOTE_SETTINGS);
  const [publishedAppVersion, setPublishedAppVersion] = useState(DEFAULT_REMOTE_SETTINGS.content.appLatestVersion);
  const [checkingDictionarySource, setCheckingDictionarySource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!session || Date.now() >= session.expiresAt) return;
    setLoading(true);
    try {
      const response = await fetch(`${CLOUDFLARE_API_BASE}/admin/settings`, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store" });
      const data = await parseResponse(response);
      if (!response.ok) throw new Error(data.error || "تعذر تحميل إعدادات مركز التحكم. تأكد من نشر Worker المحدّث.");
      setSettings({
        usefulBots: { ...DEFAULT_REMOTE_SETTINGS.usefulBots, ...(data.usefulBots || {}) },
        controls: { ...DEFAULT_REMOTE_SETTINGS.controls, ...(data.controls || {}) },
        visibility: mergeRemoteVisibility(data.visibility),
        content: { ...DEFAULT_REMOTE_SETTINGS.content, ...(data.content || {}) },
        labels: { ...DEFAULT_REMOTE_SETTINGS.labels, ...(data.labels || {}) },
        notificationSchedule: { ...DEFAULT_REMOTE_SETTINGS.notificationSchedule, ...(data.notificationSchedule || {}) },
        updatedAt: data.updatedAt,
      });
      setPublishedAppVersion(String(data.content?.appLatestVersion || "").trim());
      setDirty(false);
    } catch (error) { Alert.alert("مركز التحكم", error instanceof Error ? error.message : "تعذر الاتصال بـCloudflare."); }
    finally { setLoading(false); }
  }, [session]);

  const loadHistory = useCallback(async () => {
    if (!session || Date.now() >= session.expiresAt) return;
    try {
      const response = await fetch(`${CLOUDFLARE_API_BASE}/admin/settings/history`, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store" });
      const data = await parseResponse(response);
      if (response.ok) setHistory(Array.isArray(data.history) ? data.history : []);
    } catch { /* optional panel */ }
  }, [session]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const updateControl = (key: keyof RemoteAppSettings["controls"], value: boolean) => {
    setSettings((old) => ({ ...old, controls: { ...old.controls, [key]: value } }));
    setDirty(true);
  };
  const updateVisibility = (group: keyof RemoteVisibility, id: string, value: boolean) => {
    setSettings((old) => ({ ...old, visibility: { ...old.visibility, [group]: { ...old.visibility[group], [id]: value } } }));
    setDirty(true);
  };
  const updateContent = (key: keyof RemoteAppSettings["content"], value: string) => {
    setSettings((old) => ({ ...old, content: { ...old.content, [key]: value } }));
    setDirty(true);
  };
  const updateLabel = (key: keyof RemoteAppSettings["labels"], value: string) => {
    setSettings((old) => ({ ...old, labels: { ...old.labels, [key]: value } }));
    setDirty(true);
  };
  const updateNotificationSchedule = (key: keyof RemoteAppSettings["notificationSchedule"], value: string) => {
    setSettings((old) => ({ ...old, notificationSchedule: { ...old.notificationSchedule, [key]: value } }));
    setDirty(true);
  };

  const save = async (next = settings, includeBots = false) => {
    if (!session || Date.now() >= session.expiresAt) { Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول من لوحة إشعارات Cloudflare أولًا."); return; }
    const invalidSchedule = Object.entries(next.notificationSchedule).find(([, value]) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
    if (invalidSchedule) { Alert.alert("وقت إشعار غير صالح", `أدخل كل الأوقات بصيغة 24 ساعة HH:MM (مثال: 00:40 أو 14:05). الحقل غير الصالح: ${invalidSchedule[0]}`); return; }
    setBusy(true);
    try {
      const releaseVersionChanged = Boolean(next.content.appLatestVersion.trim()) && next.content.appLatestVersion.trim() !== publishedAppVersion;
      const response = await fetch(`${CLOUDFLARE_API_BASE}/admin/settings`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ ...(includeBots ? { usefulBots: next.usefulBots } : {}), controls: next.controls, visibility: next.visibility, content: next.content, labels: next.labels, notificationSchedule: next.notificationSchedule }),
      });
      const data = await parseResponse(response);
      if (!response.ok) throw new Error(data.error || "تعذر حفظ إعدادات مركز التحكم.");
      setSettings({ ...next, usefulBots: { ...next.usefulBots, ...(data.usefulBots || {}) }, visibility: mergeRemoteVisibility(data.visibility || next.visibility), notificationSchedule: { ...next.notificationSchedule, ...(data.notificationSchedule || {}) }, updatedAt: data.updatedAt });
      setPublishedAppVersion(next.content.appLatestVersion.trim());
      await refreshRemoteSettings();
      setDirty(false);
      setPreview(false);
      void loadHistory();
      if (releaseVersionChanged && next.content.appUpdateUrl.trim()) {
        try {
          const adminExpoToken = await AsyncStorage.getItem("@khmi/last_valid_expo_token");
          const pushResponse = await fetch(`${CLOUDFLARE_API_BASE}/admin/app-update/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
            body: JSON.stringify({ adminExpoToken }),
          });
          const pushData = await parseResponse(pushResponse);
          if (!pushResponse.ok) throw new Error(pushData.error || "تعذر إرسال Push التحديث");
          if (pushData.status === "already_processed") {
            Alert.alert("تم النشر", `تم حفظ الإصدار ${next.content.appLatestVersion}، لكن إشعار هذا الإصدار أُرسل أو عولج سابقًا.`);
          } else {
            Alert.alert("تم النشر", `تم حفظ الإصدار ${next.content.appLatestVersion} وإرسال Push إلى ${pushData.totalTargets || 0} جهاز. تم قبول ${pushData.acceptedByExpo || 0} من Expo. النطاق: ${pushData.audience === "publisher_admin_device" ? "جهاز المشرف الحالي فقط" : "الأجهزة ذات الإصدارات الأقدم"}.`);
          }
        } catch (pushError) {
          Alert.alert("تم حفظ الإعدادات لكن تعذر إرسال Push", pushError instanceof Error ? pushError.message : "تحقق من نشر Worker وتسجيل جهاز المشرف.");
        }
      } else {
        Alert.alert("تم النشر", "تم حفظ التغييرات في Cloudflare، وستظهر للمستخدمين عند تحديث إعدادات التطبيق.");
      }
    } catch (error) { Alert.alert("تعذر الحفظ", error instanceof Error ? error.message : "تحقق من الاتصال ونشر Worker المحدّث."); }
    finally { setBusy(false); }
  };

  const restoreDefaults = () => Alert.alert("استعادة الإعدادات الافتراضية", "سيتم إظهار الأقسام والروابط وإفراغ رسائل الإعلان المخصصة. هل تريد المتابعة؟", [
    { text: "إلغاء", style: "cancel" },
    { text: "استعادة", style: "destructive", onPress: () => {
      const restored = { ...DEFAULT_REMOTE_SETTINGS, usefulBots: { ...DEFAULT_REMOTE_SETTINGS.usefulBots }, controls: { ...DEFAULT_REMOTE_SETTINGS.controls }, visibility: mergeRemoteVisibility(DEFAULT_REMOTE_SETTINGS.visibility), content: { ...DEFAULT_REMOTE_SETTINGS.content }, labels: { ...DEFAULT_REMOTE_SETTINGS.labels } };
      setSettings(restored); setDirty(true); void save(restored, true);
    } },
  ]);

  const historyRows = useMemo(() => history.slice(0, 8), [history]);
  const previewDictionary = async () => {
    const c = settings.content;
    const source: DictionarySourceConfig = {
      spreadsheet: c.dictionarySpreadsheet, sheetName: c.dictionarySheetName,
      columns: { coptic: c.dictionaryColumnCoptic, arabic: c.dictionaryColumnArabic, english: c.dictionaryColumnEnglish, french: c.dictionaryColumnFrench, german: c.dictionaryColumnGerman, origin: c.dictionaryColumnOrigin, wordType: c.dictionaryColumnWordType, audio: c.dictionaryColumnAudio, gender: c.dictionaryColumnGender },
    };
    setCheckingDictionarySource(true);
    try {
      const result = await previewDictionarySource(source);
      const sample = result.sample.map((entry, index) => `${index + 1}. ${entry.coptic} — ${entry.arabic}`).join("\n");
      Alert.alert("نجح فحص مصدر القاموس", `تم تحميل ${result.entryCount} مدخلًا. عينة:\n${sample}`);
    } catch (error) {
      Alert.alert("تعذر فحص الشيت", error instanceof Error ? error.message : String(error));
    } finally { setCheckingDictionarySource(false); }
  };
  const previewAnnouncement = settings.content.announcementText || settings.content.announcementTextAr || settings.content.announcementTextEn || settings.content.announcementTextFr || settings.content.announcementTextDe;
  const activeAnnouncement = Boolean(settings.controls.home_announcement && previewAnnouncement.trim());
  const visibilityValues = [...Object.values(settings.visibility.lessons), ...Object.values(settings.visibility.bibleBooks), ...Object.values(settings.visibility.bibleTranslations)];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.mark}><Feather name="sliders" size={20} color="#C8A951" /></View>
        <View style={styles.heading}><Text style={styles.title}>مركز التحكم عن بُعد · للأدمن فقط</Text><Text style={styles.subtitle}>تغييرات الظهور تُرسل إلى التطبيق؛ ويحتاج أي تحكم جديد دعمًا مرة واحدة في إصدار التطبيق.</Text></View>
        <TouchableOpacity onPress={() => void loadSettings()} disabled={loading || !session} style={styles.iconButton}>
          {loading ? <ActivityIndicator size="small" color="#C8A951" /> : <Feather name="refresh-cw" size={17} color="#C8A951" />}
        </TouchableOpacity>
      </View>
      {!session && <Text style={styles.warning}>سجّل الدخول من لوحة Cloudflare أعلاه لتعديل الإعدادات.</Text>}
      <View style={styles.summary}><Text style={styles.summaryText}>{Object.values(settings.controls).filter(Boolean).length} عنصر عام ظاهر · {Object.values(settings.controls).length - Object.values(settings.controls).filter(Boolean).length} مخفي</Text><Text style={styles.summaryText}>{visibilityValues.filter(Boolean).length} درس/سفر/ترجمة ظاهر · {visibilityValues.length - visibilityValues.filter(Boolean).length} مخفي</Text><Text style={styles.summaryText}>آخر تحديث: {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString("ar-EG") : "—"}</Text></View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>جدولة الإشعارات لكل المستخدمين</Text>
        <Text style={styles.hint}>تُحفظ الأوقات بتوقيت الجهاز المحلي لكل مستخدم. بعد الحفظ يجلب التطبيق الجدول خلال 30 ثانية، ويخزنه محليًا ويستبدل المواعيد القديمة عند اتصاله بالإنترنت. أدخل الوقت بنظام 24 ساعة HH:MM.</Text>
        {([
          ["dailyWord", "الكلمة اليومية (الافتراضي 00:40)"],
          ["copticMonth", "بداية كل شهر قبطي"],
          ["copticNewYear", "بداية السنة القبطية"],
          ["gregorianNewYear", "بداية السنة الميلادية"],
          ["audioFirstDownload", "تذكير تنزيل الصوتيات لأول مرة"],
          ["audioContinueDownload", "تذكير استكمال تنزيل الصوتيات"],
        ] as const).map(([key, label]) => <View key={key} style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{label}</Text>
          <TextInput value={settings.notificationSchedule[key]} onChangeText={(value) => updateNotificationSchedule(key, value)} editable={Boolean(session) && !busy} placeholder="HH:MM" placeholderTextColor="#64748B" keyboardType="numbers-and-punctuation" maxLength={5} style={[styles.input, { textAlign: "center", width: 110, alignSelf: "flex-end" }]} />
        </View>)}
      </View>

      {CONTROL_GROUPS.map((group) => <View key={group.title} style={styles.group}>
        <Text style={styles.groupTitle}>{group.title}</Text>
        {group.fields.map((field) => <View key={field.key} style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{field.label}</Text>
          <Switch value={settings.controls[field.key]} onValueChange={(value) => updateControl(field.key, value)} disabled={!session || loading || busy} trackColor={{ false: "#334155", true: "#927A35" }} thumbColor={settings.controls[field.key] ? "#E7C65B" : "#CBD5E1"} />
        </View>)}
      </View>)}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>تغيير أسماء القوائم الرئيسية</Text>
        <Text style={styles.hint}>اترك الحقل فارغًا لاستخدام الاسم الافتراضي. الاسم المخصص يظهر كما هو في جميع لغات التطبيق.</Text>
        {LABEL_FIELDS.map((field) => <View key={field.key} style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{field.label}</Text>
          <TextInput value={settings.labels[field.key]} onChangeText={(value) => updateLabel(field.key, value)} editable={Boolean(session) && !busy} placeholder={field.fallback} placeholderTextColor="#64748B" maxLength={60} style={styles.input} />
        </View>)}
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>تغيير أسماء الأزرار الداخلية</Text>
        <Text style={styles.hint}>هذه أسماء دقيقة للأزرار داخل الشاشات وليست أسماء القوائم. اترك أي حقل فارغًا للحفاظ على الترجمة الافتراضية.</Text>
        {BUTTON_LABEL_FIELDS.map((field) => <View key={field.key} style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{field.label}</Text>
          <TextInput value={settings.labels[field.key]} onChangeText={(value) => updateLabel(field.key, value)} editable={Boolean(session) && !busy} placeholder={field.fallback} placeholderTextColor="#64748B" maxLength={60} style={styles.input} />
        </View>)}
      </View>

      {(["1", "2"] as const).map((level) => (
        <View key={`lessons-${level}`} style={styles.group}>
          <Text style={styles.groupTitle}>{level === "1" ? "دروس المستوى الأول" : "دروس المستوى الثاني"}</Text>
          {LESSONS_BY_LEVEL[level].map((lesson) => {
            const key = lessonVisibilityKey(lesson.level, lesson.videoId);
            return <View key={key} style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{lesson.category || lesson.title}</Text>
              <Switch value={settings.visibility.lessons[key] !== false} onValueChange={(value) => updateVisibility("lessons", key, value)} disabled={!session || loading || busy} trackColor={{ false: "#334155", true: "#927A35" }} thumbColor={settings.visibility.lessons[key] !== false ? "#E7C65B" : "#CBD5E1"} />
            </View>;
          })}
          {!LESSONS_BY_LEVEL[level].length && <Text style={styles.hint}>لا توجد دروس مسجلة لهذا المستوى في النسخة المحلية من فهرس الدروس.</Text>}
        </View>
      ))}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>الترجمات الظاهرة في الكتاب المقدس</Text>
        {BIBLE_TRANSLATION_VISIBILITY_ITEMS.map((item) => {
          const visible = settings.visibility.bibleTranslations[item.id] !== false;
          return <View key={item.id} style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{item.label}</Text>
            <Switch value={visible} onValueChange={(value) => updateVisibility("bibleTranslations", item.id, value)} disabled={!session || loading || busy} trackColor={{ false: "#334155", true: "#927A35" }} thumbColor={visible ? "#E7C65B" : "#CBD5E1"} />
          </View>;
        })}
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>إظهار كل سفر على حدة</Text>
        {(["old", "new", "deutero"] as const).map((testament) => <View key={testament}>
          <Text style={[styles.inputLabel, { marginTop: 8 }]}>{testament === "old" ? "العهد القديم" : testament === "new" ? "العهد الجديد" : "الأسفار القانونية الثانية"}</Text>
          {BIBLE_BOOK_VISIBILITY_ITEMS.filter((book) => book.testament === testament).map((book) => {
            const visible = settings.visibility.bibleBooks[book.id] !== false;
            return <View key={book.id} style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{book.title}</Text>
              <Switch value={visible} onValueChange={(value) => updateVisibility("bibleBooks", book.id, value)} disabled={!session || loading || busy} trackColor={{ false: "#334155", true: "#927A35" }} thumbColor={visible ? "#E7C65B" : "#CBD5E1"} />
            </View>;
          })}
        </View>)}
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>مصدر بيانات القاموس وتعيين الأعمدة</Text>
        <Text style={styles.hint}>استخدم رابط الشيت الكامل أو معرّفه. يجب أن يكون الشيت متاحًا للقراءة. اترك العمود الاختياري فارغًا لتجاهله. تغيير الإعدادات يعيد مزامنة القاموس؛ وتظل آخر نسخة سليمة محفوظة إذا فشل التحميل.</Text>
        {([
          ["dictionarySpreadsheet", "رابط Google Sheets أو المعرّف", "مثال: https://docs.google.com/spreadsheets/d/…/edit"],
          ["dictionarySheetName", "اسم ورقة العمل (Tab)", "dictionary"],
          ["dictionaryColumnCoptic", "عمود الكلمة القبطية (إلزامي)", "A"],
          ["dictionaryColumnArabic", "عمود المعنى العربي (إلزامي)", "C"],
          ["dictionaryColumnEnglish", "عمود المعنى الإنجليزي", "D أو اتركه فارغًا"],
          ["dictionaryColumnFrench", "عمود المعنى الفرنسي", "E أو اتركه فارغًا"],
          ["dictionaryColumnGerman", "عمود المعنى الألماني", "F أو اتركه فارغًا"],
          ["dictionaryColumnOrigin", "عمود الأصل", "J أو اتركه فارغًا"],
          ["dictionaryColumnWordType", "عمود نوع الكلمة", "K أو اتركه فارغًا"],
          ["dictionaryColumnAudio", "عمود رابط الصوت", "L أو اتركه فارغًا"],
          ["dictionaryColumnGender", "عمود الجنس النحوي", "اختياري"],
        ] as const).map(([key, label, placeholder]) => <View key={key} style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{label}</Text>
          <TextInput value={settings.content[key]} onChangeText={(value) => updateContent(key, value)} editable={Boolean(session) && !busy} placeholder={placeholder} placeholderTextColor="#64748B" autoCapitalize={key.includes("Column") ? "characters" : "none"} style={styles.input} />
        </View>)}
        <TouchableOpacity onPress={() => void previewDictionary()} disabled={!session || busy || checkingDictionarySource} style={[styles.secondaryButton, { marginTop: 10, opacity: !session || busy || checkingDictionarySource ? 0.5 : 1 }]}>
          {checkingDictionarySource ? <ActivityIndicator size="small" color="#C8A951" /> : <Feather name="check-circle" size={16} color="#C8A951" />}
          <Text style={styles.secondaryText}>{checkingDictionarySource ? "جارٍ فحص الشيت…" : "فحص المصدر وعرض عينة"}</Text>
        </TouchableOpacity>
      </View>

      <CloudflareBibleAdminPanel session={session} />

      <View style={styles.group}>
        <Text style={styles.groupTitle}>المحتوى والروابط والإعلان</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>سياسة التحديث</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {[
              { value: "sheet", label: "حسب Google Sheet" },
              { value: "mandatory", label: "إجباري" },
              { value: "optional", label: "اختياري" },
            ].map((option) => {
              const selected = settings.content.appUpdateMode === option.value;
              return <TouchableOpacity key={option.value} onPress={() => updateContent("appUpdateMode", option.value)} disabled={!session || busy} style={{ borderWidth: 1, borderColor: selected ? settings.content.brandColor : "#475569", backgroundColor: selected ? `${settings.content.brandColor}22` : "transparent", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginRight: 8, marginBottom: 8, opacity: !session || busy ? 0.5 : 1 }}>
                <Text style={{ color: selected ? settings.content.brandColor : "#CBD5E1", fontWeight: "700" }}>{option.label}</Text>
              </TouchableOpacity>;
            })}
          </View>
          <Text style={styles.hint}>تُطبق السياسة هنا على إصدار Cloudflare؛ وإذا كان إصدار Google Sheet أعلى فيستخدم حالة ذلك الإصدار. «حسب Google Sheet» يقرأ قيمة عمود الحالة.</Text>
        </View>
        <View style={styles.inputGroup}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>اختبار التحديث للأدمن فقط</Text>
            <Switch value={settings.content.appUpdateAdminOnly === "true"} onValueChange={(value) => updateContent("appUpdateAdminOnly", value ? "true" : "false")} disabled={!session || busy} trackColor={{ false: "#334155", true: "#927A35" }} thumbColor={settings.content.appUpdateAdminOnly === "true" ? "#E7C65B" : "#CBD5E1"} />
          </View>
          <Text style={styles.hint}>عند التفعيل، يرسل Push الإصدار الجديد إلى جهاز المشرف الذي نشره فقط للتجربة. عند الإيقاف، يرسل Push إلى الأجهزة المسجلة ذات الإصدار الأقدم. يُرسل الإشعار مرة واحدة لكل رقم إصدار.</Text>
        </View>
        {CONTENT_FIELDS.map((field) => <View key={field.key} style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{field.label}</Text>
          <TextInput value={settings.content[field.key]} onChangeText={(value) => updateContent(field.key, value)} editable={Boolean(session) && !busy} placeholder={field.hint || "أدخل القيمة"} placeholderTextColor="#64748B" multiline={field.multiline} autoCapitalize={field.key.endsWith("Url") ? "none" : "sentences"} keyboardType={field.key.endsWith("Url") ? "url" : "default"} style={[styles.input, field.multiline && styles.multiline]} />
          {field.hint && <Text style={styles.hint}>{field.hint}</Text>}
        </View>)}
        <Text style={styles.inputLabel}>اللون الأساسي (HEX)</Text>
        <View style={styles.colorRow}><View style={[styles.colorSwatch, { backgroundColor: /^#[0-9a-fA-F]{6}$/.test(settings.content.brandColor) ? settings.content.brandColor : "#8B0000" }]} /><TextInput value={settings.content.brandColor} onChangeText={(value) => updateContent("brandColor", value)} editable={Boolean(session) && !busy} autoCapitalize="characters" placeholder="#8B0000" placeholderTextColor="#64748B" style={[styles.input, { flex: 1 }]} /></View>
      </View>

      {preview && <View style={styles.previewBox}>
        <Text style={styles.previewCaption}>معاينة الإعلان (تقريبية)</Text>
        {activeAnnouncement ? <View style={[styles.announcementPreview, { borderColor: settings.content.brandColor }]}><Text style={styles.announcementText}>{previewAnnouncement}</Text></View> : <Text style={styles.hint}>لا يوجد إعلان ظاهر حاليًا أو تم إيقافه.</Text>}
        <Text style={styles.previewCaption}>معاينة رسالة القائمة</Text><Text style={styles.drawerPreview}>{settings.content.drawerMessage || "لا توجد رسالة للقائمة الجانبية"}</Text>
      </View>}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setPreview((value) => !value)}><Feather name="eye" size={16} color="#C8A951" /><Text style={styles.secondaryText}>{preview ? "إغلاق المعاينة" : "معاينة"}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.publishButton, (!dirty || !session || busy) && styles.disabled]} disabled={!dirty || !session || busy} onPress={() => void save()}>
          {busy ? <ActivityIndicator color="#172033" /> : <><Feather name="upload-cloud" size={16} color="#172033" /><Text style={styles.publishText}>حفظ ونشر</Text></>}
        </TouchableOpacity>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={restoreDefaults} disabled={!session || busy}><Feather name="rotate-ccw" size={16} color="#F87171" /><Text style={[styles.secondaryText, { color: "#F87171" }]}>استعادة الافتراضي</Text></TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => { setShowHistory((value) => !value); void loadHistory(); }} disabled={!session}><Feather name="clock" size={16} color="#94A3B8" /><Text style={styles.secondaryText}>سجل التعديلات</Text></TouchableOpacity>
      </View>
      {showHistory && <ScrollView style={styles.historyBox} nestedScrollEnabled>
        {historyRows.length ? historyRows.map((row, index) => <View key={`${row.at}-${index}`} style={styles.historyRow}>
          <Text style={styles.historyDate}>{new Date(row.at).toLocaleString("ar-EG")}</Text>
          <Text style={styles.hint}>تحديث: {(row.changed || []).join("، ")}</Text>
          {row.before?.controls && row.before?.content && <TouchableOpacity style={styles.restoreRowButton} disabled={!session || busy} onPress={() => Alert.alert("استعادة نسخة سابقة", "سيتم استبدال الإعدادات الحالية بهذه النسخة. هل تريد المتابعة؟", [
            { text: "إلغاء", style: "cancel" },
            { text: "استعادة", style: "destructive", onPress: () => void save({ ...settings, ...row.before }, true) },
          ])}><Feather name="rotate-ccw" size={13} color="#F87171" /><Text style={styles.restoreRowText}>استعادة هذه النسخة</Text></TouchableOpacity>}
        </View>) : <Text style={styles.hint}>لا توجد تغييرات مسجلة حتى الآن.</Text>}
      </ScrollView>}
      <Text style={styles.footnote}>هذه اللوحة داخل شاشة الإدارة المحمية ولا تُعرض للمستخدمين. بعد إصدار التطبيق الذي يتضمن مفاتيح التحكم الجديدة، تستطيع تغيير ظهور العناصر من Cloudflare دون تحديث آخر لكل تغيير. تُستخدم القيم الافتراضية عند انقطاع الشبكة.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: 24, backgroundColor: "#1E293B", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  header: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 }, mark: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(200,169,81,0.12)", alignItems: "center", justifyContent: "center" },
  heading: { flex: 1 }, title: { color: "#FFF", fontSize: 16, fontFamily: "Cairo_700Bold", textAlign: "right" }, subtitle: { color: "#94A3B8", fontSize: 11, fontFamily: "Cairo_400Regular", textAlign: "right", marginTop: 2 },
  iconButton: { width: 35, height: 35, alignItems: "center", justifyContent: "center" }, warning: { color: "#FBBF24", fontSize: 12, textAlign: "right", fontFamily: "Cairo_600SemiBold", marginBottom: 10 },
  summary: { padding: 11, borderRadius: 12, backgroundColor: "#0F172A", marginBottom: 10, gap: 4 }, summaryText: { color: "#94A3B8", fontSize: 11, textAlign: "right", fontFamily: "Cairo_400Regular" },
  group: { marginTop: 12, padding: 13, borderRadius: 16, backgroundColor: "#0F172A", borderWidth: 1, borderColor: "rgba(148,163,184,0.08)" }, groupTitle: { color: "#C8A951", fontSize: 14, fontFamily: "Cairo_700Bold", textAlign: "right", marginBottom: 8 },
  toggleRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }, toggleLabel: { color: "#E2E8F0", fontSize: 13, fontFamily: "Cairo_600SemiBold", textAlign: "right", flex: 1 },
  inputGroup: { marginTop: 9 }, inputLabel: { color: "#E2E8F0", fontSize: 12, fontFamily: "Cairo_600SemiBold", textAlign: "right", marginBottom: 5 }, input: { backgroundColor: "#1E293B", borderRadius: 10, borderWidth: 1, borderColor: "#334155", paddingHorizontal: 11, paddingVertical: 9, minHeight: 42, color: "#FFF", textAlign: "right", fontSize: 12, fontFamily: "Cairo_400Regular" }, multiline: { minHeight: 76, textAlignVertical: "top" }, hint: { color: "#64748B", fontSize: 10, textAlign: "right", marginTop: 3, lineHeight: 16, fontFamily: "Cairo_400Regular" },
  colorRow: { flexDirection: "row", alignItems: "center", gap: 9 }, colorSwatch: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: "#64748B" }, previewBox: { marginTop: 13, padding: 12, backgroundColor: "#0B1220", borderRadius: 14, gap: 8 }, previewCaption: { color: "#C8A951", fontSize: 11, textAlign: "right", fontFamily: "Cairo_700Bold" }, announcementPreview: { borderWidth: 1, borderRadius: 10, padding: 12, backgroundColor: "#1E293B" }, announcementText: { color: "#FFF", fontSize: 13, textAlign: "right", fontFamily: "Cairo_600SemiBold" }, drawerPreview: { color: "#E2E8F0", fontSize: 12, textAlign: "right", backgroundColor: "#1E293B", padding: 10, borderRadius: 9 },
  actions: { flexDirection: "row", gap: 9, marginTop: 12 }, secondaryButton: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: "#334155", borderRadius: 11, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, secondaryText: { color: "#C8A951", fontSize: 11, fontFamily: "Cairo_600SemiBold" }, publishButton: { flex: 1, minHeight: 42, borderRadius: 11, backgroundColor: "#C8A951", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, publishText: { color: "#172033", fontSize: 12, fontFamily: "Cairo_700Bold" }, disabled: { opacity: 0.4 }, historyBox: { maxHeight: 180, marginTop: 10, padding: 10, backgroundColor: "#0F172A", borderRadius: 12 }, historyRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1E293B" }, historyDate: { color: "#E2E8F0", fontSize: 11, textAlign: "right", fontFamily: "Cairo_600SemiBold" }, restoreRowButton: { flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-end", paddingVertical: 5 }, restoreRowText: { color: "#F87171", fontSize: 10, fontFamily: "Cairo_600SemiBold" }, footnote: { color: "#64748B", fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 12, fontFamily: "Cairo_400Regular" },
});
