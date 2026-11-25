import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Switch,
  RefreshControl,
  Dimensions,
  Linking
} from 'react-native';
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAdmin } from "@/contexts/AdminContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdminLocalTools } from "@/components/AdminLocalTools";
import { CloudflareNotificationsPanel } from "@/components/CloudflareNotificationsPanel";
import { CloudflareUsefulBotsPanel } from "@/components/CloudflareUsefulBotsPanel";
import { CloudflareRemoteControlPanel } from "@/components/CloudflareRemoteControlPanel";
import { type CloudflareAdminSession } from "@/lib/cloudflare";
import { CloudflareAdminReports } from "@/components/CloudflareAdminReports";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwDoXHYpnsJMXg5O6XOoU8SQBpjOCFXfEcP2uyYggITJYeR1sdRmBeOMDGMyIVC7JRv/exec";
const { width } = Dimensions.get('window');

export default function AdminScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdminMode, toggleAdminMode, unlockAllLevels, setUnlockAllLevels } = useAdmin();

  const [activeTab, setActiveTab] = useState<"notif" | "cloudflare" | "users" | "pulse" | "insights" | "config" | "local" | "history" | "versions">("notif");
  const [cloudflareSession, setCloudflareSession] = useState<CloudflareAdminSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Pulse & Insights State
  const [recentActions, setRecentActions] = useState<any[]>([]);
  const [topSearches, setTopSearches] = useState<any[]>([]);
  const [topLessons, setTopLessons] = useState<any[]>([]);

  // Notification State
  const [notifType, setNotifType] = useState<"global" | "individual">("global");
  const [targetRow, setTargetRow] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Stats State
  const [stats, setStats] = useState({ total: 0, activeToday: 0, shares: 0, searches: 0, lessons: 0 });

  // Content State (Daily Word & Drawer)
  const [dailyWord, setDailyWord] = useState({ coptic: "", arabic: "", pron: "" });
  const [drawerMsg, setDrawerMsg] = useState("");
  const [isSavingContent, setIsSavingContent] = useState(false);

  // Config State
  const [marquee, setMarquee] = useState("");
  const [maintenance, setMaintenance] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [storeLink, setStoreLink] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Success Feedback
  const [showSuccess, setShowSuccess] = useState(false);
  const successAnim = React.useRef(new Animated.Value(0)).current;

  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!isAdminMode) {
      router.replace("/");
    } else {
      loadInitialData();
      
      const interval = setInterval(() => {
        loadAllData();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [isAdminMode]);

  const [lastSync, setLastSync] = useState<string | null>(null);

  const loadInitialData = async () => {
    try {
      const cached = await AsyncStorage.getItem("@khmi/admin_cache");
      if (cached) {
        const data = JSON.parse(cached);
        if (data.stats) setStats(data.stats);
        if (data.config) {
          setMarquee(data.config.marquee);
          setMaintenance(data.config.maintenance);
          setForceUpdate(data.config.forceUpdate || false);
          setStoreLink(data.config.storeLink);
          setDrawerMsg(data.config.drawerMsg || "");
        }
        if (data.recent) setRecentActions(data.recent);
        if (data.topSearches) setTopSearches(data.topSearches);
        if (data.topLessons) setTopLessons(data.topLessons);
        if (data.lastSync) setLastSync(data.lastSync);
        
        setInitialLoading(false);
        loadAllData();
        return;
      }
    } catch (e) {}

    setInitialLoading(true);
    await loadAllData();
    setInitialLoading(false);
  };

  const loadAllData = async () => {
    await Promise.all([fetchStats(), fetchConfig()]);
  };

  const triggerSuccess = () => {
    setShowSuccess(true);
    Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }).start();
    setTimeout(() => {
      Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setShowSuccess(false);
      });
    }, 2000);
  };


  const fetchConfig = async () => {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getAppConfig`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setMarquee(data.config.marquee);
        setMaintenance(data.config.maintenance);
        setForceUpdate(data.config.forceUpdate || false);
        setStoreLink(data.config.storeLink);
        setDrawerMsg(data.config.drawerMsg || "");

        // حفظ الكاش
        const nowStr = new Date().toLocaleTimeString("ar-EG", { hour: '2-digit', minute: '2-digit' });
        setLastSync(nowStr);
        AsyncStorage.getItem("@khmi/admin_cache").then(old => {
          const parsed = old ? JSON.parse(old) : {};
          const next = { ...parsed, config: data.config, lastSync: nowStr };
          AsyncStorage.setItem("@khmi/admin_cache", JSON.stringify(next));
        });
      }
    } catch (e) {}
  };

  const fetchDailyWord = async () => {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getDailyWord`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setDailyWord(data.word);
    } catch (e) {}
  };

  const handleSendNotification = async () => {
    if (!bodyAr.trim()) {
      Alert.alert("تنبيه", "برجاء كتابة نص الرسالة أولاً");
      return;
    }
    
    setIsSending(true);
    try {
      const payload = {
        action: 'sendAdminNotification',
        type: notifType,
        row: targetRow,
        body_ar: bodyAr, // نرسلها في خانة العربي
        body_en: bodyAr  // ونكررها في الإنجليزي لضمان الوصول لأي مستخدم بأي لغة
      };

      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        setBodyAr("");
        setTargetRow("");
        triggerSuccess();
        Alert.alert("تم بنجاح", `تم إرسال الإشعار لـ ${data.count} جهاز.`);
      } else {
        Alert.alert("خطأ", data.error || "فشل الإرسال");
      }
    } catch (e) {
      Alert.alert("خطأ", "فشل الاتصال بالسيرفر");
    } finally {
      setIsSending(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getAdminStats`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        if (data.stats) setStats(data.stats);
        if (data.recent) setRecentActions(data.recent);
        if (data.topSearches) setTopSearches(data.topSearches);
        if (data.topLessons) setTopLessons(data.topLessons);
        
        // حفظ في الكاش للأوفلاين
        const nowStr = new Date().toLocaleTimeString("ar-EG", { hour: '2-digit', minute: '2-digit' });
        setLastSync(nowStr);
        AsyncStorage.getItem("@khmi/admin_cache").then(old => {
          const parsed = old ? JSON.parse(old) : {};
          const next = { ...parsed, stats: data.stats, recent: data.recent, topSearches: data.topSearches, topLessons: data.topLessons, lastSync: nowStr };
          AsyncStorage.setItem("@khmi/admin_cache", JSON.stringify(next));
        });
      }
    } catch (e) {}
  };


  const handleUpdateDailyWord = async () => {
    setIsSavingContent(true);
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'updateDailyWord', word: dailyWord })
      });
      const data = await res.json();
      if (data.success) triggerSuccess();
    } catch (e) { Alert.alert("خطأ", "فشل التحديث"); }
    finally { setIsSavingContent(false); }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'updateAppConfig',
          config: { marquee, maintenance, forceUpdate, storeLink, drawerMsg }
        })
      });
      const data = await res.json();
      if (data.success) triggerSuccess();
    } catch (e) { Alert.alert("خطأ", "فشل الحفظ"); }
    finally { setIsSavingConfig(false); }
  };

  const handleClearLogs = () => {
    Alert.alert(
      "منطقة خطر! ⚠️",
      "هل أنت متأكد من مسح جميع سجلات النشاط؟ هذا الإجراء لا يمكن التراجع عنه.",
      [
        { text: "إلغاء", style: "cancel" },
        { text: "نعم، امسح الكل", style: "destructive", onPress: async () => {
          try {
            await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'clearLogs' }) });
            triggerSuccess();
          } catch(e) { Alert.alert("خطأ", "فشل المسح"); }
        }}
      ]
    );
  };

  if (!isAdminMode) return null;

  const slateColor = "#1E293B";
  const goldColor = "#C8A951";
  const activeRate = stats.total > 0 ? Math.min(100, Math.round((stats.activeToday / stats.total) * 100)) : 0;
  const inactiveCount = Math.max(0, stats.total - stats.activeToday);

  if (initialLoading) {
    return (
      <View style={[styles.container, { backgroundColor: slateColor, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={goldColor} />
        <Text style={{ color: '#FFF', marginTop: 15, fontFamily: 'Cairo_600SemiBold' }}>جاري تحضير مركز العمليات...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: slateColor, paddingTop: insets.top }]}>
      {/* Dynamic Command Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-right" size={28} color={goldColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>مركز العمليات</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.headerSubtitle}>ADMIN SUPER DASHBOARD</Text>
            {lastSync && (
              <Text style={{ color: "#94A3B8", fontSize: 10, marginLeft: 10, fontFamily: 'Cairo_400Regular' }}>
                • تم التحديث: {lastSync}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={loadAllData} style={styles.refreshBtn}>
          {refreshing ? <ActivityIndicator size="small" color={goldColor} /> : <Feather name="zap" size={20} color={goldColor} />}
        </TouchableOpacity>
      </View>

      {/* Super Tab Bar */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}>
          {[
            { id: "notif", icon: "mail", label: "البث" },
            { id: "users", icon: "users", label: "الجمهور" },
            { id: "pulse", icon: "activity", label: "النبض" },
            { id: "cloudflare", icon: "cloud", label: "Cloudflare" },
            { id: "history", icon: "clock", label: "السجل" },
            { id: "versions", icon: "smartphone", label: "الإصدارات" },
            { id: "insights", icon: "bar-chart-2", label: "الرؤى" },
            { id: "config", icon: "settings", label: "السيستم" },
            { id: "local", icon: "tool", label: "أدوات محلية" }
          ].map(tab => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id as any)}
              style={[styles.tabItem, activeTab === tab.id && { borderBottomColor: goldColor, borderBottomWidth: 3 }]}
            >
              <Feather name={tab.icon as any} size={20} color={activeTab === tab.id ? goldColor : "#94A3B8"} />
              <Text style={[styles.tabLabel, { color: activeTab === tab.id ? "#FFF" : "#94A3B8" }]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView 
          contentContainerStyle={styles.scrollBody} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAllData} tintColor={goldColor} />}
        >
          
          {activeTab === "notif" && (
            <View style={styles.tabContent}>
              <View style={styles.card}>
                <Text style={styles.cardHeaderTitle}>بث إشعار للمستخدمين ✨</Text>
                
                <View style={styles.typeToggle}>
                  {["global", "individual"].map(type => (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setNotifType(type as any)}
                      style={[styles.typeBtn, notifType === type && styles.activeTypeBtn]}
                    >
                      <Text style={[styles.typeBtnText, { color: notifType === type ? slateColor : "#94A3B8" }]}>{type === "global" ? "للجميع" : "فردي"}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {notifType === "individual" && (
                  <TextInput
                    style={styles.premiumInput}
                    placeholder="رقم الصف في الشيت..."
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                    value={targetRow}
                    onChangeText={setTargetRow}
                  />
                )}

                <TextInput
                  style={[styles.premiumInput, { height: 120, textAlignVertical: 'top' }]}
                  placeholder="اكتب نص الرسالة هنا..."
                  placeholderTextColor="#475569"
                  multiline
                  value={bodyAr}
                  onChangeText={setBodyAr}
                />

                <TouchableOpacity 
                  style={[styles.mainActionBtn, { opacity: isSending ? 0.6 : 1 }]} 
                  onPress={handleSendNotification}
                  disabled={isSending}
                >
                  <LinearGradient colors={['#334155', '#1E293B']} style={styles.btnGradient}>
                    {isSending ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.mainBtnText, { color: '#FFF' }]}>إرسال الإشعار الآن 🚀</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === "users" && (
            <View style={styles.tabContent}>
              <View style={styles.audienceHero}>
                <View style={styles.audienceHeroHeader}>
                  <View>
                    <Text style={styles.audienceEyebrow}>نظرة عامة</Text>
                    <Text style={styles.audienceTitle}>جمهور التطبيق</Text>
                  </View>
                  <View style={styles.audienceHeroIcon}>
                    <Feather name="users" size={22} color={goldColor} />
                  </View>
                </View>
                <Text style={styles.audienceTotal}>{stats.total.toLocaleString("ar-EG")}</Text>
                <Text style={styles.audienceCaption}>إجمالي المستخدمين المسجلين</Text>
                <View style={styles.audienceActivityRow}>
                  <View style={styles.audienceActivityItem}>
                    <View style={[styles.audienceDot, { backgroundColor: "#34D399" }]} />
                    <Text style={styles.audienceActivityValue}>{stats.activeToday.toLocaleString("ar-EG")}</Text>
                    <Text style={styles.audienceActivityLabel}>نشط اليوم</Text>
                  </View>
                  <View style={styles.audienceActivityDivider} />
                  <View style={styles.audienceActivityItem}>
                    <View style={[styles.audienceDot, { backgroundColor: "#64748B" }]} />
                    <Text style={styles.audienceActivityValue}>{inactiveCount.toLocaleString("ar-EG")}</Text>
                    <Text style={styles.audienceActivityLabel}>غير نشط اليوم</Text>
                  </View>
                </View>
                <View style={styles.audienceProgressTrack}>
                  <View style={[styles.audienceProgressFill, { width: `${activeRate}%` }]} />
                </View>
                <Text style={styles.audienceRate}>معدل النشاط اليومي <Text style={{ color: goldColor }}>{activeRate}%</Text></Text>
              </View>

              <Text style={styles.audienceSectionTitle}>مؤشرات التفاعل</Text>
              <View style={styles.audienceMetricsGrid}>
                {[
                  { icon: "share-2", label: "مشاركات", value: stats.shares, color: "#34D399" },
                  { icon: "search", label: "عمليات بحث", value: stats.searches, color: "#60A5FA" },
                  { icon: "book-open", label: "دروس", value: stats.lessons, color: "#FBBF24" },
                ].map((metric) => (
                  <View key={metric.label} style={styles.audienceMetricCard}>
                    <View style={[styles.audienceMetricIcon, { backgroundColor: `${metric.color}18` }]}>
                      <Feather name={metric.icon as any} size={18} color={metric.color} />
                    </View>
                    <Text style={styles.audienceMetricValue}>{metric.value.toLocaleString("ar-EG")}</Text>
                    <Text style={styles.audienceMetricLabel}>{metric.label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.audienceUpdated}>
                <Feather name="refresh-cw" size={13} color="#64748B" />
                <Text style={styles.audienceUpdatedText}>{lastSync ? `آخر تحديث ${lastSync}` : "اسحب الشاشة للأسفل لتحديث الإحصاءات"}</Text>
              </View>
            </View>
          )}

          {activeTab === "pulse" && (
            <View style={styles.tabContent}>
              <View style={styles.card}>
                <Text style={styles.cardHeaderTitle}>نبض التطبيق الحي 💓</Text>
                <Text style={{ color: '#94A3B8', textAlign: 'center', marginBottom: 20 }}>آخر التحركات المسجلة الآن</Text>
                
                {recentActions.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Feather name="activity" size={40} color="#334155" />
                    <Text style={{ color: '#475569', marginTop: 10 }}>لا يوجد نشاط مسجل حالياً</Text>
                  </View>
                ) : (
                  recentActions.map((action, idx) => (
                    <View key={idx} style={styles.pulseItem}>
                      <View style={[styles.pulseDot, { backgroundColor: goldColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pulseText}>{action.msg}</Text>
                        <Text style={styles.pulseTime}>{action.time}</Text>
                      </View>
                    </View>
                  ))
                )}
                
                <TouchableOpacity onPress={fetchStats} style={styles.refreshPulseBtn}>
                   <Feather name="refresh-cw" size={16} color={goldColor} />
                   <Text style={{ color: goldColor, fontFamily: 'Cairo_600SemiBold' }}>تحديث النبض</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === "insights" && (
            <View style={styles.tabContent}>
              <View style={styles.card}>
                <Text style={styles.cardHeaderTitle}>أكثر الكلمات بحثاً 🔍</Text>
                {topSearches.length === 0 ? (
                  <Text style={{ color: '#475569', textAlign: 'center', padding: 20 }}>لا توجد بيانات كافية حالياً</Text>
                ) : (
                  topSearches.map((item, idx) => (
                    <View key={idx} style={styles.insightRow}>
                      <Text style={styles.insightRank}>#{idx + 1}</Text>
                      <Text style={styles.insightName}>{item.name}</Text>
                      <View style={styles.insightBarContainer}>
                        <View style={[styles.insightBar, { width: `${(item.count / topSearches[0].count) * 100}%`, backgroundColor: '#3B82F6' }]} />
                      </View>
                      <Text style={styles.insightCount}>{item.count}</Text>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardHeaderTitle}>أكثر الدروس مشاهدة 📚</Text>
                {topLessons.length === 0 ? (
                  <Text style={{ color: '#475569', textAlign: 'center', padding: 20 }}>لا توجد بيانات كافية حالياً</Text>
                ) : (
                  topLessons.map((item, idx) => (
                    <View key={idx} style={styles.insightRow}>
                      <Text style={styles.insightRank}>#{idx + 1}</Text>
                      <Text style={styles.insightName}>{item.name}</Text>
                      <View style={styles.insightBarContainer}>
                        <View style={[styles.insightBar, { width: `${(item.count / topLessons[0].count) * 100}%`, backgroundColor: goldColor }]} />
                      </View>
                      <Text style={styles.insightCount}>{item.count}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
          {activeTab === "config" && (
            <View style={styles.tabContent}>
              <View style={styles.card}>
                <Text style={styles.cardHeaderTitle}>التحكم في السيستم</Text>
                
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}><Text style={styles.switchTitle}>وضع الصيانة</Text></View>
                  <Switch value={maintenance} onValueChange={setMaintenance} trackColor={{ true: '#ef4444' }} />
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}><Text style={styles.switchTitle}>إجبار الجميع على التحديث</Text></View>
                  <Switch value={forceUpdate} onValueChange={setForceUpdate} trackColor={{ true: goldColor }} />
                </View>

                <TouchableOpacity onPress={handleSaveConfig} style={styles.mainActionBtn}>
                  <LinearGradient colors={['#334155', '#1E293B']} style={styles.btnGradient}>
                    {isSavingConfig ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.mainBtnText, { color: '#FFF' }]}>حفظ إعدادات السيستم 💾</Text>}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={{ height: 20 }} />
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 20 }} />

                <Text style={[styles.switchTitle, { color: goldColor, marginBottom: 10, textAlign: 'center' }]}>معاينة التجربة للمستخدم</Text>
                <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', marginBottom: 15, fontFamily: 'Cairo_600SemiBold' }}>
                  سيتم تسجيل خروجك مؤقتاً لترى شاشة الصيانة كما يراها المستخدم العادي.
                </Text>
                
                <TouchableOpacity 
                  style={{ backgroundColor: 'rgba(200,169,81,0.1)', borderWidth: 1, borderColor: goldColor, padding: 15, borderRadius: 12, alignItems: 'center' }} 
                  onPress={async () => {
                    await AsyncStorage.removeItem("@coptic/maintenance_bypass");
                    toggleAdminMode();
                    Alert.alert("وضع المعاينة", "ستظهر لك الآن شاشة الصيانة. استخدم زر 'الإدارة' السري في أسفلها للعودة.");
                  }}
                >
                  <Text style={{ color: goldColor, fontFamily: 'Cairo_700Bold' }}>تشغيل المعاينة الحية 👀</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={handleClearLogs} style={styles.dangerBtn}>
                <Feather name="trash-2" size={18} color="#ef4444" />
              <Text style={styles.dangerBtnText}>تصفير سجلات النشاط (Danger Zone)</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === "local" && (
            <View style={styles.tabContent}>
              <AdminLocalTools />
            </View>
          )}

          {activeTab === "cloudflare" && (
            <View style={styles.tabContent}>
              <CloudflareNotificationsPanel
                session={cloudflareSession}
                onSessionChange={setCloudflareSession}
              />
              <CloudflareUsefulBotsPanel session={cloudflareSession} />
              <CloudflareRemoteControlPanel session={cloudflareSession} />
            </View>
          )}

          {activeTab === "history" && (
            <View style={styles.tabContent}>
              <CloudflareAdminReports view="history" session={cloudflareSession} />
            </View>
          )}

          {activeTab === "versions" && (
            <View style={styles.tabContent}>
              <CloudflareAdminReports view="versions" session={cloudflareSession} />
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Overlay */}
      {showSuccess && (
        <Animated.View style={[styles.successOverlay, { opacity: successAnim }]}>
          <View style={styles.successBox}>
            <Feather name="check-circle" size={50} color={goldColor} />
            <Text style={styles.successText}>تم تنفيذ الأمر!</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, gap: 15 },
  backBtn: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  headerTitleContainer: { flex: 1 },
  headerTitle: { fontSize: 22, fontFamily: 'Cairo_700Bold', color: '#FFF' },
  headerSubtitle: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#C8A951', marginTop: -4 },
  refreshBtn: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(200,169,81,0.1)' },
  tabBar: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  tabItem: { minWidth: 80, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 15, gap: 4 },
  tabLabel: { fontSize: 13, fontFamily: 'Cairo_600SemiBold' },
  scrollBody: { padding: 20 },
  tabContent: { gap: 20 },
  card: { padding: 24, borderRadius: 28, backgroundColor: '#1E293B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardHeaderTitle: { fontSize: 18, fontFamily: 'Cairo_700Bold', color: '#FFF', marginBottom: 20, textAlign: 'center' },
  typeToggle: { flexDirection: 'row', backgroundColor: '#0F172A', borderRadius: 16, padding: 4, marginBottom: 15 },
  typeBtn: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  activeTypeBtn: { backgroundColor: '#C8A951' },
  typeBtnText: { fontSize: 14, fontFamily: 'Cairo_700Bold' },
  premiumInput: { backgroundColor: '#0F172A', borderRadius: 14, padding: 15, fontSize: 15, color: '#FFF', borderWidth: 1, borderColor: '#334155', marginBottom: 10, fontFamily: 'Cairo_600SemiBold' },
  mainActionBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 10 },
  btnGradient: { paddingVertical: 18, alignItems: 'center' },
  mainBtnText: { fontSize: 16, fontFamily: 'Cairo_700Bold', color: '#1E293B' },
  statsRow: { flexDirection: 'row', gap: 15 },
  statBox: { flex: 1, padding: 25, borderRadius: 24, backgroundColor: '#0F172A', alignItems: 'center' },
  statValue: { fontSize: 32, fontFamily: 'Cairo_700Bold', color: '#FFF' },
  statLabel: { fontSize: 12, fontFamily: 'Cairo_600SemiBold', color: '#64748B', marginTop: 5 },
  auditCard: { marginTop: 20, padding: 15, backgroundColor: '#0F172A', borderRadius: 16, gap: 10 },
  auditItem: { flexDirection: 'row', justifyContent: 'space-between' },
  auditLabel: { color: '#64748B', fontSize: 13 },
  auditVal: { color: '#FFF', fontSize: 14, fontFamily: 'Cairo_700Bold' },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  switchTitle: { fontSize: 15, fontFamily: 'Cairo_700Bold', color: '#FFF' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 15, borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  dangerBtnText: { color: '#ef4444', fontSize: 14, fontFamily: 'Cairo_700Bold' },
  successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.8)', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  successBox: { backgroundColor: '#1E293B', padding: 40, borderRadius: 32, alignItems: 'center', borderWidth: 1, borderColor: '#C8A951' },
  successText: { color: '#FFF', fontSize: 18, fontFamily: 'Cairo_700Bold', marginTop: 15 },
  
  // Pulse Styles
  pulseItem: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  pulseText: { color: '#FFF', fontSize: 14, fontFamily: 'Cairo_600SemiBold' },
  pulseTime: { color: '#64748B', fontSize: 10 },
  refreshPulseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
  
  // Insights Styles
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  insightRank: { color: '#C8A951', fontSize: 14, fontFamily: 'Cairo_700Bold', width: 30 },
  insightName: { color: '#FFF', fontSize: 14, fontFamily: 'Cairo_600SemiBold', width: 80 },
  insightBarContainer: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' },
  insightBar: { height: '100%', borderRadius: 4 },
  insightCount: { color: '#94A3B8', fontSize: 12, fontFamily: 'Inter_600SemiBold', width: 30, textAlign: 'right' },
  audienceHero: { padding: 20, borderRadius: 24, backgroundColor: '#0F172A', borderWidth: 1, borderColor: 'rgba(200,169,81,0.18)' },
  audienceHeroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  audienceEyebrow: { color: '#94A3B8', fontSize: 12, fontFamily: 'Cairo_600SemiBold' },
  audienceTitle: { color: '#FFF', fontSize: 19, fontFamily: 'Cairo_700Bold', marginTop: 2 },
  audienceHeroIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(200,169,81,0.12)', alignItems: 'center', justifyContent: 'center' },
  audienceTotal: { color: '#FFF', fontSize: 42, lineHeight: 54, fontFamily: 'Cairo_700Bold', marginTop: 12, textAlign: 'right' },
  audienceCaption: { color: '#94A3B8', fontSize: 13, fontFamily: 'Cairo_400Regular', textAlign: 'right' },
  audienceActivityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 16 },
  audienceActivityItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  audienceDot: { width: 8, height: 8, borderRadius: 4 },
  audienceActivityValue: { color: '#FFF', fontSize: 15, fontFamily: 'Cairo_700Bold' },
  audienceActivityLabel: { color: '#94A3B8', fontSize: 11, fontFamily: 'Cairo_400Regular' },
  audienceActivityDivider: { width: 1, height: 24, backgroundColor: '#334155', marginHorizontal: 12 },
  audienceProgressTrack: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: '#1E293B' },
  audienceProgressFill: { height: '100%', borderRadius: 4, backgroundColor: '#34D399' },
  audienceRate: { color: '#94A3B8', fontSize: 12, fontFamily: 'Cairo_600SemiBold', marginTop: 9, textAlign: 'right' },
  audienceSectionTitle: { color: '#FFF', fontSize: 16, fontFamily: 'Cairo_700Bold', marginTop: 24, marginBottom: 12, textAlign: 'right' },
  audienceMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  audienceMetricCard: { width: '48.5%', minHeight: 122, padding: 15, borderRadius: 20, backgroundColor: '#0F172A', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(148,163,184,0.08)' },
  audienceMetricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  audienceMetricValue: { color: '#FFF', fontSize: 23, fontFamily: 'Cairo_700Bold', textAlign: 'right' },
  audienceMetricLabel: { color: '#94A3B8', fontSize: 12, fontFamily: 'Cairo_600SemiBold', textAlign: 'right' },
  audienceUpdated: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 8 },
  audienceUpdatedText: { color: '#64748B', fontSize: 11, fontFamily: 'Cairo_400Regular' },
});
