import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  Share,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang } from "@/contexts/LanguageContext";
import Constants from "expo-constants";
import { getDeviceId, getHardwareDeviceId, logActivity, backupUserData } from "@/hooks/useUserTracking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFavorites } from "@/hooks/useFavorites";
import { useHistory } from "@/contexts/HistoryContext";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { useAdmin } from "@/contexts/AdminContext";
import NetInfo from "@react-native-community/netinfo";
import { verifyAdminPin } from "@/lib/adminAuth";
import { useAppConfig } from "@/contexts/AppConfigContext";

export default function AboutScreen({ compactHeader = false }: { compactHeader?: boolean }) {
  const colors = useThemeColors();
  const { t, lang } = useLang();
  // User requested reversed directionality for About screen:
  // Arabic (ar) -> LTR (false)
  // Others (en, fr, de) -> RTL (true)
  const isRTL = lang !== "ar";
  const insets = useSafeAreaInsets();
  const topPad = compactHeader ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  const [showModal, setShowModal] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const { favorites } = useFavorites();
  const { history } = useHistory();
  const { currentAppLink } = useAppUpdate();
  const { remoteSettings } = useAppConfig();
  const { isAdminMode, toggleAdminMode } = useAdmin();
  const router = useRouter();
  
  const [tapCount, setTapCount] = useState(0);
  const tapTimer = React.useRef<NodeJS.Timeout | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  useEffect(() => {
    checkQueue();
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) processQueue();
    });
    return () => unsubscribe();
  }, []);


  const checkQueue = async () => {
    const queue = await AsyncStorage.getItem("@admin_notif_queue");
    if (queue) setOfflineQueueCount(JSON.parse(queue).length);
  };

  const processQueue = async () => {
    const queueStr = await AsyncStorage.getItem("@admin_notif_queue");
    if (!queueStr) return;
    const queue = JSON.parse(queueStr);
    if (queue.length === 0) return;
    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbysXsdSwx6JgvaOq2D9V1iukJ-ZvCKwEcH8DCN9mWCHtw-DenWianhq4omGtITYARw2eA/exec";
    for (const item of queue) {
      try {
        await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify(item),
          headers: { "Content-Type": "application/json" }
        });
      } catch (e) {}
    }
    await AsyncStorage.removeItem("@admin_notif_queue");
    setOfflineQueueCount(0);
  };

  const handleSecretTap = () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    const nextCount = tapCount + 1;
    setTapCount(nextCount);
    if (nextCount >= 6) {
      if (isAdminMode) {
        toggleAdminMode();
        Alert.alert("وضع المسؤول", "تم إغلاق وضع الإدارة وإخفاء اللوحة بنجاح.");
      } else {
        setShowPinModal(true);
      }
      setTapCount(0);
    } else {
      tapTimer.current = setTimeout(() => setTapCount(0), 1000) as any;
    }
  };

  const verifyPin = async () => {
    if (isVerifyingPin || !adminPin) return;
    setIsVerifyingPin(true);
    try {
      const result = await verifyAdminPin(adminPin);
      if (result.success) {
        toggleAdminMode();
        setShowPinModal(false);
        setAdminPin("");
        setTimeout(() => router.push("/admin" as any), 150);
      } else {
        Alert.alert("تعذر الدخول", result.error === "network_error" ? "تحقق من اتصال الإنترنت ثم حاول مجددًا." : result.error === "rate_limited" ? "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة." : "الكود السري غير صحيح.");
        setAdminPin("");
      }
    } finally {
      setIsVerifyingPin(false);
    }
  };
  
  const handleShare = async () => {
    try {
      let shareMessage = "";
      if (lang === "ar") {
        shareMessage = `يمكنك تحميل تطبيق coptic ⲭⲏⲙⲓ من خلال هذا الرابط:\n${currentAppLink}\n\nيتميز التطبيق بوجود قاموس قبطي متطور وقسم تعلم اللغة القبطية من الصفر بلا إنترنت`;
      } else if (lang === "en") {
        shareMessage = `You can download the coptic ⲭⲏⲙⲓ app via this link:\n${currentAppLink}\n\nThe app features an advanced Coptic dictionary and a section for learning the Coptic language from scratch offline.`;
      } else if (lang === "fr") {
        shareMessage = `Vous pouvez télécharger l'application coptic ⲭⲏⲙⲓ via ce lien :\n${currentAppLink}\n\nL'application propose un dictionnaire copte avancé et une section pour apprendre la langue copte à partir de zéro hors ligne.`;
      } else if (lang === "de") {
        shareMessage = `Sie können die coptic ⲭⲏⲙⲓ App über diesen Link herunterladen:\n${currentAppLink}\n\nDie App bietet ein fortschrittliches koptisches Wörterbuch und einen Bereich zum Erlernen der koptischen Sprache von Grund auf offline.`;
      } else {
        shareMessage = `${t.appName} - ${t.appSub}\n${t.about.description}\n\n${t.word.moreWordsDownload}${currentAppLink}`;
      }

      await Share.share({
        message: shareMessage,
      });
      logActivity("app_share_attempt", undefined, "AboutScreen");
    } catch (error) {
      console.warn("Share error:", error);
    }
  };

  const handleSendSuggestion = async () => {
    if (!suggestion.trim()) return;
    setSending(true);
    try {
      const STORAGE_KEY = "@khmi/suggestions_list";
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const newEntry = `[${new Date().toLocaleString()}] ${suggestion.trim()}`;
      list.push(newEntry);

      const deviceId = await getDeviceId();
      const suggestionsDeviceId = `${deviceId}_Suggestions`;

      // Send as both activity log (with special ID to prevent overwrite) and consolidated backup
      await logActivity("suggestion", undefined, list.join("\n\n"), undefined, suggestionsDeviceId);
      await backupUserData(favorites, history, list);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      setSuggestion("");
      setShowModal(false);

      // Professional Success Feedback
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2500);
    } catch (err) {
      Alert.alert(t.about.suggestions.title, t.about.suggestions.error);
    } finally {
      setSending(false);
    }
  };


  // Use version from app.json/Constants
  const version = Constants.expoConfig?.version || "1.0.4";

  // Dynamic Search Description
  const searchLangs = [`${t.langPrefix}${t.langNames.coptic}`];
  if (lang === "ar") {
    searchLangs.push(`${t.langPrefix}${t.langNames.ar}`);
    (["en", "fr", "de"] as const).forEach((l) => searchLangs.push(`${t.langPrefix}${t.langNames[l]}`));
  } else {
    searchLangs.push(`${t.langPrefix}${t.langNames[lang]}`);
    (["en", "fr", "de"] as const)
      .filter((l) => l !== lang)
      .forEach((l) => searchLangs.push(`${t.langPrefix}${t.langNames[l]}`));
    searchLangs.push(`${t.langPrefix}${t.langNames.ar}`);
  }

  const searchDesc = `${t.about.features.search.desc.split(" ")[0]} ${searchLangs.join(` ${t.or} `)}`;

  const features = [
    { icon: "search", label: t.about.features.search.label, desc: searchDesc },
    { icon: "volume-2", label: t.about.features.audio.label, desc: t.about.features.audio.desc },
    { icon: "star", label: t.about.features.favorites.label, desc: t.about.features.favorites.desc },
    { icon: "download", label: t.about.features.offline.label, desc: t.about.features.offline.desc },
    { icon: "edit-3", label: t.about.features.nameInCoptic.label, desc: t.about.features.nameInCoptic.desc },
    { icon: "book-open", label: t.about.features.training.label, desc: t.about.features.training.desc },
    { icon: "video", label: t.about.features.learnCoptic.label, desc: t.about.features.learnCoptic.desc },
    { icon: "book", label: t.about.features.bible.label, desc: t.about.features.bible.desc },
  ];

  const socialLinks = [
    ...(remoteSettings.controls.link_social_facebook ? [{ icon: "facebook", label: t.social.facebook, url: remoteSettings.content.socialFacebookUrl, color: "#1877F2" }] : []),
    ...(remoteSettings.controls.link_social_whatsapp ? [{ icon: "message-circle", label: t.social.whatsapp, url: remoteSettings.content.socialWhatsAppUrl, color: "#25D366" }] : []),
    ...(remoteSettings.controls.link_social_telegram ? [{ icon: "send", label: t.social.telegram, url: remoteSettings.content.socialTelegramUrl, color: "#0088cc" }] : []),
  ];

  const websiteUrl = remoteSettings.content.websiteUrl;
  const desktopDownloadFallback = lang === "en" ? "Download the desktop app" : lang === "fr" ? "Télécharger l’application pour ordinateur" : lang === "de" ? "Desktop-App herunterladen" : "تحميل التطبيق للكمبيوتر";
  const desktopDownloadLabel = remoteSettings.labels.about_desktop_download.trim() || desktopDownloadFallback;
  const desktopDownloadUrl = remoteSettings.content.desktopDownloadUrl;
  const usefulBots = remoteSettings.usefulBots;
  const controls = remoteSettings.controls;
  const showUsefulWhatsApp = usefulBots.whatsapp && controls.link_bot_whatsapp;
  const showUsefulFacebook = usefulBots.facebook && controls.link_bot_facebook;
  const showUsefulTelegramLearning = usefulBots.telegram && controls.link_bot_telegram_learning;
  const showUsefulTelegramDictionary = usefulBots.telegram && controls.link_bot_telegram_dictionary;
  const showAnyUsefulBot = showUsefulWhatsApp || showUsefulFacebook || showUsefulTelegramLearning || showUsefulTelegramDictionary;
  const rowStyle = { flexDirection: isRTL ? "row-reverse" : "row" } as const;
  const textAlign = isRTL ? "right" : "left";
  const renderSectionToggle = (id: string, title: string, icon: string) => {
    const expanded = expandedSection === id;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpandedSection(expanded ? null : id)}
        style={[styles.accordionHeader, rowStyle, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.78}
      >
        <View style={[styles.accordionIcon, { backgroundColor: colors.tagBg }]}>
          <Feather name={icon as any} size={18} color={colors.primary} />
        </View>
        <Text style={[styles.accordionTitle, { color: colors.text, textAlign }]}>{title}</Text>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.gold} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { backgroundColor: remoteSettings.content.brandColor || colors.headerBg, paddingTop: topPad + 40 }]}>
          <Image source={require("@/assets/images/icon.png")} style={styles.crossIcon} />
          <TouchableOpacity activeOpacity={1} onPress={handleSecretTap}>
            <Text style={styles.headerTitle}>{t.appName}</Text>
          </TouchableOpacity>
          <Text style={[styles.headerSubtitle, { color: colors.gold }]}>{t.appSub}</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>{t.about.version} {version}</Text>
          </View>
        </View>

        {controls.about_features && <View style={styles.section}>
          {renderSectionToggle("features", t.about.featuresTitle, "grid")}
          {expandedSection === "features" && (
            <View style={styles.accordionContent}>
              {features.map((f) => (
                <View key={f.label} style={[styles.featureCard, rowStyle, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.featureIcon, { backgroundColor: colors.tagBg }]}>
                    <Feather name={f.icon as any} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={[styles.featureTitle, { color: colors.text, textAlign }]}>{f.label}</Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary, textAlign }]}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>}

        {controls.about_sources && <View style={styles.section}>
          {renderSectionToggle("sources", t.about.sourcesTitle, "book-open")}
          {expandedSection === "sources" && (
            <View style={styles.accordionContent}>
              <View style={[styles.sourceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sourceTitle, { color: colors.text, textAlign, writingDirection: isRTL ? "rtl" : "ltr" }]}>{t.about.sources.kelliaTitle}</Text>
                <Text style={[styles.sourceText, { color: colors.textSecondary, textAlign, writingDirection: isRTL ? "rtl" : "ltr" }]}>{t.about.sources.kelliaDescription}</Text>
              </View>
              <View style={[styles.sourceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sourceTitle, { color: colors.text, textAlign, writingDirection: isRTL ? "rtl" : "ltr" }]}>{t.about.sources.makariTitle}</Text>
                <Text style={[styles.sourceText, { color: colors.textSecondary, textAlign, writingDirection: isRTL ? "rtl" : "ltr" }]}>{t.about.sources.makariDescription}</Text>
              </View>
            </View>
          )}
        </View>}

        {controls.about_social && socialLinks.length > 0 && <View style={styles.section}>
          {renderSectionToggle("social", t.about.socialTitle, "share-2")}
          {expandedSection === "social" && (
            <View style={styles.accordionContent}>
              <View style={styles.socialGrid}>
                {socialLinks.map((link) => (
                  <TouchableOpacity
                    key={link.label}
                    onPress={() => {
                      logActivity("social_click", undefined, link.label);
                      Linking.openURL(link.url);
                    }}
                    style={[styles.socialCard, { backgroundColor: colors.card, borderColor: link.color }]}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.socialIconBg, { backgroundColor: link.color + "15" }]}>
                      <Feather name={link.icon as any} size={24} color={link.color} />
                    </View>
                    <Text style={[styles.socialLabel, { color: colors.text }]}>{link.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>}

        {controls.about_bots && showAnyUsefulBot ? <View style={styles.section}>
          {renderSectionToggle("telegram", t.about.telegram.title, "send")}
          {expandedSection === "telegram" && (
            <View style={styles.accordionContent}>
              <View style={styles.botGrid}>
                {[
                  ...(showUsefulTelegramLearning ? [
                    { key: "telegram-learning", label: t.about.telegram.learningBot, url: remoteSettings.content.usefulBotsTelegramLearningUrl, icon: "send", color: "#0088cc" },
                  ] : []),
                  ...(showUsefulTelegramDictionary ? [
                    { key: "telegram-dictionary", label: t.about.telegram.dictionaryBot, url: remoteSettings.content.usefulBotsTelegramDictionaryUrl, icon: "send", color: "#0088cc" },
                  ] : []),
                  ...(showUsefulWhatsApp ? [{ key: "whatsapp", label: t.about.telegram.whatsappBot, url: remoteSettings.content.usefulBotsWhatsAppUrl, icon: "message-circle", color: "#25D366" }] : []),
                  ...(showUsefulFacebook ? [{ key: "facebook", label: t.about.telegram.facebookBot, url: remoteSettings.content.usefulBotsFacebookUrl, icon: "facebook", color: "#1877F2" }] : []),
                ].map((bot) => (
                  <TouchableOpacity
                    key={bot.key}
                    onPress={() => {
                      logActivity("social_click", undefined, `UsefulBot: ${bot.label}`);
                      Linking.openURL(bot.url);
                    }}
                    style={[styles.botCard, rowStyle, { backgroundColor: colors.card, borderColor: colors.border }]}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.botIconBg, { backgroundColor: `${bot.color}15` }]}>
                      <Feather name={bot.icon as any} size={20} color={bot.color} />
                    </View>
                    <Text style={[styles.botLabel, { color: colors.text, textAlign }]}>{bot.label}</Text>
                    <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View> : null}

        {controls.about_whatsapp_channel && controls.link_whatsapp_channel && <View style={styles.section}>
          {renderSectionToggle("whatsapp", t.about.whatsappChannelTitle, "message-circle")}
          {expandedSection === "whatsapp" && (
            <View style={styles.accordionContent}>
              <TouchableOpacity
                onPress={() => {
                  logActivity("social_click", undefined, "WhatsAppChannel");
                  Linking.openURL(remoteSettings.content.whatsappChannelUrl);
                }}
                style={[styles.channelCard, rowStyle, { backgroundColor: "rgba(37,211,102,0.1)", borderColor: "#25D366" }]}
                activeOpacity={0.8}
              >
                <View style={[styles.channelIconBg, { backgroundColor: "#25D366" }]}>
                  <Feather name="bell" size={24} color="#fff" />
                </View>
                <View style={styles.channelInfo}>
                  <Text style={[styles.channelLabel, { color: colors.text, textAlign }]}>{remoteSettings.labels.button_about_whatsapp_channel.trim() || t.whatsappChannel}</Text>
                  <Text style={[styles.channelDesc, { color: colors.textSecondary, textAlign }]}>{t.about.whatsappChannelDesc}</Text>
                </View>
                <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color="#25D366" />
              </TouchableOpacity>
            </View>
          )}
        </View>}

        {controls.about_suggestion && <View style={styles.section}>
          {renderSectionToggle("suggestion", t.about.suggestions.title, "message-square")}
          {expandedSection === "suggestion" && (
            <View style={styles.accordionContent}>
              <TouchableOpacity
                onPress={() => setShowModal(true)}
                style={[styles.suggestionBtn, rowStyle, { backgroundColor: colors.card, borderColor: "#8B0000" }]}
                activeOpacity={0.8}
              >
                <View style={styles.suggestionIconBg}>
                  <Feather name="edit-3" size={22} color="#8B0000" />
                </View>
                <Text style={[styles.suggestionLabel, { color: colors.text, textAlign }]}>{remoteSettings.labels.button_about_suggestion.trim() || t.about.suggestions.openForm}</Text>
                <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>}

        {controls.about_website && <View style={styles.section}>
          {renderSectionToggle("website", t.about.websiteLabel, "globe")}
          {expandedSection === "website" && (
            <View style={styles.accordionContent}>
              <TouchableOpacity
                onPress={() => {
                  if (websiteUrl) {
                    logActivity("link_open_external", undefined, websiteUrl);
                    Linking.openURL(websiteUrl);
                  } else {
                    Alert.alert(t.about.websiteLabel, t.about.websiteComingSoon);
                  }
                }}
                style={[styles.botCard, rowStyle, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <View style={[styles.botIconBg, { backgroundColor: "rgba(139,0,0,0.08)" }]}>
                  <Feather name="globe" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.botLabel, { color: colors.text, textAlign }]}>{remoteSettings.labels.button_about_website.trim() || t.about.websiteOpenAction}</Text>
                <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>}

        {controls.about_computer_download && <View style={styles.section}>
          {renderSectionToggle("desktop-download", desktopDownloadLabel, "monitor")}
          {expandedSection === "desktop-download" && (
            <View style={styles.accordionContent}>
              <TouchableOpacity
                onPress={() => {
                  if (/^https:\/\//i.test(desktopDownloadUrl.trim())) {
                    logActivity("link_open_external", undefined, desktopDownloadUrl.trim());
                    void Linking.openURL(desktopDownloadUrl.trim());
                  } else {
                    Alert.alert(desktopDownloadLabel, lang === "en" ? "The download link will be added soon." : lang === "fr" ? "Le lien de téléchargement sera ajouté prochainement." : lang === "de" ? "Der Download-Link wird später hinzugefügt." : "سيُضاف رابط التحميل لاحقًا من لوحة الإدارة.");
                  }
                }}
                style={[styles.botCard, rowStyle, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <View style={[styles.botIconBg, { backgroundColor: colors.tagBg }]}>
                  <Feather name="monitor" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.botLabel, { color: colors.text, textAlign }]}>{desktopDownloadLabel}</Text>
                <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>}

        {controls.about_share && <View style={styles.section}>
          {renderSectionToggle("share", remoteSettings.labels.button_about_share.trim() || t.about.shareLabel, "share-2")}
          {expandedSection === "share" && (
            <View style={styles.accordionContent}>
              <TouchableOpacity
                onPress={handleShare}
                style={[styles.shareBtn, rowStyle, { backgroundColor: colors.card, borderColor: colors.gold }]}
                activeOpacity={0.8}
              >
                <View style={[styles.shareIconBg, { backgroundColor: colors.tagBg }]}>
                  <Feather name="share-2" size={24} color={colors.gold} />
                </View>
                <Text style={[styles.shareLabel, { color: colors.text, textAlign }]}>{remoteSettings.labels.button_about_share.trim() || t.about.shareAction}</Text>
                <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>}

        <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              style={styles.suggestionKeyboardAvoider}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t.about.suggestions.title}</Text>
              <TextInput
                style={[styles.suggestionInput, {
                  color: colors.text,
                  borderColor: colors.border,
                  textAlign: lang === "ar" ? "right" : "left",
                  writingDirection: lang === "ar" ? "rtl" : "ltr",
                }]}
                placeholder={t.about.suggestions.placeholder}
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={5}
                value={suggestion}
                onChangeText={setSuggestion}
              />
              <View style={[styles.modalButtons, rowStyle]}>
                <TouchableOpacity onPress={() => setShowModal(false)} style={[styles.modalBtn, { backgroundColor: colors.border }]}>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.text }}>{t.about.suggestions.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSendSuggestion}
                  disabled={sending || !suggestion.trim()}
                  style={[styles.modalBtn, { backgroundColor: "#8B0000", opacity: sending || !suggestion.trim() ? 0.65 : 1 }]}
                >
                  {sending ? <ActivityIndicator color="#fff" /> : <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: "#fff", fontWeight: "bold" }}>{t.about.suggestions.send}</Text>}
                </TouchableOpacity>
              </View>
            </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Admin Hub Entry Button */}
        {isAdminMode && (
          <View style={[styles.section, { marginBottom: 30 }]}>
            <TouchableOpacity
              onPress={() => router.push("/admin" as any)}
              style={[styles.adminBtn, rowStyle, { backgroundColor: "#1A1A1A", borderColor: "#C8A951", borderWidth: 1.5, borderRadius: 16, padding: 16, alignItems: "center", gap: 12 }]}
              activeOpacity={0.8}
            >
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(200,169,81,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="shield" size={24} color="#C8A951" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign }}>مركز تحكم المسؤول (Admin Hub)</Text>
                {offlineQueueCount > 0 && <Text style={{ color: "#C8A951", fontSize: 12 }}>يوجد {offlineQueueCount} إشعارات في الانتظار...</Text>}
              </View>
              <Feather name="settings" size={18} color="#C8A951" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* PIN Verification Modal */}
      <Modal visible={showPinModal} animationType="fade" transparent onRequestClose={() => setShowPinModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, alignItems: 'center', paddingVertical: 40 }]}>
            <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(200,169,81,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Feather name="lock" size={32} color="#C8A951" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 10 }]}>تأكيد الهوية</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 25, textAlign: 'center' }}>يرجى إدخال الكود السري للوصول للوحة التحكم</Text>
            
            <TextInput
              style={[styles.pinInput, { color: colors.text, borderColor: colors.gold }]}
              placeholder="----"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              value={adminPin}
              onChangeText={setAdminPin}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={verifyPin}
            />

            <View style={[styles.modalButtons, { marginTop: 30, width: '100%' }]}>
              <TouchableOpacity onPress={verifyPin} disabled={isVerifyingPin} style={[styles.modalBtn, { backgroundColor: colors.gold, width: '100%', opacity: isVerifyingPin ? 0.6 : 1 }]}>
                {isVerifyingPin ? <ActivityIndicator color="#000" /> : <Text style={{ color: "#000", fontFamily: 'Cairo_700Bold' }}>تفعيل الدخول</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowPinModal(false)} style={[styles.modalBtn, { backgroundColor: 'transparent' }]}>
                <Text style={{ color: colors.textSecondary }}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Suggestion Success Feedback */}
      {showSuccess && (
        <View style={styles.successOverlay} pointerEvents="none">
          <Animated.View style={[styles.successCard, { backgroundColor: colors.card, borderColor: "#8B0000" }]}>
            <View style={[styles.successIconBg, { backgroundColor: "rgba(139,0,0,0.1)" }]}>
              <Feather name="check" size={40} color="#8B0000" />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>{t.about.suggestions.title}</Text>
            <Text style={[styles.successMsg, { color: colors.textSecondary }]}>{t.about.suggestions.success}</Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 40, paddingHorizontal: 20, alignItems: "center" },
  crossIcon: { width: 90, height: 90, borderRadius: 22, marginBottom: 12 },
  headerTitle: {
    fontSize: 34,
    fontFamily: "CSAvaVeni-Regular",
    color: "#FFFFFF", marginBottom: 2,
  },
  headerSubtitle: { fontSize: 16, fontFamily: "Inter_400Regular", letterSpacing: 1.2, marginBottom: 16 },
  versionBadge: {
    backgroundColor: "rgba(200,169,81,0.2)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(200,169,81,0.4)",
  },
  versionText: { color: "#C8A951", fontSize: 13, fontFamily: "Inter_500Medium" },
  section: { paddingHorizontal: 16, paddingTop: 14 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 14 },
  accordionHeader: { minHeight: 62, alignItems: "center", borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, gap: 12 },
  accordionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  accordionTitle: { flex: 1, fontSize: 15, fontFamily: "Cairo_700Bold" },
  accordionContent: { marginTop: 12 },
  featureCard: {
    alignItems: "center",
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12, gap: 16,
  },
  featureIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  featureDesc: { fontSize: 13.5, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sourceCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 11, gap: 8 },
  sourceTitle: { fontSize: 14, fontFamily: "Cairo_700Bold", textAlign: "right", lineHeight: 23 },
  sourceText: { fontSize: 13, fontFamily: "Cairo_400Regular", textAlign: "right", writingDirection: "rtl", lineHeight: 23 },
  socialGrid: { flexDirection: "row", gap: 12 },
  socialCard: { flex: 1, borderRadius: 16, borderWidth: 1.5, padding: 16, alignItems: "center", gap: 10 },
  socialIconBg: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  socialLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  botGrid: { gap: 10 },
  botCard: {
    alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 12,
  },
  botIconBg: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  botLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  suggestionBtn: {
    alignItems: "center", padding: 16, borderRadius: 16, borderWidth: 1.5, gap: 12,
  },
  suggestionIconBg: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(139,0,0,0.1)", alignItems: "center", justifyContent: "center" },
  suggestionLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  channelCard: { alignItems: "center", padding: 16, borderRadius: 16, borderWidth: 1.5, gap: 16 },
  channelIconBg: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  channelInfo: { flex: 1 },
  channelLabel: { fontSize: 16, fontFamily: "Cairo_700Bold", marginBottom: 2 },
  channelDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
  shareBtn: { alignItems: "center", padding: 16, borderRadius: 16, borderWidth: 1.5, gap: 12 },
  shareIconBg: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  shareLabel: { flex: 1, fontSize: 16, fontFamily: "Cairo_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 16 },
  suggestionKeyboardAvoider: { flex: 1, width: "100%", justifyContent: "center" },
  modalContent: { width: "100%", borderRadius: 24, padding: 20, gap: 16, elevation: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  suggestionInput: {
    borderWidth: 1.5, borderRadius: 14, padding: 16, fontSize: 15,
    minHeight: 120, maxHeight: 220, textAlignVertical: "top", fontFamily: "Inter_400Regular",
  },
  modalButtons: { width: "100%", gap: 10 },
  modalBtn: { height: 50, minWidth: 0, paddingHorizontal: 8, borderRadius: 14, alignItems: "center", justifyContent: "center", flex: 1 },
  pinInput: { width: '80%', height: 60, borderWidth: 2, borderRadius: 16, textAlign: 'center', fontSize: 24, letterSpacing: 10, fontFamily: 'Cairo_700Bold' },
  adminBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1.5 },
  successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", zIndex: 999 },
  successCard: { width: "80%", borderRadius: 24, padding: 30, alignItems: "center", borderWidth: 2, elevation: 15, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12 },
  successIconBg: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 10, textAlign: "center" },
  successMsg: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
