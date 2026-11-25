import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";

type NotificationDetail = {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  receivedAt: number;
};

export default function CloudflareNotificationDetailScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const router = useRouter();
  const { isDark } = useTheme();
  const [detail, setDetail] = useState<NotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id || !/^[A-Za-z0-9._:-]{1,160}$/.test(id)) {
        if (active) setLoading(false);
        return;
      }
      try {
        const stored = await AsyncStorage.getItem(`@coptic/cloudflare-notification/${id}`);
        if (!stored) return;
        const parsed = JSON.parse(stored) as NotificationDetail;
        if (parsed.id !== id || typeof parsed.imageUrl !== "string" || new URL(parsed.imageUrl).protocol !== "https:") return;
        if (active) setDetail(parsed);
      } catch (error) {
        console.warn("Could not load notification details:", error);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [id]);

  const background = isDark ? "#0F172A" : "#F8FAFC";
  const card = isDark ? "#1E293B" : "#FFFFFF";
  const primary = isDark ? "#F8FAFC" : "#0F172A";
  const secondary = isDark ? "#CBD5E1" : "#475569";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={["top", "left", "right"]}>
      <View style={[styles.topBar, { borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={styles.backButton} accessibilityLabel="العودة">
          <Feather name="arrow-right" size={22} color={primary} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: primary }]}>تفاصيل الإشعار</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#C8A951" /></View>
      ) : detail ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: card, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
            <Text style={[styles.title, { color: primary }]}>{detail.title || "إشعار جديد"}</Text>
            <View style={styles.imageFrame}>
              <Image source={{ uri: detail.imageUrl }} style={styles.image} resizeMode="contain" accessibilityLabel={detail.title || "صورة الإشعار"} />
            </View>
            {detail.body ? <Text style={[styles.body, { color: secondary }]}>{detail.body}</Text> : null}
            <Text style={[styles.date, { color: isDark ? "#94A3B8" : "#64748B" }]}>
              {detail.receivedAt ? new Date(detail.receivedAt).toLocaleString("ar-EG") : ""}
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Feather name="image" size={36} color="#C8A951" />
          <Text style={[styles.unavailableTitle, { color: primary }]}>تعذر تحميل تفاصيل الإشعار</Text>
          <Text style={[styles.unavailableBody, { color: secondary }]}>افتح الإشعار مرة أخرى من قائمة الإشعارات، أو تحقق من اتصال الإنترنت.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { fontFamily: "Cairo_700Bold", fontSize: 17 },
  content: { padding: 18, paddingBottom: 36 },
  card: { borderRadius: 22, padding: 16, borderWidth: 1, gap: 14 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, textAlign: "right", lineHeight: 30 },
  imageFrame: { width: "100%", height: 340, borderRadius: 16, backgroundColor: "#020617", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  body: { fontFamily: "Cairo_500Medium", fontSize: 16, lineHeight: 28, textAlign: "right" },
  date: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 12 },
  unavailableTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, textAlign: "center" },
  unavailableBody: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, textAlign: "center" },
});
