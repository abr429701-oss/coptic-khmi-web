import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useLang } from "@/contexts/LanguageContext";
import type { Lang } from "@/contexts/LanguageContext";
import type { DictionaryEntry } from "@/hooks/useDictionary";
import { loadEntries } from "@/hooks/useOfflineStorage";
import { buildDateInfo } from "@/lib/coptic-calendar";

const TEST_TYPE = "admin_notification_test";
const GOLD = "#C8A951";
const MUTED = "#94A3B8";
type TestKind = "daily_word" | "gregorian_new_year" | "coptic_new_year" | "coptic_month" | "audio_first_download" | "audio_continue_download";
const kinds: { value: TestKind; label: string }[] = [
  { value: "daily_word", label: "كلمة اليوم" },
  { value: "gregorian_new_year", label: "السنة الميلادية" },
  { value: "coptic_new_year", label: "السنة القبطية" },
  { value: "coptic_month", label: "الشهر القبطي" },
  { value: "audio_first_download", label: "تحميل الصوتيات" },
  { value: "audio_continue_download", label: "استكمال الصوتيات" },
];

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function defaultParts() {
  const date = new Date(Date.now() + 10 * 60 * 1000);
  date.setSeconds(0, 0);
  return { date: localDateString(date), time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` };
}
function parseLocalDateTime(dateValue: string, timeValue: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}
function localizedTitle(kind: TestKind, lang: Lang) {
  const labels: Record<TestKind, Record<Lang, string>> = {
    daily_word: { ar: "كلمة اليوم · اختبار أدمن", en: "Daily Word · Admin Test", fr: "Mot du jour · Test admin", de: "Wort des Tages · Admin-Test" },
    gregorian_new_year: { ar: "العام الميلادي الجديد · اختبار", en: "Gregorian New Year · Test", fr: "Nouvel An grégorien · Test", de: "Gregorianisches Neujahr · Test" },
    coptic_new_year: { ar: "بداية السنة القبطية · اختبار", en: "Coptic New Year · Test", fr: "Nouvel An copte · Test", de: "Koptisches Neujahr · Test" },
    coptic_month: { ar: "الشهر القبطي · اختبار", en: "Coptic Month · Test", fr: "Mois copte · Test", de: "Koptischer Monat · Test" },
    audio_first_download: { ar: "تذكير تحميل الصوتيات · اختبار", en: "Audio Download Reminder · Test", fr: "Rappel de téléchargement audio · Test", de: "Audio-Download-Erinnerung · Test" },
    audio_continue_download: { ar: "تذكير استكمال الصوتيات · اختبار", en: "Continue Audio Download · Test", fr: "Rappel de reprise du téléchargement audio · Test", de: "Erinnerung zum Fortsetzen des Audio-Downloads · Test" },
  };
  return labels[kind][lang] || labels[kind].en;
}

export function LocalNotificationTestPanel() {
  const { lang, t } = useLang();
  const initial = defaultParts();
  const [kind, setKind] = useState<TestKind>("daily_word");
  const [dateValue, setDateValue] = useState(initial.date);
  const [timeValue, setTimeValue] = useState(initial.time);
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [testNotifications, setTestNotifications] = useState<Notifications.NotificationRequest[]>([]);

  const refreshTests = useCallback(async () => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      setTestNotifications(scheduled.filter((item) => item.content.data?.type === TEST_TYPE));
    } catch (error) {
      console.warn("Failed to read admin test notifications", error);
    }
  }, []);

  useEffect(() => {
    void loadEntries().then((items) => setEntries(items || [])).catch(() => setEntries([]));
    void refreshTests();
  }, [refreshTests]);

  const scheduleTest = async () => {
    const scheduledAt = parseLocalDateTime(dateValue.trim(), timeValue.trim());
    if (!scheduledAt) {
      Alert.alert("تاريخ أو ساعة غير صالحين", "اكتب التاريخ بصيغة YYYY-MM-DD والوقت بصيغة 24 ساعة HH:MM.");
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      Alert.alert("موعد غير صالح", "لازم تختار موعدًا في المستقبل.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notifications.getPermissionsAsync();
      const finalPermission = permission.status === "granted" ? permission : await Notifications.requestPermissionsAsync();
      if (finalPermission.status !== "granted") throw new Error("إذن الإشعارات غير مفعّل على هذا الجهاز.");

      const dateInfo = buildDateInfo(scheduledAt, lang);
      let body = "";
      if (kind === "daily_word") {
        const available = entries.filter((entry) => entry.coptic && (entry.arabic || entry.english || entry.french || entry.german));
        if (!available.length) throw new Error("القاموس المحلي غير محمّل أو لا يحتوي كلمات صالحة لكلمة اليوم.");
        const entry = available[Math.floor(Math.random() * available.length)];
        const meaning = lang === "en" ? entry.english || entry.arabic : lang === "fr" ? entry.french || entry.arabic : lang === "de" ? entry.german || entry.arabic : entry.arabic;
        body = `${entry.coptic}\n${meaning.split(/[،,;؛/\n]/)[0].trim()}`;
        if (entry.wordType || entry.gender) body += `\n${lang === "ar" ? "النوع" : "Type"}: ${entry.wordType || entry.gender}`;
      } else if (kind === "gregorian_new_year") {
        body = lang === "ar" ? `العام الميلادي ${dateInfo.gregYear} · موعد اختبار اختاره الأدمن.` : `Gregorian year ${dateInfo.gregYear} · scheduled by the administrator for testing.`;
      } else if (kind === "coptic_new_year") {
        body = lang === "ar" ? `السنة القبطية ${dateInfo.copticYear} (سنة الشهداء ${dateInfo.pharaonicYear}) · اختبار في الموعد المحدد.` : `Coptic year ${dateInfo.copticYear} (Ancient Egyptian year ${dateInfo.pharaonicYear}) · scheduled test.`;
      } else if (kind === "audio_first_download" || kind === "audio_continue_download") {
        const reminder = t.notification.audioDownloadReminder;
        body = kind === "audio_first_download" ? reminder.firstDownload : reminder.continueDownload;
      } else {
        body = lang === "ar" ? `التاريخ القبطي اليوم: ${dateInfo.copticDay} ${dateInfo.copticMonth} ${dateInfo.copticYear}. هذا اختبار في اليوم الذي اخترته، وليس شرطًا أن يكون أول الشهر.` : `Coptic date: ${dateInfo.copticDay} ${dateInfo.copticMonth} ${dateInfo.copticYear}. This test uses your chosen date, not necessarily the first of the month.`;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: localizedTitle(kind, lang),
          body,
          data: { type: TEST_TYPE, testKind: kind, scheduledFor: scheduledAt.toISOString(), isLocal: true },
          priority: Notifications.AndroidNotificationPriority.MAX,
        } as any,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.ceil((scheduledAt.getTime() - Date.now()) / 1000)), repeats: false },
      });
      await refreshTests();
      Alert.alert("تمت جدولة الاختبار", `${kinds.find((item) => item.value === kind)?.label}\n${scheduledAt.toLocaleString("ar-EG")}`);
    } catch (error) {
      Alert.alert("تعذر جدولة الاختبار", error instanceof Error ? error.message : "حدث خطأ أثناء إعداد الإشعار.");
    } finally {
      setBusy(false);
    }
  };

  const cancelTests = () => {
    if (!testNotifications.length) return;
    Alert.alert("إلغاء إشعارات الاختبار", `سيتم إلغاء ${testNotifications.length} إشعارًا تجريبيًا فقط. الإشعارات الطبيعية لن تتأثر.`, [
      { text: "رجوع", style: "cancel" },
      { text: "إلغاء الاختبارات", style: "destructive", onPress: () => void (async () => {
        setBusy(true);
        try {
          await Promise.all(testNotifications.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
          await refreshTests();
          Alert.alert("تم", "أُلغيت إشعارات الاختبار فقط.");
        } catch (error) {
          Alert.alert("تعذر الإلغاء", error instanceof Error ? error.message : "حاول مرة أخرى.");
        } finally { setBusy(false); }
      })() },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Feather name="bell" size={19} color={GOLD} />
        <Text style={styles.title}>اختبار الإشعارات المحلية (للأدمن)</Text>
      </View>
      <Text style={styles.help}>الاختبارات تُجدول على هذا الجهاز فقط ولا تغيّر جدول المستخدمين أو إشعارات الإنتاج. أدخل أي تاريخ ووقت مستقبليين. اختبار الشهر القبطي يعرض تاريخ اليوم القبطي المختار، حتى لو لم يكن أول الشهر.</Text>
      <Text style={styles.label}>نوع الإشعار</Text>
      <View style={styles.chips}>
        {kinds.map((item) => <TouchableOpacity key={item.value} onPress={() => setKind(item.value)} style={[styles.chip, kind === item.value && styles.activeChip]}><Text style={[styles.chipText, kind === item.value && styles.activeText]}>{item.label}</Text></TouchableOpacity>)}
      </View>
      <Text style={styles.label}>التاريخ (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={dateValue} onChangeText={setDateValue} placeholder="2026-11-21" placeholderTextColor="#64748B" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
      <Text style={styles.label}>الساعة المحلية (HH:MM بنظام 24 ساعة)</Text>
      <TextInput style={styles.input} value={timeValue} onChangeText={setTimeValue} placeholder="18:30" placeholderTextColor="#64748B" keyboardType="numbers-and-punctuation" />
      <TouchableOpacity style={[styles.button, busy && styles.disabled]} onPress={() => void scheduleTest()} disabled={busy}>
        {busy ? <ActivityIndicator color="#0F172A" /> : <Feather name="clock" size={17} color="#0F172A" />}
        <Text style={styles.buttonText}>{busy ? "جارٍ التنفيذ…" : "جدولة إشعار الاختبار"}</Text>
      </TouchableOpacity>
      <View style={styles.testListHeader}>
        <Text style={styles.help}>الاختبارات المجدولة على هذا الجهاز: {testNotifications.length}</Text>
        <TouchableOpacity onPress={() => void refreshTests()}><Feather name="refresh-cw" size={16} color={GOLD} /></TouchableOpacity>
      </View>
      {testNotifications.map((item) => (
        <Text key={item.identifier} style={styles.pendingText} numberOfLines={2}>• {String(item.content.title || "اختبار")} — {String(item.content.body || "").slice(0, 80)}{String(item.content.body || "").length > 80 ? "…" : ""}</Text>
      ))}
      <TouchableOpacity style={[styles.cancelButton, (!testNotifications.length || busy) && styles.disabled]} onPress={cancelTests} disabled={!testNotifications.length || busy}>
        <Feather name="x-circle" size={16} color="#FCA5A5" /><Text style={styles.cancelText}>إلغاء كل إشعارات الاختبار فقط</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, backgroundColor: "#0F172A", borderWidth: 1, borderColor: "rgba(200,169,81,0.28)", gap: 9 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  title: { color: "#FFF", fontSize: 15, fontFamily: "Cairo_700Bold", textAlign: "right" },
  help: { color: MUTED, fontSize: 11, lineHeight: 18, fontFamily: "Cairo_400Regular", textAlign: "right" },
  label: { color: "#E2E8F0", fontSize: 11, fontFamily: "Cairo_600SemiBold", textAlign: "right", marginTop: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
  chip: { borderWidth: 1, borderColor: "#475569", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#1E293B" },
  activeChip: { borderColor: GOLD, backgroundColor: "rgba(200,169,81,0.16)" },
  chipText: { color: MUTED, fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  activeText: { color: GOLD },
  input: { minHeight: 44, backgroundColor: "#1E293B", borderRadius: 11, paddingHorizontal: 12, color: "#FFF", borderWidth: 1, borderColor: "#334155", fontSize: 13, textAlign: "left" },
  button: { minHeight: 46, borderRadius: 12, backgroundColor: GOLD, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  buttonText: { color: "#0F172A", fontSize: 13, fontFamily: "Cairo_700Bold" },
  disabled: { opacity: 0.5 },
  testListHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 },
  pendingText: { color: "#CBD5E1", fontSize: 10, lineHeight: 16, textAlign: "right" },
  cancelButton: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: "rgba(248,113,113,0.25)", backgroundColor: "rgba(127,29,29,0.18)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 3 },
  cancelText: { color: "#FCA5A5", fontSize: 11, fontFamily: "Cairo_600SemiBold" },
});
