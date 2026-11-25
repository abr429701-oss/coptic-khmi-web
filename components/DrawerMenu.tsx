import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  Linking,
  ScrollView,
  Switch,
  BackHandler,
  I18nManager,
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang, type Lang } from "@/contexts/LanguageContext";
import { updateUserInfo, getDeviceId, logActivity } from "@/hooks/useUserTracking";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.75, 300);

interface DrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: "home" | "learn_coptic" | "name_coptic" | "training" | "favorites" | "download" | "about" | "history" | "coptic_bible") => void;
  activeScreen: "home" | "learn_coptic" | "name_coptic" | "training" | "favorites" | "download" | "about" | "history" | "coptic_bible";
  favoritesCount: number;
  historyCount: number;
}



const SOCIAL_LINKS = [
  { icon: "facebook", key: "facebook" as const, url: "https://www.facebook.com/profile.php?id=61574169939115", color: "#1877F2" },
  { icon: "message-circle", key: "whatsapp" as const, url: "https://wa.me/201207829388", color: "#25D366" },
  { icon: "send", key: "telegram" as const, url: "https://telegram.me/Abraam55", color: "#0088cc" },
];

import { LinearGradient } from "expo-linear-gradient";
import { useAppConfig } from "@/contexts/AppConfigContext";

