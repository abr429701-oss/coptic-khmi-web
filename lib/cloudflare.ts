import { DEFAULT_REMOTE_VISIBILITY, type RemoteVisibility } from "@/lib/remoteVisibility";

export const CLOUDFLARE_API_BASE = "https://coptic-app-notifications.abraammerzik56.workers.dev";

export interface CloudflareAdminSession {
  token: string;
  expiresAt: number;
}

export interface UsefulBotsSettings {
  whatsapp: boolean;
  facebook: boolean;
  telegram: boolean;
}

export interface RemoteControls {
  nav_home: boolean;
  nav_learn_coptic: boolean;
  nav_coptic_bible: boolean;
  nav_name_coptic: boolean;
  nav_training: boolean;
  nav_favorites: boolean;
  nav_history: boolean;
  nav_download: boolean;
  nav_about: boolean;
  about_features: boolean;
  about_sources: boolean;
  about_social: boolean;
  about_bots: boolean;
  about_whatsapp_channel: boolean;
  about_suggestion: boolean;
  about_website: boolean;
  about_share: boolean;
  about_computer_download: boolean;
  link_social_facebook: boolean;
  link_social_whatsapp: boolean;
  link_social_telegram: boolean;
  link_bot_whatsapp: boolean;
  link_bot_facebook: boolean;
  link_bot_telegram_learning: boolean;
  link_bot_telegram_dictionary: boolean;
  link_whatsapp_channel: boolean;
  home_favorites_shortcut: boolean;
  home_connection_status: boolean;
  home_announcement: boolean;
  learn_intro_video: boolean;
  learn_letter_intro: boolean;
  learn_review_videos: boolean;
  learn_lesson_1: boolean;
  learn_lesson_2: boolean;
  learn_lesson_3: boolean;
  learn_lesson_4: boolean;
  learn_lesson_5: boolean;
  learn_lesson_6: boolean;
  learn_lesson_7: boolean;
  learn_lesson_8: boolean;
  learn_lesson_9: boolean;
  learn_summary_button: boolean;
  learn_oral_button: boolean;
  learn_exam_button: boolean;
  learn_glossary_button: boolean;
  learn_download_button: boolean;
  training_listening: boolean;
  training_handwriting: boolean;
  training_grammar_quiz: boolean;
  training_word_scramble: boolean;
  training_matching: boolean;
  training_stats: boolean;
  bible_old_testament: boolean;
  bible_new_testament: boolean;
  bible_deuterocanonical: boolean;
  drawer_dark_mode: boolean;
  drawer_language: boolean;
  drawer_contact_heading: boolean;
  drawer_social_section: boolean;
  drawer_admin_message: boolean;
  drawer_version_label: boolean;
  dictionary_filter_button: boolean;
  dictionary_coptic_keyboard: boolean;
  dictionary_result_counter: boolean;
  dictionary_result_audio: boolean;
  dictionary_secondary_meaning: boolean;
  dictionary_word_metadata: boolean;
  home_coptic_date_bar: boolean;
  bible_search: boolean;
  bible_translation_controls: boolean;
  bible_cross_references: boolean;
  bible_export_controls: boolean;
  dictionary_result_index: boolean;
  dictionary_meaning_count: boolean;
  dictionary_clear_query: boolean;
  dictionary_search_logo: boolean;
  bible_layout_modes: boolean;
  bible_verse_actions: boolean;
}

export interface RemoteContent {
  announcementText: string;
  announcementTextAr: string;
  announcementTextEn: string;
  announcementTextFr: string;
  announcementTextDe: string;
  announcementStartsAt: string;
  announcementEndsAt: string;
  drawerMessage: string;
  drawerMessageAr: string;
  drawerMessageEn: string;
  drawerMessageFr: string;
  drawerMessageDe: string;
  appLatestVersion: string;
  appUpdateUrl: string;
  desktopDownloadUrl: string;
  appUpdateAdminOnly: string;
  appUpdateMode: string;
  appWhatsNewAr: string;
  appWhatsNewEn: string;
  appWhatsNewFr: string;
  appWhatsNewDe: string;
  dictionaryMaxResults: string;
  dictionaryMinSearchLength: string;
  dictionarySortMode: string;
  dictionarySpreadsheet: string;
  dictionarySheetName: string;
  dictionaryColumnCoptic: string;
  dictionaryColumnArabic: string;
  dictionaryColumnEnglish: string;
  dictionaryColumnFrench: string;
  dictionaryColumnGerman: string;
  dictionaryColumnOrigin: string;
  dictionaryColumnWordType: string;
  dictionaryColumnAudio: string;
  dictionaryColumnGender: string;
  websiteUrl: string;
  socialFacebookUrl: string;
  socialWhatsAppUrl: string;
  socialTelegramUrl: string;
  usefulBotsWhatsAppUrl: string;
  usefulBotsFacebookUrl: string;
  usefulBotsTelegramLearningUrl: string;
  usefulBotsTelegramDictionaryUrl: string;
  whatsappChannelUrl: string;
  brandColor: string;
}

