import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { CloudflareAdminSession } from "@/lib/cloudflare";

const API_BASE = "https://coptic-app-notifications.abraammerzik56.workers.dev";
const GOLD = "#C8A951";
const MUTED = "#94A3B8";

type ReportView = "history" | "versions";

interface Props {
  view: ReportView;
  session: CloudflareAdminSession | null;
}

const statusLabels: Record<string, string> = {
  scheduled: "مجدول",
  sending: "جارٍ الإرسال",
  sent: "تم الإرسال",
  partial: "إرسال جزئي",
  failed: "فشل",
};

function formatDate(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "—";
  return new Date(timestamp).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

export function CloudflareAdminReports({ view, session }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!session || Date.now() >= session.expiresAt) {
      setError("سجّل الدخول من تبويب Cloudflare أولًا لعرض هذه البيانات.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const endpoint = view === "history" ? "/admin/notifications?limit=50" : "/admin/versions";
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) throw new Error(response.status === 401 ? "انتهت جلسة Cloudflare؛ سجّل الدخول مجددًا." : data.error || "تعذر تحميل التقرير.");
      if (view === "history") setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      else {
        setVersions(Array.isArray(data.versions) ? data.versions : []);
        setTotal(Number(data.total || 0));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, [session, view]);

  useEffect(() => { void load(); }, [load]);

  if (!session) {
    return <View style={styles.card}><Text style={styles.help}>افتح تبويب Cloudflare وسجّل الدخول لعرض تقارير الأجهزة والإشعارات.</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.heading}>{view === "history" ? "آخر 50 إشعارًا" : "الأجهزة النشطة حسب الإصدار"}</Text>
        <TouchableOpacity onPress={() => void load()} disabled={loading} style={styles.refreshButton}>
          {loading ? <ActivityIndicator size="small" color={GOLD} /> : <Feather name="refresh-cw" size={15} color={GOLD} />}
          <Text style={styles.refreshText}>تحديث</Text>
        </TouchableOpacity>
      </View>

      {error ? <View style={styles.card}><Text style={styles.error}>{error}</Text></View> : null}
      {loading && (view === "history" ? notifications.length === 0 : versions.length === 0) ? (
        <View style={styles.card}><ActivityIndicator color={GOLD} /><Text style={styles.help}>جارٍ تحميل البيانات…</Text></View>
      ) : view === "history" ? (
        notifications.length ? notifications.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <View style={[styles.badge, item.status === "failed" ? styles.badgeFailed : item.status === "sent" ? styles.badgeSuccess : null]}>
                <Text style={styles.badgeText}>{statusLabels[item.status] || item.status}</Text>
              </View>
            </View>
            <Text style={styles.meta}>أُنشئ: {formatDate(item.created_at)}{item.scheduled_at ? ` · الموعد: ${formatDate(item.scheduled_at)}` : ""}</Text>
            <View style={styles.statsRow}>
              <Text style={styles.stat}>المستهدفون <Text style={styles.statValue}>{Number(item.total_targets || 0).toLocaleString("ar-EG")}</Text></Text>
              <Text style={styles.stat}>وصلت لـ Expo <Text style={styles.statValue}>{Number(item.accepted_count || 0).toLocaleString("ar-EG")}</Text></Text>
              <Text style={styles.stat}>أخطاء <Text style={styles.statValue}>{Number(item.error_count || 0).toLocaleString("ar-EG")}</Text></Text>
            </View>
            <Text style={styles.meta}>اللغة: {item.language === "ar" ? "العربية" : item.language === "en" ? "English" : "الكل"}{item.app_version ? ` · الإصدار: ${item.app_version}` : " · كل الإصدارات"}{item.selected_devices ? ` · أجهزة محددة: ${item.selected_devices}` : ""}</Text>
          </View>
        )) : <View style={styles.card}><Text style={styles.help}>لا توجد إشعارات مسجلة بعد.</Text></View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Feather name="smartphone" size={22} color={GOLD} />
            <Text style={styles.summaryValue}>{total.toLocaleString("ar-EG")}</Text>
            <Text style={styles.help}>إجمالي الأجهزة النشطة</Text>
          </View>
          {versions.length ? versions.map((item) => (
            <View key={item.version} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{item.version || "غير محدد"}</Text>
                <Text style={styles.versionCount}>{Number(item.devices || 0).toLocaleString("ar-EG")} جهاز</Text>
              </View>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, Number(item.share || 0)))}%` }]} /></View>
              <Text style={styles.meta}>{Number(item.share || 0)}% من الأجهزة النشطة</Text>
              <View style={styles.statsRow}>
                <Text style={styles.stat}>Android <Text style={styles.statValue}>{Number(item.android || 0).toLocaleString("ar-EG")}</Text></Text>
                <Text style={styles.stat}>iOS <Text style={styles.statValue}>{Number(item.ios || 0).toLocaleString("ar-EG")}</Text></Text>
                <Text style={styles.stat}>عربي / English <Text style={styles.statValue}>{Number(item.arabic || 0).toLocaleString("ar-EG")} / {Number(item.english || 0).toLocaleString("ar-EG")}</Text></Text>
              </View>
            </View>
          )) : <View style={styles.card}><Text style={styles.help}>لا توجد أجهزة نشطة مسجلة.</Text></View>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  heading: { color: "#FFF", fontSize: 16, fontFamily: "Cairo_700Bold", textAlign: "right", flex: 1 },
  refreshButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(200,169,81,0.1)" },
  refreshText: { color: GOLD, fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  card: { backgroundColor: "#0F172A", borderRadius: 18, padding: 15, borderWidth: 1, borderColor: "rgba(148,163,184,0.1)", gap: 9 },
  summaryCard: { backgroundColor: "#0F172A", borderRadius: 20, padding: 20, alignItems: "center", gap: 5, borderWidth: 1, borderColor: "rgba(200,169,81,0.2)" },
  summaryValue: { color: "#FFF", fontSize: 30, fontFamily: "Cairo_700Bold" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { color: "#FFF", fontSize: 14, fontFamily: "Cairo_700Bold", flex: 1, textAlign: "right" },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: "rgba(200,169,81,0.14)" },
  badgeSuccess: { backgroundColor: "rgba(52,211,153,0.14)" },
  badgeFailed: { backgroundColor: "rgba(248,113,113,0.15)" },
  badgeText: { color: GOLD, fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  meta: { color: MUTED, fontSize: 10, fontFamily: "Cairo_400Regular", textAlign: "right" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 7, marginTop: 3 },
  stat: { color: MUTED, fontSize: 10, fontFamily: "Cairo_400Regular" },
  statValue: { color: "#FFF", fontFamily: "Cairo_700Bold" },
  versionCount: { color: GOLD, fontSize: 12, fontFamily: "Cairo_700Bold" },
  barTrack: { height: 7, backgroundColor: "#1E293B", borderRadius: 5, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: GOLD, borderRadius: 5 },
  help: { color: MUTED, fontSize: 12, lineHeight: 20, fontFamily: "Cairo_400Regular", textAlign: "center" },
  error: { color: "#FCA5A5", fontSize: 12, fontFamily: "Cairo_600SemiBold", textAlign: "center" },
});