export function DrawerMenu({
  isOpen,
  onClose,
  onNavigate,
  activeScreen,
  favoritesCount,
  historyCount,
}: DrawerMenuProps) {
  const insets = useSafeAreaInsets();
  const { isDark, toggle: toggleDark } = useTheme();
  const colors = useThemeColors();
  const { t, setLang, lang, isRTL } = useLang();
  const { config, remoteSettings } = useAppConfig();

  const [mounted, setMounted] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // احسب اتجاه الـ flex الحقيقي بناءً على لغة التطبيق الحالية واتجاه نظام الهاتف الفعلي
  const isOsRtl = I18nManager.isRTL;
  const rtlFlex = (isRTL !== isOsRtl) ? "row-reverse" : "row";

  // لضبط محاذاة العناصر بداخل الفليكس بوكس المعكوس
  const alignSide = (isRTL !== isOsRtl) ? "flex-end" : "flex-start";

  const LANGS: { code: Lang; label: string }[] = [
    { code: "ar", label: "ع" },
    { code: "en", label: "EN" },
    { code: "fr", label: "FR" },
    { code: "de", label: "DE" },
  ];

  const openDrawer = useCallback(() => {
    setMounted(true);
    translateX.setValue(-DRAWER_WIDTH);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -DRAWER_WIDTH,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => setMounted(false));
  }, []);

  useEffect(() => {
    if (isOpen) {
      openDrawer();
    } else if (mounted) {
      closeDrawer();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => handler.remove();
  }, [isOpen, onClose]);

  // ─── تسجيل تغيير اللغة ─────────────────────────────────────────
  const handleLangChange = useCallback(async (code: Lang) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLang(code);
    try {
      const deviceId = await getDeviceId();
      await updateUserInfo({ language: code });
    } catch (err) {
      console.warn("Failed to update language in sheet:", err);
    }
  }, [setLang]);

  // ─── تسجيل تغيير الوضع الليلي ──────────────────────────────────
  const handleToggleDark = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleDark();
    try {
      const deviceId = await getDeviceId();
      await updateUserInfo({ theme: !isDark });
    } catch (err) {
      console.warn("Failed to update theme in sheet:", err);
    }
  }, [toggleDark, isDark]);

  // ─── تسجيل نقرات وسائل التواصل ─────────────────────────────────
  const handleSocialPress = useCallback(async (key: string, url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const socialUpdate: any = {};
      if (key === "whatsapp") socialUpdate.whatsapp = true;
      else if (key === "facebook") socialUpdate.facebook = true;
      else if (key === "telegram") socialUpdate.telegram = true;
      await updateUserInfo({ social: socialUpdate });
      logActivity("social_click", undefined, key);
    } catch (err) {
      console.warn("Failed to update social clicks:", err);
    }
    Linking.openURL(url);
  }, []);


  if (!mounted) return null;

  const menuLabel = (key: keyof typeof remoteSettings.labels, fallback: string) => remoteSettings.labels[key]?.trim() || fallback;
  const MENU_ITEMS = [
    { id: "home" as const, icon: "book-open", label: menuLabel("nav_home", t.menu.home), count: 0 },
    { id: "learn_coptic" as const, icon: "book", label: menuLabel("nav_learn_coptic", t.menu.learn_coptic), count: 0 },
    { id: "coptic_bible" as const, icon: "bookmark", label: menuLabel("nav_coptic_bible", lang === "de" ? "Koptische Bibel" : (t.menu as any).coptic_bible || "الكتاب المقدس"), count: 0 },
    { id: "name_coptic" as const, icon: "edit-3", label: menuLabel("nav_name_coptic", t.menu.nameInCoptic), count: 0 },

    { id: "training" as const, icon: "target", label: menuLabel("nav_training", t.menu.training), count: 0 },
    { id: "favorites" as const, icon: "star", label: menuLabel("nav_favorites", t.menu.favorites), count: favoritesCount },
    { id: "history" as const, icon: "clock", label: menuLabel("nav_history", t.menu.history), count: historyCount },
    { id: "download" as const, icon: "download-cloud", label: menuLabel("nav_download", t.menu.download), count: 0 },
    { id: "about" as const, icon: "info", label: menuLabel("nav_about", t.menu.about), count: 0 },
  ].filter((item) => {
    const visibilityKey: Partial<Record<typeof item.id, keyof typeof remoteSettings.controls>> = {
      home: "nav_home", learn_coptic: "nav_learn_coptic", coptic_bible: "nav_coptic_bible", name_coptic: "nav_name_coptic",
      training: "nav_training", favorites: "nav_favorites", history: "nav_history", download: "nav_download", about: "nav_about",
    };
    const key = visibilityKey[item.id];
    return !key || remoteSettings.controls[key];
  });
  const socialVisibility = { facebook: remoteSettings.controls.link_social_facebook, whatsapp: remoteSettings.controls.link_social_whatsapp, telegram: remoteSettings.controls.link_social_telegram };
  const socialUrls = { facebook: remoteSettings.content.socialFacebookUrl, whatsapp: remoteSettings.content.socialWhatsAppUrl, telegram: remoteSettings.content.socialTelegramUrl };
  const visibleSocialLinks = SOCIAL_LINKS.filter((link) => socialVisibility[link.key]).map((link) => ({ ...link, url: socialUrls[link.key] }));
  const drawerMessageLanguageKey: Record<Lang, keyof typeof remoteSettings.content> = {
    ar: "drawerMessageAr", en: "drawerMessageEn", fr: "drawerMessageFr", de: "drawerMessageDe",
  };
  const drawerMessage = remoteSettings.content[drawerMessageLanguageKey[lang]] || remoteSettings.content.drawerMessage || config.drawerMsg;


  const drawerBg = isDark ? "#140303" : "#1A0505";
  const labelColor = "#CCCCCC";
  const dividerClr = "rgba(255,255,255,0.08)";
  const iconBg = "rgba(200,169,81,0.10)";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="auto"
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: drawerBg,
            paddingTop: Platform.OS === "web" ? 0 : insets.top,
            paddingBottom: Platform.OS === "web" ? 0 : insets.bottom,
            transform: [{ translateX }],
          },
        ]}
        pointerEvents="auto"
      >
        <LinearGradient
          colors={[remoteSettings.content.brandColor || "#8B0000", "#65000A", "#3E0710"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { flexDirection: rtlFlex }]}
        >
          <View style={styles.logoWrap}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={styles.logoImg}
            />
          </View>
          <View style={{ alignItems: alignSide }}>
            <Text style={styles.appName}>{t.appName}</Text>
            <Text style={styles.appSub}>{t.appSub}</Text>
          </View>
        </LinearGradient>

        <View style={[styles.headerDivider, { backgroundColor: "rgba(200,169,81,0.35)" }]} />

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {MENU_ITEMS.map((item) => {
            const active = activeScreen === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.menuItem,
                  active && styles.menuItemActive,
                  { flexDirection: rtlFlex }
                ]}
                onPress={() => {
                  onNavigate(item.id as any);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.iconWrap,
                  { backgroundColor: active ? "#8B0000" : iconBg },
                ]}>
                  <Feather
                    name={item.icon as any}
                    size={18}
                    color={active ? "#fff" : "#C8A951"}
                  />
                </View>
                <Text
                  style={[
                    styles.menuLabel,
                    { color: active ? "#FFFFFF" : labelColor },
                    active && styles.menuLabelActive,
                    isRTL && { textAlign: "right" },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.label}
                  {item.count > 0 ? ` (${item.count})` : ""}
                </Text>
                <View style={{ flex: 1 }} />
                {active && <View style={styles.activeIndicator} />}
              </TouchableOpacity>
            );
          })}

          <View style={[styles.divider, { backgroundColor: dividerClr }]} />

          {/* الوضع الليلي */}
          {remoteSettings.controls.drawer_dark_mode && <View style={styles.sectionCard}>
            <TouchableOpacity style={[styles.settingRow, { flexDirection: rtlFlex }]} onPress={handleToggleDark} activeOpacity={0.7}>
              <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                <Feather name={isDark ? "moon" : "sun"} size={18} color="#C8A951" />
              </View>
              <View style={{ flex: 1 }} />
              <Switch
                value={isDark}
                onValueChange={handleToggleDark}
                trackColor={{ false: "#444", true: "#8B0000" }}
                thumbColor={isDark ? "#C8A951" : "#CCCCCC"}
                ios_backgroundColor="#444"
              />
            </TouchableOpacity>
          </View>}

          {/* اللغة */}
          {remoteSettings.controls.drawer_language && <View style={styles.sectionCard}>
            <View style={[styles.settingRow, { flexDirection: rtlFlex }]}>
              <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                <Feather name="globe" size={18} color="#C8A951" />
              </View>
              <View style={[styles.langRow, { flexDirection: rtlFlex }]}>
                {LANGS.map((l) => (
                  <TouchableOpacity
                    key={l.code}
                    style={[styles.langBtn, lang === l.code && styles.langBtnActive]}
                    onPress={() => handleLangChange(l.code)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>
                      {l.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>}


          <View style={[styles.divider, { backgroundColor: dividerClr }]} />

          {remoteSettings.controls.drawer_contact_heading && <View style={styles.contactRow}>
            <View style={[styles.contactLine, { backgroundColor: "rgba(200,169,81,0.2)" }]} />
            <Text style={styles.contactTitle}>{t.contactUs}</Text>
            <View style={[styles.contactLine, { backgroundColor: "rgba(200,169,81,0.2)" }]} />
          </View>}

          {remoteSettings.controls.drawer_social_section && visibleSocialLinks.length > 0 && <View style={[styles.socialRow, { flexDirection: rtlFlex }]}>
            {visibleSocialLinks.map((link) => (
              <TouchableOpacity
                key={link.key}
                style={[styles.socialBtn, { borderColor: link.color + "40" }]}
                onPress={() => handleSocialPress(link.key, link.url)}
                activeOpacity={0.7}
              >
                <View style={[styles.socialIcon, {
                  backgroundColor: link.color + "18",
                  borderColor: link.color + "40",
                }]}>
                  <Feather name={link.icon as any} size={22} color={link.color} />
                </View>
                <Text style={[styles.socialLabel, { color: link.color }]}>
                  {t.social[link.key]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>}

          {/* رسالة الإدارة المتحركة أو الثابتة في القائمة */}
          {remoteSettings.controls.drawer_admin_message && drawerMessage ? (
            <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 5 }}>
              <LinearGradient
                colors={isDark ? ["#1E293B", "#0F172A"] : ["#F8FAFC", "#F1F5F9"]}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isDark ? "rgba(200,169,81,0.2)" : "rgba(139,0,0,0.1)"
                }}
              >
                <Text style={{
                  color: isDark ? "#C8A951" : "#8B0000",
                  fontFamily: "Cairo_600SemiBold",
                  fontSize: 13,
                  textAlign: 'center'
                }}>
                  {drawerMessage}
                </Text>
              </LinearGradient>
            </View>
          ) : null}

          {remoteSettings.controls.drawer_version_label && <View style={styles.versionFooter}>
            <Text style={styles.versionText}>
              Version {Constants.expoConfig?.version || "1.0.0"}
            </Text>
          </View>}

          <View style={{ height: 16 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    borderLeftWidth: 1,
    borderColor: "rgba(200,169,81,0.28)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 25,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(232,200,120,0.38)",
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 13,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "#C8A951",
  },
  logoImg: { width: 52, height: 52 },
  appName: {
    fontSize: 26,
    color: "#FFFFFF",
    fontFamily: "CSAvaVeni-Regular",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  appSub: {
    fontSize: 11,
    color: "rgba(200,169,81,0.9)",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    marginTop: 2,
    textTransform: "uppercase",
  },
  headerDivider: {
    height: 1,
    marginHorizontal: 18,
  },
  scroll: { flex: 1, paddingTop: 10 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 11,
    marginVertical: 3,
    borderRadius: 15,
    gap: 10,
  },
  menuItemActive: {
    backgroundColor: "rgba(139,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(200,169,81,0.32)",
    elevation: 2,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontSize: 16,
    fontFamily: "Cairo_600SemiBold",
    letterSpacing: 0.2,
  },
  menuLabelActive: {
    color: "#FFFFFF",
  },
  activeIndicator: {
    width: 4,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#C8A951",
    shadowColor: "#C8A951",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    marginVertical: 10,
  },
  sectionCard: {
    marginHorizontal: 13,
    marginVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(200,169,81,0.12)",
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  langRow: { flexDirection: "row", gap: 6, flexShrink: 0 },
  langBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(200,169,81,0.25)",
    backgroundColor: "rgba(200,169,81,0.05)",
  },
  langBtnActive: {
    backgroundColor: "#8B0000",
    borderColor: "#C8A951",
  },
  langText: {
    color: "#888",
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
  },
  langTextActive: { color: "#C8A951" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 12,
    gap: 10,
  },
  contactLine: { flex: 1, height: 1 },
  contactTitle: {
    fontSize: 11,
    color: "#C8A951",
    fontFamily: "Cairo_700Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  socialRow: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 6,
  },
  socialBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 15,
    borderWidth: 1,
  },
  socialIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  socialLabel: {
    fontSize: 12,
    fontFamily: "Cairo_600SemiBold",
  },
  channelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    padding: 14,
    backgroundColor: "rgba(37,211,102,0.08)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(37,211,102,0.25)",
  },
  channelIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
  channelText: {
    flex: 1,
    fontSize: 14,
    color: "#25D366",
    fontFamily: "Cairo_700Bold",
  },
  versionFooter: {
    marginTop: 20,
    paddingVertical: 10,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    marginHorizontal: 40,
  },
  versionText: {
    fontSize: 11,
    color: "rgba(200,169,81,0.4)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
  },
});