export interface RemoteAppSettings {
  usefulBots: UsefulBotsSettings;
  controls: RemoteControls;
  visibility: RemoteVisibility;
  content: RemoteContent;
  labels: RemoteLabels;
  notificationSchedule: RemoteNotificationSchedule;
  updatedAt?: number;
}

export interface RemoteNotificationSchedule {
  dailyWord: string;
  copticMonth: string;
  copticNewYear: string;
  gregorianNewYear: string;
  audioFirstDownload: string;
  audioContinueDownload: string;
}

export interface RemoteLabels {
  nav_home: string;
  nav_learn_coptic: string;
  nav_coptic_bible: string;
  nav_name_coptic: string;
  nav_training: string;
  nav_favorites: string;
  nav_history: string;
  nav_download: string;
  nav_about: string;
  about_desktop_download: string;
  button_home_favorites: string;
  button_search_filter: string;
  button_search_keyboard: string;
  button_search_clear: string;
  button_training_listening: string;
  button_training_handwriting: string;
  button_training_grammar_quiz: string;
  button_training_word_scramble: string;
  button_training_matching: string;
  button_training_stats: string;
  button_bible_scope_all: string;
  button_bible_scope_old: string;
  button_bible_scope_new: string;
  button_bible_scope_deuterocanonical: string;
  button_bible_scope_book: string;
  button_bible_layout_stacked: string;
  button_bible_layout_table: string;
  button_bible_export_word: string;
  button_bible_export_pptx: string;
  button_bible_export_pdf: string;
  button_bible_export_excel: string;
  button_bible_verse_download: string;
  button_bible_verse_copy: string;
  button_lesson_summary: string;
  button_lesson_training: string;
  button_lesson_exam: string;
  button_lesson_glossary: string;
  button_lesson_download: string;
  button_final_exam: string;
  button_get_certificate: string;
  button_about_share: string;
  button_about_suggestion: string;
  button_about_website: string;
  button_about_whatsapp_channel: string;
}

export const DEFAULT_USEFUL_BOTS: UsefulBotsSettings = {
  whatsapp: true,
  facebook: true,
  telegram: true,
};

export const DEFAULT_REMOTE_CONTROLS: RemoteControls = {
  nav_home: true,
  nav_learn_coptic: true,
  nav_coptic_bible: true,
  nav_name_coptic: true,
  nav_training: true,
  nav_favorites: true,
  nav_history: true,
  nav_download: true,
  nav_about: true,
  about_features: true,
  about_sources: true,
  about_social: true,
  about_bots: true,
  about_whatsapp_channel: true,
  about_suggestion: true,
  about_website: true,
  about_share: true,
  about_computer_download: true,
  link_social_facebook: true,
  link_social_whatsapp: true,
  link_social_telegram: true,
  link_bot_whatsapp: true,
  link_bot_facebook: true,
  link_bot_telegram_learning: true,
  link_bot_telegram_dictionary: true,
  link_whatsapp_channel: true,
  home_favorites_shortcut: true,
  home_connection_status: true,
  home_announcement: true,
  learn_intro_video: true,
  learn_letter_intro: true,
  learn_review_videos: true,
  learn_lesson_1: true,
  learn_lesson_2: true,
  learn_lesson_3: true,
  learn_lesson_4: true,
  learn_lesson_5: true,
  learn_lesson_6: true,
  learn_lesson_7: true,
  learn_lesson_8: true,
  learn_lesson_9: true,
  learn_summary_button: true,
  learn_oral_button: true,
  learn_exam_button: true,
  learn_glossary_button: true,
  learn_download_button: true,
  training_listening: true,
  training_handwriting: true,
  training_grammar_quiz: true,
  training_word_scramble: true,
  training_matching: true,
  training_stats: true,
  bible_old_testament: true,
  bible_new_testament: true,
  bible_deuterocanonical: true,
  drawer_dark_mode: true,
  drawer_language: true,
  drawer_contact_heading: true,
  drawer_social_section: true,
  drawer_admin_message: true,
  drawer_version_label: true,
  dictionary_filter_button: true,
  dictionary_coptic_keyboard: true,
  dictionary_result_counter: true,
  dictionary_result_audio: true,
  dictionary_secondary_meaning: true,
  dictionary_word_metadata: true,
  home_coptic_date_bar: true,
  bible_search: true,
  bible_translation_controls: true,
  bible_cross_references: true,
  bible_export_controls: true,
  dictionary_result_index: true,
  dictionary_meaning_count: true,
  dictionary_clear_query: true,
  dictionary_search_logo: true,
  bible_layout_modes: true,
  bible_verse_actions: true,
};

