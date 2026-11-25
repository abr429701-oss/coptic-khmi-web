import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { CLOUDFLARE_API_BASE, DEFAULT_USEFUL_BOTS, type CloudflareAdminSession, type UsefulBotsSettings } from "@/lib/cloudflare";

interface Props {
  session: CloudflareAdminSession | null;
}

const OPTIONS: { key: keyof UsefulBotsSettings; label: string; detail: string; icon: string; color: string }[] = [
  { key: "whatsapp", label: "بوت واتساب", detail: "قاموس وتعلّم اللغة القبطية على واتساب", icon: "message-circle", color: "#25D366" },
  { key: "facebook", label: "بوت فيسبوك", detail: "بوت قاموس وتعلّم اللغة القبطية على فيسبوك", icon: "facebook", color: "#1877F2" },
  { key: "telegram", label: "بوتات تيليجرام", detail: "بوت التعلّم وبوت القاموس على تيليجرام", icon: "send", color: "#0088cc" },
];

export function CloudflareUsefulBotsPanel({ session }: Props) {
  const [settings, setSettings] = useState<UsefulBotsSettings>(DEFAULT_USEFUL_BOTS);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!session || Date.now() >= session.expiresAt) return;
    setLoading(true);
    try {
      const response = await fetch(`${CLOUDFLARE_API_BASE}/admin/settings`, {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) throw new Error("انتهت جلسة Cloudflare؛ سجّل الدخول مجددًا من لوحة الإشعارات.");
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الإعدادات.");
      setSettings({ ...DEFAULT_USEFUL_BOTS, ...(data.usefulBots || {}) });
      setHasChanges(false);
    } catch (error) {
      Alert.alert("إعدادات البوتات", error instanceof Error ? error.message : "تعذر الاتصال بخدمة Cloudflare.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const saveSettings = async () => {
    if (!session || Date.now() >= session.expiresAt) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول أولًا من لوحة إشعارات Cloudflare.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${CLOUDFLARE_API_BASE}/admin/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ usefulBots: settings }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) throw new Error("انتهت الجلسة؛ سجّل الدخول مجددًا.");
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الإعدادات.");
      setSettings({ ...DEFAULT_USEFUL_BOTS, ...(data.usefulBots || settings) });
      setHasChanges(false);
      Alert.alert("تم الحفظ", "سيتم تحديث ظهور الأزرار لدى المستخدمين عند اتصال التطبيق بالخدمة.");
    } catch (error) {
      Alert.alert("تعذر الحفظ", error instanceof Error ? error.message : "تحقق من اتصال الإنترنت.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.iconCircle}><Feather name="eye" size={20} color="#C8A951" /></View>
        <View style={styles.heading}>
          <Text style={styles.title}>التحكم في «بوتات مفيدة»</Text>
          <Text style={styles.subtitle}>إخفاء أو إظهار الأزرار عن بُعد دون إصدار تحديث للتطبيق</Text>
        </View>
        <TouchableOpacity onPress={() => void loadSettings()} disabled={loading || !session} style={styles.refresh}>
          {loading ? <ActivityIndicator size="small" color="#C8A951" /> : <Feather name="refresh-cw" size={17} color="#C8A951" />}
        </TouchableOpacity>
      </View>
      {!session && <Text style={styles.notice}>سجّل الدخول من لوحة إشعارات Cloudflare أعلاه لتعديل هذه الإعدادات.</Text>}
      {OPTIONS.map((option, index) => (
        <View key={option.key} style={[styles.row, index === OPTIONS.length - 1 && styles.lastRow]}>
          <View style={[styles.optionIcon, { backgroundColor: `${option.color}20` }]}><Feather name={option.icon as any} size={18} color={option.color} /></View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>{option.label}</Text>
            <Text style={styles.detail}>{option.detail}</Text>
          </View>
          <Switch
            value={settings[option.key]}
            onValueChange={(value) => { setSettings((previous) => ({ ...previous, [option.key]: value })); setHasChanges(true); }}
            disabled={!session || loading || busy}
            trackColor={{ false: "#334155", true: "#927A35" }}
            thumbColor={settings[option.key] ? "#E7C65B" : "#CBD5E1"}
          />
        </View>
      ))}
      <Text style={styles.hint}>إعداداتك تُخزّن في Cloudflare. عند فشل الاتصال العام، ستظل الأزرار ظاهرة للمستخدمين كخيار احتياطي.</Text>
      <TouchableOpacity onPress={() => void saveSettings()} disabled={!session || !hasChanges || busy} style={[styles.saveButton, (!session || !hasChanges || busy) && styles.disabled]}>
        {busy ? <ActivityIndicator color="#172033" /> : <><Feather name="save" size={17} color="#172033" /><Text style={styles.saveText}>حفظ الإعدادات</Text></>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 24, backgroundColor: "#1E293B", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  iconCircle: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(200,169,81,0.12)", alignItems: "center", justifyContent: "center" },
  heading: { flex: 1 },
  title: { color: "#FFF", fontSize: 16, fontFamily: "Cairo_700Bold", textAlign: "right" },
  subtitle: { color: "#94A3B8", fontSize: 11, fontFamily: "Cairo_400Regular", textAlign: "right", marginTop: 3 },
  refresh: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  notice: { color: "#FBBF24", fontSize: 12, fontFamily: "Cairo_600SemiBold", textAlign: "right", paddingVertical: 10 },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", paddingVertical: 10 },
  lastRow: { borderBottomWidth: 0 },
  optionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionText: { flex: 1 },
  optionTitle: { color: "#F8FAFC", fontSize: 14, fontFamily: "Cairo_700Bold", textAlign: "right" },
  detail: { color: "#94A3B8", fontSize: 11, fontFamily: "Cairo_400Regular", textAlign: "right", marginTop: 2 },
  hint: { color: "#64748B", fontSize: 11, lineHeight: 18, fontFamily: "Cairo_400Regular", textAlign: "right", marginTop: 10 },
  saveButton: { minHeight: 48, backgroundColor: "#C8A951", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 16 },
  saveText: { color: "#172033", fontSize: 14, fontFamily: "Cairo_700Bold" },
  disabled: { opacity: 0.45 },
});