export const DEFAULT_REMOTE_CONTENT: RemoteContent = {
  announcementText: "",
  announcementTextAr: "",
  announcementTextEn: "",
  announcementTextFr: "",
  announcementTextDe: "",
  announcementStartsAt: "",
  announcementEndsAt: "",
  drawerMessage: "",
  drawerMessageAr: "",
  drawerMessageEn: "",
  drawerMessageFr: "",
  drawerMessageDe: "",
  appLatestVersion: "",
  appUpdateUrl: "",
  desktopDownloadUrl: "",
  appUpdateAdminOnly: "false",
  appUpdateMode: "sheet",
  appWhatsNewAr: "",
  appWhatsNewEn: "",
  appWhatsNewFr: "",
  appWhatsNewDe: "",
  dictionaryMaxResults: "5000",
  dictionaryMinSearchLength: "1",
  dictionarySortMode: "source",
  dictionarySpreadsheet: "14pUNXtrHoMSU9lBWhKQZyspe-DDTMDudSiuL2sJQRUI",
  dictionarySheetName: "dictionary",
  dictionaryColumnCoptic: "A",
  dictionaryColumnArabic: "C",
  dictionaryColumnEnglish: "D",
  dictionaryColumnFrench: "E",
  dictionaryColumnGerman: "F",
  dictionaryColumnOrigin: "J",
  dictionaryColumnWordType: "K",
  dictionaryColumnAudio: "L",
  dictionaryColumnGender: "",
  websiteUrl: "https://copticdictionry.neocities.org/",
  socialFacebookUrl: "https://www.facebook.com/profile.php?id=61574169939115",
  socialWhatsAppUrl: "https://wa.me/201207829388",
  socialTelegramUrl: "https://telegram.me/Abraam55",
  usefulBotsWhatsAppUrl: "https://wa.me/201212270907",
  usefulBotsFacebookUrl: "https://www.facebook.com/profile.php?id=61554907237871",
  usefulBotsTelegramLearningUrl: "https://t.me/Coptic2_bot",
  usefulBotsTelegramDictionaryUrl: "https://t.me/Coptic_Dictionary_bot",
  whatsappChannelUrl: "https://whatsapp.com/channel/0029VameK2vFSAt7tXNIpm0m",
  brandColor: "#8B0000",
};

export const DEFAULT_NOTIFICATION_SCHEDULE: RemoteNotificationSchedule = {
  dailyWord: "00:40",
  copticMonth: "07:00",
  copticNewYear: "07:00",
  gregorianNewYear: "00:00",
  audioFirstDownload: "14:00",
  audioContinueDownload: "14:00",
};

export const DEFAULT_REMOTE_SETTINGS: RemoteAppSettings = {
  usefulBots: DEFAULT_USEFUL_BOTS,
  controls: DEFAULT_REMOTE_CONTROLS,
  visibility: DEFAULT_REMOTE_VISIBILITY,
  content: DEFAULT_REMOTE_CONTENT,
  notificationSchedule: DEFAULT_NOTIFICATION_SCHEDULE,
  labels: {
    nav_home: "", nav_learn_coptic: "", nav_coptic_bible: "", nav_name_coptic: "", nav_training: "",
    nav_favorites: "", nav_history: "", nav_download: "", nav_about: "",
    about_desktop_download: "",
    button_home_favorites: "", button_search_filter: "", button_search_keyboard: "", button_search_clear: "",
    button_training_listening: "", button_training_handwriting: "", button_training_grammar_quiz: "",
    button_training_word_scramble: "", button_training_matching: "", button_training_stats: "",
    button_bible_scope_all: "", button_bible_scope_old: "", button_bible_scope_new: "",
    button_bible_scope_deuterocanonical: "", button_bible_scope_book: "", button_bible_layout_stacked: "",
    button_bible_layout_table: "", button_bible_export_word: "", button_bible_export_pptx: "",
    button_bible_export_pdf: "", button_bible_export_excel: "", button_bible_verse_download: "",
    button_bible_verse_copy: "", button_lesson_summary: "", button_lesson_training: "",
    button_lesson_exam: "", button_lesson_glossary: "", button_lesson_download: "",
    button_final_exam: "", button_get_certificate: "", button_about_share: "",
    button_about_suggestion: "", button_about_website: "", button_about_whatsapp_channel: "",
  },
};
