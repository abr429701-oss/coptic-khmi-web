import React, { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  StatusBar,
  RefreshControl,
  Text,
  Platform,
  TouchableOpacity,
  Animated,
  BackHandler,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useOfflineDictionary } from "@/hooks/useOfflineDictionary";
import { useFavorites } from "@/hooks/useFavorites";
import type { DictionaryEntry } from "@/hooks/useDictionary";
import { Header } from "@/components/Header";
import { SearchRow } from "@/components/SearchRow";
import OfflineReadyBadge from "@/components/OfflineReadyBadge";
import { WordCard } from "@/components/WordCard";
import { WordDetailModal } from "@/components/WordDetailModal";
import { FilterSheet, FilterMode } from "@/components/FilterSheet";
import { SyncSheet } from "@/components/SyncSheet";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { DrawerMenu } from "@/components/DrawerMenu";
import { CopticKeyboard } from "@/components/CopticKeyboard";
import { HistoryScreen } from "@/components/HistoryScreen";
import { NameInCopticScreen } from "@/components/NameInCopticScreen";
import { TrainingScreen } from "@/components/TrainingScreen";
import { LearnCopticScreen } from "@/components/LearnCopticScreen";
import { CopticBibleScreen } from "@/components/CopticBibleScreen";
import { useLang, type Lang } from "@/contexts/LanguageContext";


import { useHistory } from "@/contexts/HistoryContext";
import { useSplash } from "@/contexts/SplashContext";
import AboutScreen from "./about";
import { logActivity, backupUserData, logSearch } from "@/hooks/useUserTracking";
import { useDailyWord } from "@/hooks/useDailyWord";
import { useAudioDownloadReminder } from "@/hooks/useAudioDownloadReminder";
import { useAppConfig } from "@/contexts/AppConfigContext";

// أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·ع¾ط·آ·ط·آ¨ط¸ظ¹ط·آ¹ ط·آ§ط¸â€‍ط¸â€ ط·آµط¸ث†ط·آµ أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/\s+/g, " ")
    .trim();
}

const ARABIC_DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u;

function hasArabicDiacritics(text: string): boolean {
  return ARABIC_DIACRITICS_RE.test(text);
}

function normalizeArabicWithDiacritics(text: string): string {
  return text.normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/\s+/g, " ")
    .trim();
}

function isCopticText(text: string): boolean {
  // Includes Coptic blocks and Combining Diacritical Marks (for Jenkim)
  return /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF\u0300-\u036F]/.test(text);
}

function normalizeCoptic(text: string): string {
  if (!text) return "";
  return text.normalize("NFKC").toLowerCase()
    // Match the reference bot: fold Unicode, remove Jenkim marks/backticks,
    // and collapse internal spacing before using a spelling as a word key.
    .replace(/[\u0300-\u036F\u2CBB\u2CBC\u25CC`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function isLatinText(text: string): boolean {
  return /^[a-zA-Z\u00C0-\u00FF\s]+$/.test(text.trim()) && text.trim().length > 0;
}

function detectLang(query: string, currentLang: Lang): Lang | null {
  if (isCopticText(query)) return null;
  if (isArabicText(query)) return "ar";
  if (!isLatinText(query)) return null;
  return currentLang === "en" || currentLang === "fr" || currentLang === "de" ? currentLang : "en";
}

// أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·آ§ط¸â€‍ط·آ¨ط·آ­ط·آ« ط·آ§ط¸â€‍ط·آ´ط·آ§ط¸â€¦ط¸â€‍ أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

function checkArabicMatch(value: string, qAr: string, mode: FilterMode, preserveDiacritics = false): boolean {
  if (!value) return false;
  const v = preserveDiacritics ? normalizeArabicWithDiacritics(value) : normalizeArabic(value);
  switch (mode) {
    case "contains": return v.includes(qAr);
    case "ends": return v.endsWith(qAr);
    case "exact": return v === qAr;
    case "all": return v.startsWith(qAr);
    default: return v.startsWith(qAr);
  }
}

type SearchKind = "coptic" | "arabic" | "latin";

interface CachedSearchText {
  coptic?: string;
  arabic?: string[];
  arabicWithDiacritics?: string[];
  latin?: string[];
}

interface FilterResult {
  results: DictionaryEntry[];
  // Candidates stay in the original dictionary order for safe prefix narrowing.
  candidates: DictionaryEntry[];
}

interface SearchPrefixIndex {
  arabic: Map<string, DictionaryEntry[]>;
  coptic: Map<string, DictionaryEntry[]>;
  latin: Map<string, DictionaryEntry[]>;
}

interface SearchPrefixDescriptor {
  kind: SearchKind;
  prefix: string;
}

const SEARCH_TEXT_CACHE = new WeakMap<DictionaryEntry, CachedSearchText>();
const COPTIC_FORM_CACHE = new WeakMap<DictionaryEntry, string[]>();
const MEANING_OPTIONS_CACHE = new WeakMap<DictionaryEntry, Map<Lang, string[]>>();
const LATIN_PARTS_CACHE = new WeakMap<DictionaryEntry, Map<Lang, string[]>>();

function getCachedSearchText(entry: DictionaryEntry, kind: SearchKind): CachedSearchText {
  const result: CachedSearchText = SEARCH_TEXT_CACHE.get(entry) ?? {};
  if (kind === "coptic" && result.coptic === undefined) {
    result.coptic = normalizeCoptic(entry.coptic);
  } else if (kind === "arabic") {
    const meanings = entry.arabicMeanings?.length ? entry.arabicMeanings : [entry.arabic || ""];
    if (result.arabic === undefined) result.arabic = meanings.map(normalizeArabic).filter(Boolean);
    if (result.arabicWithDiacritics === undefined) {
      result.arabicWithDiacritics = meanings.map(normalizeArabicWithDiacritics).filter(Boolean);
    }
  } else if (kind === "latin" && result.latin === undefined) {
    result.latin = [entry.english, entry.french, entry.german]
      .filter((value): value is string => !!value)
      .flatMap((value) => value.split(/[\u060C,;\u061B/\n]+/).map((part) => part.toLowerCase().trim()))
      .filter(Boolean);
  }
  SEARCH_TEXT_CACHE.set(entry, result);
  return result;
}

function getSearchPrefixDescriptor(query: string): SearchPrefixDescriptor | null {
  const trimmed = query.trim();
  const kind: SearchKind | null = isArabicText(trimmed)
    ? "arabic"
    : isCopticText(trimmed)
      ? "coptic"
      : isLatinText(trimmed)
        ? "latin"
        : null;
  if (!kind) return null;

  const normalized = kind === "arabic"
    ? normalizeArabic(trimmed)
    : kind === "coptic"
      ? normalizeCoptic(trimmed)
      : trimmed.toLowerCase();
  const characters = Array.from(normalized);
  if (!characters.length) return null;
  return { kind, prefix: characters.slice(0, 3).join("") };
}

function createSearchPrefixIndex(): SearchPrefixIndex {
  return { arabic: new Map(), coptic: new Map(), latin: new Map() };
}

function addSearchPrefixValue(
  target: Map<string, DictionaryEntry[]>,
  value: string,
  entry: DictionaryEntry,
  seenPrefixes: Set<string>,
) {
  const characters = Array.from(value);
  for (let length = 1; length <= Math.min(3, characters.length); length += 1) {
    const prefix = characters.slice(0, length).join("");
    if (seenPrefixes.has(prefix)) continue;
    seenPrefixes.add(prefix);
    const matches = target.get(prefix);
    if (matches) matches.push(entry);
    else target.set(prefix, [entry]);
  }
}

function addEntryToSearchPrefixIndex(index: SearchPrefixIndex, entry: DictionaryEntry) {
  const arabic = getCachedSearchText(entry, "arabic");
  const coptic = getCachedSearchText(entry, "coptic");
  const latin = getCachedSearchText(entry, "latin");

  const seenArabicPrefixes = new Set<string>();
  for (const value of arabic.arabic ?? []) {
    addSearchPrefixValue(index.arabic, value, entry, seenArabicPrefixes);
  }

  const seenCopticPrefixes = new Set<string>();
  for (const value of (coptic.coptic ?? "").split(/[\u060C,;\/\n]+/).map((part) => part.trim()).filter(Boolean)) {
    addSearchPrefixValue(index.coptic, value, entry, seenCopticPrefixes);
  }

  const seenLatinPrefixes = new Set<string>();
  for (const value of latin.latin ?? []) {
    addSearchPrefixValue(index.latin, value, entry, seenLatinPrefixes);
  }

}

function wordStartsWith(value: string, query: string, separator: RegExp): boolean {
  let wordStart = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index === value.length || separator.test(value.charAt(index))) {
      if (index > wordStart && value.startsWith(query, wordStart)) return true;
      wordStart = index + 1;
    }
  }
  return false;
}

function applyFilter(entries: DictionaryEntry[], query: string, mode: FilterMode): FilterResult {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], candidates: [] };

  const qLatin = trimmed.toLowerCase();
  const qArabic = normalizeArabic(trimmed);
  const queryHasArabicDiacritics = hasArabicDiacritics(trimmed);
  const qArabicForMatch = queryHasArabicDiacritics ? normalizeArabicWithDiacritics(trimmed) : qArabic;
  const qCoptic = normalizeCoptic(trimmed);
  const queryIsArabic = isArabicText(trimmed);
  const queryIsCoptic = isCopticText(trimmed);
  const queryIsLatin = isLatinText(trimmed);
  const kind: SearchKind | null = queryIsArabic ? "arabic" : queryIsCoptic ? "coptic" : queryIsLatin ? "latin" : null;
  if (!kind) return { results: [], candidates: [] };

  const preferred: DictionaryEntry[] = [];
  const remaining: DictionaryEntry[] = [];
  const candidates: DictionaryEntry[] = [];
  const exactMatches: DictionaryEntry[] = [];

  const matches = (value: string, q: string, coptic = false): boolean => {
    if (!value || !q) return false;
    switch (mode) {
      case "contains": return value.includes(q);
      case "ends": return value.endsWith(q);
      case "exact": return value === q;
      case "all": return coptic ? value.startsWith(q) : (queryIsArabic ? value.startsWith(q) : value.includes(q));
      default: return value.startsWith(q);
    }
  };
  const evaluateValues = (values: string[], q: string, coptic = false) => {
    let found = false;
    let exactFound = false;
    for (const value of values) {
      if (!value) continue;
      if (value === q) exactFound = true;
      if (matches(value, q, coptic)) found = true;
      if (found && exactFound) break;
    }
    return { found, exactFound };
  };

  for (const entry of entries) {
    const index = getCachedSearchText(entry, kind);
    let found = false;
    let startsWithWord = false;
    let exactFound = false;

    if (kind === "arabic") {
      const values = queryHasArabicDiacritics ? index.arabicWithDiacritics ?? [] : index.arabic ?? [];
      const evaluated = evaluateValues(values, qArabicForMatch);
      const unmarkedValues = queryHasArabicDiacritics
        ? values.filter((value) => !hasArabicDiacritics(value)).map(normalizeArabic)
        : [];
      const unmarkedEvaluated = queryHasArabicDiacritics
        ? evaluateValues(unmarkedValues, qArabic)
        : { found: false, exactFound: false };
      found = evaluated.found || unmarkedEvaluated.found;
      exactFound = evaluated.exactFound;
      if (mode === "all" && found) {
        startsWithWord = values.some((value) => value.startsWith(qArabicForMatch)) ||
          values.some((value) => wordStartsWith(value, qArabicForMatch, /[\s\u060C,]/)) ||
          unmarkedValues.some((value) => value.startsWith(qArabic)) ||
          unmarkedValues.some((value) => wordStartsWith(value, qArabic, /[\s\u060C,]/));
      }
    } else if (kind === "coptic") {
      const values = (index.coptic ?? "")
        .split(/[\u060C,;\/\n]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const evaluated = evaluateValues(values, qCoptic, true);
      found = evaluated.found;
      exactFound = evaluated.exactFound;
      if (mode === "all" && found) {
        startsWithWord = values.some((value) => value.startsWith(qCoptic) || wordStartsWith(value, qCoptic, /[\s.]/));
      }
    } else {
      const values = index.latin ?? [];
      const evaluated = evaluateValues(values, qLatin);
      found = evaluated.found;
      exactFound = evaluated.exactFound;
      if (mode === "all" && found) {
        startsWithWord = values.some((value) => value.startsWith(qLatin)) ||
          values.some((value) => wordStartsWith(value, qLatin, /[\s,\u060C;\/]/));
      }
    }

    if (found) {
      candidates.push(entry);
      if (exactFound) exactMatches.push(entry);
      (startsWithWord ? preferred : remaining).push(entry);
    }
  }

  // Exact results lead, but Arabic prefix extensions must remain visible too.
  const normalizedQuery = queryIsArabic ? qArabic : queryIsCoptic ? qCoptic : qLatin;
  const hasExactLookupLength = Array.from(normalizedQuery.replace(/\s+/gu, "")).length > 2;
  const hasExactPriority = hasExactLookupLength && (mode === "starts" || mode === "all") && exactMatches.length > 0;
  const orderedMatches = preferred.concat(remaining);
  if (kind === "arabic" && hasExactPriority) {
    const exactIds = new Set(exactMatches.map((entry) => entry.id));
    return { results: exactMatches.concat(orderedMatches.filter((entry) => !exactIds.has(entry.id))), candidates };
  }
  const exactPriority = kind === "coptic" && hasExactPriority;
  // Stable partition keeps preferred matches first without sorting the whole result set.
  return { results: exactPriority ? exactMatches : orderedMatches, candidates };
}

export function getMatchedMeaning(entry: DictionaryEntry, query: string, lang: Lang): string {
  if (!query.trim()) {
    let ext = "";
    if (lang === "en") ext = entry.english || entry.arabic || "";
    else if (lang === "fr") ext = entry.french || entry.arabic || "";
    else if (lang === "de") ext = entry.german || entry.arabic || "";
    else ext = entry.arabic || "";
    return ext.split(/[\u060C,;\n]/)[0].trim();
  }

  const q = query.trim().toLowerCase();
  const queryHasArabicDiacritics = hasArabicDiacritics(query);
  const qAr = queryHasArabicDiacritics ? normalizeArabicWithDiacritics(q) : normalizeArabic(q);

  if (isCopticText(query)) {
    let raw = "";
    if (lang === "en") raw = entry.english || entry.arabic || "";
    else if (lang === "fr") raw = entry.french || entry.arabic || "";
    else if (lang === "de") raw = entry.german || entry.arabic || "";
    else raw = entry.arabic || "";

    // ط·آ¥ط·آ±ط·آ¬ط·آ§ط·آ¹ ط·آ£ط¸ث†ط¸â€‍ ط¸â€¦ط·آ¹ط¸â€ ط¸â€° ط¸ظ¾ط¸â€ڑط·آ· (ط·آ£ط·آ­ط·آ§ط·آ¯ط¸ظ¹) ط·آ¹ط¸â€ ط·آ¯ ط·آ§ط¸â€‍ط·آ¨ط·آ­ط·آ« ط·آ¨ط·آ§ط¸â€‍ط¸â€ڑط·آ¨ط·آ·ط¸ظ¹
    return raw.split(/[\u060C,;\/\n]/)[0].trim();
  }

  if (entry.english && isLatinText(query)) {
    const enPhrases = entry.english.split(/[\u060C,;\/\n]+/).map(w => w.trim()).filter(Boolean);
    for (const phrase of enPhrases) {
      if (phrase.toLowerCase().startsWith(q)) return phrase;
    }
    for (const phrase of enPhrases) {
      if (phrase.toLowerCase().includes(q)) return phrase;
    }
    if (entry.english.toLowerCase().includes(q)) return entry.english;
  }

  if (entry.french && isLatinText(query)) {
    const frPhrases = entry.french.split(/[\u060C,;\/\n]+/).map(w => w.trim()).filter(Boolean);
    for (const phrase of frPhrases) {
      if (phrase.toLowerCase().startsWith(q)) return phrase;
    }
    for (const phrase of frPhrases) {
      if (phrase.toLowerCase().includes(q)) return phrase;
    }
    if (entry.french.toLowerCase().includes(q)) return entry.french;
  }

  if (entry.german && isLatinText(query)) {
    const dePhrases = entry.german.split(/[\u060C,;\/\n]+/).map(w => w.trim()).filter(Boolean);
    for (const phrase of dePhrases) {
      if (phrase.toLowerCase().startsWith(q)) return phrase;
    }
    for (const phrase of dePhrases) {
      if (phrase.toLowerCase().includes(q)) return phrase;
    }
    if (entry.german.toLowerCase().includes(q)) return entry.german;
  }

  const meanings = entry.arabicMeanings?.length ? entry.arabicMeanings : [entry.arabic || ""];

  for (const m of meanings) {
    const parts = m.split(/[\u060C,\u060C]+/).map(p => p.trim()).filter(Boolean);
    const exact = parts.find((part) => (queryHasArabicDiacritics ? normalizeArabicWithDiacritics(part) : normalizeArabic(part)) === qAr);
    if (exact) return exact;
  }

  for (const m of meanings) {
    const parts = m.split(/[\u060C,\u060C]+/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (checkArabicMatch(part, qAr, "starts", queryHasArabicDiacritics)) return part;
    }
  }

  for (const m of meanings) {
    const parts = m.split(/[\u060C,\u060C]+/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (checkArabicMatch(part, qAr, "contains", queryHasArabicDiacritics)) return part;
      const words = part.split(/\s+/).map(w => w.trim()).filter(Boolean);
      for (const w of words) {
        if (checkArabicMatch(w, qAr, "contains", queryHasArabicDiacritics)) return part;
      }
    }
  }

  if (lang === "en") return entry.english || entry.arabic || "";
  if (lang === "fr") return entry.french || entry.arabic || "";
  if (lang === "de") return entry.german || entry.arabic || "";
  return entry.arabic || "";
}

function getEntryMeaningOptions(entry: DictionaryEntry, lang: Lang): string[] {
  let byLang = MEANING_OPTIONS_CACHE.get(entry);
  const cached = byLang?.get(lang);
  if (cached) return cached;

  const raw = lang === "en" ? entry.english || entry.arabic || ""
    : lang === "fr" ? entry.french || entry.arabic || ""
    : lang === "de" ? entry.german || entry.arabic || ""
    : entry.arabic || "";
  // Match the dictionary/search parser: every supported separator becomes one navigable meaning.
  const options = raw.split(/[\u060C,;\u061B/\n]+/).map((meaning) => meaning.trim()).filter(Boolean);
  if (!byLang) {
    byLang = new Map<Lang, string[]>();
    MEANING_OPTIONS_CACHE.set(entry, byLang);
  }
  byLang.set(lang, options);
  return options;
}

function getCopticForms(entry: DictionaryEntry): string[] {
  const cached = COPTIC_FORM_CACHE.get(entry);
  if (cached) return cached;
  const forms = (entry.coptic || "")
    .split(/[\u060C,;\u061B/\n]+/)
    .map((form) => normalizeCoptic(form))
    .filter(Boolean);
  COPTIC_FORM_CACHE.set(entry, forms);
  return forms;
}

function detectSearchLanguage(entries: DictionaryEntry[], query: string, fallbackLang: Lang, mode: FilterMode): Lang {
  if (isCopticText(query)) return fallbackLang;
  if (isArabicText(query)) return "ar";
  const q = query.trim();
  const fields: Lang[] = ["fr", "de", "en"];
  for (const field of fields) {
    const found = entries.some((entry) => getLatinSearchParts(entry, field)
      .some((part) => matchesLatinMode(part, q, mode)));
    if (found) return field;
  }
  return fallbackLang === "fr" || fallbackLang === "de" || fallbackLang === "en" ? fallbackLang : "en";
}

function getLatinSearchParts(entry: DictionaryEntry, lang: Lang): string[] {
  let byLang = LATIN_PARTS_CACHE.get(entry);
  const cached = byLang?.get(lang);
  if (cached) return cached;

  const value = lang === "fr" ? entry.french : lang === "de" ? entry.german : entry.english;
  const parts = (value || "").split(/[\u060C,;\u061B/\n]+/).map((part) => part.trim()).filter(Boolean);
  if (!byLang) {
    byLang = new Map<Lang, string[]>();
    LATIN_PARTS_CACHE.set(entry, byLang);
  }
  byLang.set(lang, parts);
  return parts;
}

function matchesLatinMode(value: string, query: string, mode: FilterMode): boolean {
  const normalizedValue = value.normalize("NFKC").toLocaleLowerCase();
  const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase();
  if (mode === "exact") return normalizedValue === normalizedQuery;
  if (mode === "contains" || mode === "all") return normalizedValue.includes(normalizedQuery);
  if (mode === "ends") return normalizedValue.endsWith(normalizedQuery);
  return normalizedValue.startsWith(normalizedQuery);
}

function getSearchSuggestion(entry: DictionaryEntry, query: string, fallbackLang: Lang): { key: string; label: string; lang: Lang } {
  if (isCopticText(query)) {
    const forms = getCopticForms(entry);
    const normalizedQuery = normalizeCoptic(query);
    const label = forms.find((form) => form.includes(normalizedQuery)) || forms[0] || entry.coptic || "";
    return { key: `cop:${normalizeCoptic(label)}`, label, lang: fallbackLang };
  }

  if (isArabicText(query)) {
    const label = getMatchedMeaning(entry, query, "ar").trim();
    // One Arabic-search result per matched Arabic meaning; matching Coptic headwords and sibling senses are
    // collected into this result's alternate-meaning list below.
    return { key: `ar:${normalizeArabicWithDiacritics(label)}`, label, lang: "ar" };
  }

  const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase();
  // Resolve one translation column for the whole query, as the bot's script-kind detector does.
  const translatedParts = getLatinSearchParts(entry, fallbackLang);
  const matchedLabel = translatedParts.find((part) => part.normalize("NFKC").toLocaleLowerCase() === normalizedQuery)
    || translatedParts.find((part) => {
      const normalized = part.normalize("NFKC").toLocaleLowerCase();
      return normalized.startsWith(normalizedQuery) || normalized.includes(normalizedQuery);
    });
  if (matchedLabel) {
    return {
      key: `latin:${fallbackLang}:${matchedLabel.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()}`,
      label: matchedLabel,
      lang: fallbackLang,
    };
  }

  const label = getMatchedMeaning(entry, query, fallbackLang).trim();
  return {
    key: `latin:${fallbackLang}:${label.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()}`,
    label,
    lang: fallbackLang,
  };
}

function getMeaningGroupKey(entry: DictionaryEntry, query: string, lang: Lang): string {
  return getSearchSuggestion(entry, query, lang).key;
}

function normalizeSenseMeaning(meaning: string): string {
  return isArabicText(meaning)
    ? normalizeArabicWithDiacritics(meaning)
    : meaning.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function getSenseIdentity(entry: DictionaryEntry, meaning: string, query: string): string {
  const normalizedMeaning = normalizeSenseMeaning(meaning);
  if (isCopticText(query)) return `meaning:${normalizedMeaning}`;
  const lemma = getCopticForms(entry)[0] || normalizeCoptic(entry.coptic || entry.id);
  return `lemma:${lemma}|meaning:${normalizedMeaning}`;
}

function buildAlternateEntries(
  primaryEntry: DictionaryEntry,
  matchedEntries: DictionaryEntry[],
  entriesByLemma: Map<string, DictionaryEntry[]>,
  query: string,
  meaningLang: Lang,
): DictionaryEntry[] {
  const primaryMeaning = String((primaryEntry as any)._displayMeaning || getSearchSuggestion(primaryEntry, query, meaningLang).label);
  const seenMeanings = new Set<string>(primaryMeaning.trim() ? [getSenseIdentity(primaryEntry, primaryMeaning, query)] : []);
  const alternates: DictionaryEntry[] = [];

  if (isArabicText(query) || isLatinText(query)) {
    // In translated searches, only other headwords that directly matched this
    // translation belong to the result; unrelated sibling senses stay out.
    for (const matchedEntry of matchedEntries) {
      const matchedMeaning = isArabicText(query)
        ? getMatchedMeaning(matchedEntry, query, "ar").trim()
        : getSearchSuggestion(matchedEntry, query, meaningLang).label.trim();
      if (!matchedMeaning) continue;
      const rawHeadwords = (matchedEntry.coptic || "").split(/[\u060C,;\u061B/\n]+/).map((form) => form.trim()).filter(Boolean);
      const displayHeadwords = rawHeadwords.length ? rawHeadwords : [matchedEntry.coptic || matchedEntry.id];
      for (let headwordIndex = 0; headwordIndex < displayHeadwords.length; headwordIndex += 1) {
        const matchedHeadword = { ...matchedEntry, coptic: displayHeadwords[headwordIndex] } as DictionaryEntry;
        const key = getSenseIdentity(matchedHeadword, matchedMeaning, query);
        if (seenMeanings.has(key)) continue;
        seenMeanings.add(key);
        alternates.push({
          ...matchedHeadword,
          _query: query,
          _lang: isArabicText(matchedMeaning) ? "ar" : meaningLang,
          _displayMeaning: matchedMeaning,
        } as DictionaryEntry);
      }
    }
    return alternates;
  }

  // Coptic searches show the other distinct senses attached to the same headword.
  const seenRows = new Set<string>();
  for (const matchedEntry of matchedEntries) {
    const relatedRows = new Map<string, DictionaryEntry>();
    for (const lemma of getCopticForms(matchedEntry)) {
      for (const candidate of entriesByLemma.get(lemma) || []) relatedRows.set(candidate.id, candidate);
    }
    if (!relatedRows.size) relatedRows.set(matchedEntry.id, matchedEntry);

    for (const candidate of relatedRows.values()) {
      if (seenRows.has(candidate.id)) continue;
      seenRows.add(candidate.id);
      for (const meaning of getEntryMeaningOptions(candidate, meaningLang)) {
        const key = getSenseIdentity(candidate, meaning, query);
        if (!meaning.trim() || seenMeanings.has(key)) continue;
        seenMeanings.add(key);
        alternates.push({
          ...candidate,
          _query: query,
          _lang: isArabicText(meaning) ? "ar" : meaningLang,
          _displayMeaning: meaning,
        } as DictionaryEntry);
      }
    }
  }

  return alternates;
}

// أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·آ§ط¸â€‍ط¸â€ ط¸ث†ط·آ¹ ط·آ§ط¸â€‍ط·آ±ط·آ¦ط¸ظ¹ط·آ³ط¸ظ¹ ط¸â€‍ط¸â€‍ط·آ´ط·آ§ط·آ´ط·آ§ط·ع¾ أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

type Screen = "home" | "learn_coptic" | "name_coptic" | "training" | "favorites" | "download" | "about" | "history" | "coptic_bible";



// أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·آ§ط¸â€‍ط·آ´ط·آ§ط·آ´ط·آ© ط·آ§ط¸â€‍ط·آ±ط·آ¦ط¸ظ¹ط·آ³ط¸ظ¹ط·آ© أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬

export default function DictionaryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t, lang, setLang } = useLang();
  const { remoteSettings } = useAppConfig();
  const announcementLanguageKey: Record<Lang, keyof typeof remoteSettings.content> = {
    ar: "announcementTextAr", en: "announcementTextEn", fr: "announcementTextFr", de: "announcementTextDe",
  };
  const remoteAnnouncement = (remoteSettings.content[announcementLanguageKey[lang]] || remoteSettings.content.announcementText).trim();
  const announcementNow = Date.now();
  const announcementStart = Date.parse(remoteSettings.content.announcementStartsAt || "") || 0;
  const announcementEnd = Date.parse(remoteSettings.content.announcementEndsAt || "") || Number.MAX_SAFE_INTEGER;
  const showRemoteAnnouncement = remoteSettings.controls.home_announcement && remoteAnnouncement.length > 0 && announcementNow >= announcementStart && announcementNow <= announcementEnd;
  const bgColor = colors.background;

  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchValue = useDeferredValue(searchQuery);
  const deferredSearchQuery = searchQuery.trim().length === 0 ? "" : deferredSearchValue;
  const [filterMode, setFilterMode] = useState<FilterMode>("starts");
  const [filterVisible, setFilterVisible] = useState(false);
  const [syncVisible, setSyncVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState<Screen>("home");
  const [showCoptic, setShowCoptic] = useState(false);
  const openSyncFromAudioReminder = useCallback(() => setSyncVisible(true), []);



  useDailyWord(setSelectedEntry);
  const copticKeyCounter = useRef(0);
  const [lastCopticKey, setLastCopticKey] = useState<{ key: string; id: number } | null>(null);

  const keyboardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(keyboardAnim, {
      toValue: showCoptic ? 260 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [showCoptic]);

  useEffect(() => {
    const onBackPress = () => {
      // 1. If Coptic keyboard is open, close it
      if (showCoptic) {
        setShowCoptic(false);
        return true;
      }
      // 2. Training screen handles its own back navigation (choice أ¢â€ â€‌ sub-modes)
      if (activeScreen === "training") {
        return false; // Let TrainingScreen's handler run
      }
      // 3. If we are in any screen other than home, go back to home
      if (activeScreen !== "home") {
        setActiveScreen("home");
        return true;
      }
      // 4. Fallback to default behavior (exit app)
      return false;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => backHandler.remove();
  }, [showCoptic, activeScreen]);

  const { splashDone } = useSplash();
  const { favorites } = useFavorites();
  const { history, addToHistory } = useHistory();


  const {
    entries,
    isLoading,
    isSetupDone,
    isOfflineReady,
    isOnline,
    lastSync,
    downloadProgress,
    audioIndex,
    audioSizeBytes,
    audioSizeKnown,
    startDownload,
    cachePlayedAudio,
    sync,
    getAudioSource,
    refetchOnline,
    skipSetup,
  } = useOfflineDictionary();

  useEffect(() => {
    if (!isSetupDone && !isLoading) {
      skipSetup();
    }
  }, [isSetupDone, isLoading]);

  // أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·آ§ط¸â€‍ط·آ§ط·آ³ط·ع¾ط¸â€¦ط·آ§ط·آ¹ ط¸â€‍ط·آ­ط·آ¯ط·آ« ط·آ§ط¸â€‍ط·ع¾ط¸â€ ط¸â€ڑط¸â€‍ ط¸â€¦ط¸â€  ط·آ§ط¸â€‍ط·آ¥ط·آ´ط·آ¹ط·آ§ط·آ±ط·آ§ط·ع¾ أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬
  useEffect(() => {
    import('react-native').then(({ DeviceEventEmitter }) => {
      const sub = DeviceEventEmitter.addListener('navigate_to_learn', (data) => {
        setActiveScreen("learn_coptic");
        logActivity("screen_view", undefined, `Notification Navigation | Target: learn_coptic | Data: ${JSON.stringify(data)}`);
      });
      return () => sub.remove();
    });
  }, []);

  // أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·آ§ط¸â€‍ط¸â€ ط·آ³ط·آ® ط·آ§ط¸â€‍ط·آ§ط·آ­ط·ع¾ط¸ظ¹ط·آ§ط·آ·ط¸ظ¹ ط·آ§ط¸â€‍ط·ع¾ط¸â€‍ط¸â€ڑط·آ§ط·آ¦ط¸ظ¹ ط¸â€‍ط¸â€‍ط¸â€¦ط¸ظ¾ط·آ¶ط¸â€‍ط·آ© ط¸ث†ط·آ§ط¸â€‍ط·ع¾ط·آ§ط·آ±ط¸ظ¹ط·آ® أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬
  useEffect(() => {
    (async () => {
      const STORAGE_KEY = "@khmi/suggestions_list";
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      backupUserData(favorites, history, list);
    })();
  }, [favorites, history]);

  const handleQueryChange = useCallback((text: string) => {
    setSearchQuery(text);
    const detected = text.trim() ? detectLang(text, lang) : null;
    if (detected && detected !== lang) setLang(detected);
  }, [lang, setLang]);

  const handleCopticChar = useCallback((ch: string) => {
    if (activeScreen === "home") {
      setSearchQuery((prev) => {
        // RADICAL UI FIX: If we have a lone Jenkim (with space helper) and the next char is a Coptic letter, MERGE THEM
        const copticLetterRegex = /[\u2C80-\u2CFF\u03E2-\u03EF\u0370-\u03FF]/;
        if (prev.endsWith(" \u0300") && copticLetterRegex.test(ch)) {
          // Merge a standalone combining mark with the following Coptic letter.
          return prev.slice(0, -2) + ch + "\u0300";
        }

        // Give a standalone combining mark a visible base space in the search field.
        if (ch === "\u0300" && (prev.length === 0 || prev.endsWith(" "))) {
          return prev + " \u0300";
        }
        return prev + ch;
      });
    } else {
      // Use a unique event-id so pressing the same key twice always triggers the effect
      setLastCopticKey({ key: ch, id: ++copticKeyCounter.current });
    }
  }, [activeScreen]);

  const handleCopticBackspace = useCallback(() => {
    if (activeScreen === "home") {
      setSearchQuery((prev) => { const arr = [...prev]; arr.pop(); return arr.join(""); });
    } else {
      setLastCopticKey({ key: "\u232B", id: ++copticKeyCounter.current });
    }
  }, [activeScreen]);

  const handleToggleCoptic = useCallback((val?: boolean) => {
    setShowCoptic((v) => typeof val === 'boolean' ? val : !v);
  }, []);

  // أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬ ط·آ§ط¸â€‍ط·ع¾ط¸â€ ط¸â€ڑط¸â€‍ ط·آ¨ط¸ظ¹ط¸â€  ط·آ§ط¸â€‍ط·آ´ط·آ§ط·آ´ط·آ§ط·ع¾ أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬أ¢â€‌â‚¬
  const handleNavigate = useCallback((screen: Screen) => {
    if (screen === "download") {
      setSyncVisible(true);
    } else if (screen === "favorites") {


      setShowOnlyFavorites(true);
      setActiveScreen("favorites");
      logActivity("screen_view", undefined, "favorites");
    } else {
      if (screen === "home") setShowOnlyFavorites(false);
      setActiveScreen(screen);
      logActivity("screen_view", undefined, screen);
    }
  }, []);

  useEffect(() => {
    if (activeScreen !== "home" && activeScreen !== "favorites") {
      setShowCoptic(false);
    }
  }, [activeScreen]);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((favorite: any) => typeof favorite === "string" ? favorite : favorite?.id).filter(Boolean)),
    [favorites]
  );

  const searchCacheRef = useRef<{
    entries: DictionaryEntry[];
    query: string;
    mode: FilterMode;
    candidates: DictionaryEntry[];
    results: DictionaryEntry[];
  } | null>(null);

  const searchPrefixIndexRef = useRef<{ entries: DictionaryEntry[]; index: SearchPrefixIndex } | null>(null);
  const [searchPrefixIndexRevision, setSearchPrefixIndexRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let cursor = 0;
    let frameHandle: number | null = null;
    let timerHandle: ReturnType<typeof setTimeout> | null = null;
    const index = createSearchPrefixIndex();

    const buildBatch = () => {
      if (cancelled) return;
      const startedAt = Date.now();
      let processed = 0;
      while (cursor < entries.length && processed < 512 && Date.now() - startedAt < 8) {
        addEntryToSearchPrefixIndex(index, entries[cursor]);
        cursor += 1;
        processed += 1;
      }

      if (cursor < entries.length) {
        if (typeof requestAnimationFrame === "function") {
          frameHandle = requestAnimationFrame(buildBatch);
        } else {
          timerHandle = setTimeout(buildBatch, 0);
        }
        return;
      }

      searchPrefixIndexRef.current = { entries, index };
      setSearchPrefixIndexRevision((revision) => revision + 1);
    };

    if (entries.length === 0) {
      searchPrefixIndexRef.current = { entries, index };
      setSearchPrefixIndexRevision((revision) => revision + 1);
    } else if (typeof requestAnimationFrame === "function") {
      frameHandle = requestAnimationFrame(buildBatch);
    } else {
      timerHandle = setTimeout(buildBatch, 0);
    }

    return () => {
      cancelled = true;
      if (frameHandle !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameHandle);
      if (timerHandle !== null) clearTimeout(timerHandle);
    };
  }, [entries]);

  const entriesByLemmaCacheRef = useRef<{
    entries: DictionaryEntry[];
    index: Map<string, DictionaryEntry[]>;
  } | null>(null);
  const getEntriesByLemma = useCallback(() => {
    const cached = entriesByLemmaCacheRef.current;
    if (cached?.entries === entries) return cached.index;

    const index = new Map<string, DictionaryEntry[]>();
    for (const entry of entries) {
      for (const lemma of new Set(getCopticForms(entry))) {
        const group = index.get(lemma);
        if (group) group.push(entry);
        else index.set(lemma, [entry]);
      }
    }
    entriesByLemmaCacheRef.current = { entries, index };
    return index;
  }, [entries]);

  const hasSearchQuery = deferredSearchQuery.trim().length > 0;

  const filteredEntries = useMemo(() => {
    const query = deferredSearchQuery.trim();
    const minimumLength = Math.max(1, Math.min(5, Number(remoteSettings.content.dictionaryMinSearchLength) || 1));
    if (!query || Array.from(query).length < minimumLength) return showOnlyFavorites && !query ? entries.filter((entry) => favoriteIds.has(entry.id)) : [];

    const previous = searchCacheRef.current;
    let results: DictionaryEntry[];
    if (previous && previous.entries === entries && previous.mode === filterMode && previous.query === query) {
      results = previous.results;
    } else {
      const candidateSource = previous && previous.entries === entries && previous.mode === filterMode &&
        previous.query.length > 0 && query.startsWith(previous.query)
        ? previous.candidates
        : filterMode === "starts" && searchPrefixIndexRef.current?.entries === entries
          ? searchPrefixIndexRef.current.index[getSearchPrefixDescriptor(query)?.kind ?? "arabic"]
              .get(getSearchPrefixDescriptor(query)?.prefix ?? "") ?? entries
          : entries;
      const searchResult = applyFilter(candidateSource, query, filterMode);
      searchCacheRef.current = {
        entries,
        query,
        mode: filterMode,
        candidates: searchResult.candidates,
        results: searchResult.results,
      };
      results = searchResult.results;
    }

    const suggestionLang = detectSearchLanguage(results, query, lang, filterMode);
    let languageResults = isLatinText(query)
      ? results.filter((entry) => getLatinSearchParts(entry, suggestionLang)
        .some((part) => matchesLatinMode(part, query.trim(), filterMode)))
      : results;
    const normalizedLatinQuery = query.trim().normalize("NFKC").toLocaleLowerCase();
    const latinExactLength = Array.from(normalizedLatinQuery.replace(/\s+/gu, "")).length > 2;
    if (isLatinText(query) && latinExactLength && (filterMode === "starts" || filterMode === "all")) {
      const exactLanguageResults = languageResults.filter((entry) => getLatinSearchParts(entry, suggestionLang)
        .some((part) => part.normalize("NFKC").toLocaleLowerCase() === normalizedLatinQuery));
      if (exactLanguageResults.length) languageResults = exactLanguageResults;
    }
    const visibleResults = showOnlyFavorites ? languageResults.filter((entry) => favoriteIds.has(entry.id)) : languageResults;
    // Keep only rows from the detected search language before grouping, matching the bot's exact-chain source.
    const groups = new Map<string, DictionaryEntry[]>();
    for (const entry of visibleResults) {
      const key = getMeaningGroupKey(entry, query, suggestionLang);
      const group = groups.get(key);
      if (group) group.push(entry);
      else groups.set(key, [entry]);
    }

    const groupedResults = Array.from(groups.values(), (group) => {
      const [first] = group;
      const suggestion = getSearchSuggestion(first, query, suggestionLang);
      const meaningLang = suggestion.lang;
      const primaryMeaning = isCopticText(query)
        ? getEntryMeaningOptions(first, meaningLang)[0] || getMatchedMeaning(first, query, meaningLang)
        : suggestion.label;
      let directSearchMeaningCount: number;
      if (isArabicText(query) || isLatinText(query)) {
        // Mirror the modal's identity rule without constructing its alternate-entry objects.
        const navigableSenses = new Set<string>([
          getSenseIdentity(first, primaryMeaning, query),
        ]);
        for (const matchedEntry of group) {
          const matchedMeaning = isArabicText(query)
            ? getMatchedMeaning(matchedEntry, query, "ar").trim()
            : getSearchSuggestion(matchedEntry, query, meaningLang).label.trim();
          if (!matchedMeaning) continue;
          for (const headword of getCopticForms(matchedEntry)) {
            navigableSenses.add(getSenseIdentity({ ...matchedEntry, coptic: headword } as DictionaryEntry, matchedMeaning, query));
          }
        }
        directSearchMeaningCount = navigableSenses.size || 1;
      } else {
        const uniqueMeanings = new Set<string>();
        for (const matchedEntry of group) {
          for (const meaning of getEntryMeaningOptions(matchedEntry, meaningLang)) {
            const meaningKey = normalizeSenseMeaning(meaning);
            if (meaningKey) uniqueMeanings.add(meaningKey);
          }
        }
        uniqueMeanings.add(normalizeSenseMeaning(primaryMeaning));
        directSearchMeaningCount = uniqueMeanings.size || 1;
      }

      return {
        ...first,
        _lang: isArabicText(primaryMeaning) ? "ar" : meaningLang,
        _displayMeaning: primaryMeaning,
        _alternateEntries: [],
        _matchedEntries: group,
        _meaningLang: meaningLang,
        _meaningCount: directSearchMeaningCount ?? 1,
      } as DictionaryEntry;
    });

    // Remote admin controls for result ordering and safety cap.
    const sortMode = remoteSettings.content.dictionarySortMode;
    if (sortMode === "coptic") groupedResults.sort((a, b) => String(a.coptic || "").localeCompare(String(b.coptic || "")));
    else if (sortMode === "meaning") groupedResults.sort((a: any, b: any) => String(a._displayMeaning || "").localeCompare(String(b._displayMeaning || "")));
    else if (sortMode === "audio") groupedResults.sort((a, b) => Number(Boolean(b.audioUrl)) - Number(Boolean(a.audioUrl)));
    const maximumResults = Math.max(1, Math.min(10000, Number(remoteSettings.content.dictionaryMaxResults) || 5000));
    return groupedResults.slice(0, maximumResults);
  }, [hasSearchQuery, deferredSearchQuery, filterMode, showOnlyFavorites, entries, favoriteIds, lang, searchPrefixIndexRevision, remoteSettings.content.dictionaryMaxResults, remoteSettings.content.dictionaryMinSearchLength, remoteSettings.content.dictionarySortMode]);

  // ط·آ³ط·آ¬ط¸â€‍ ط·آ§ط¸â€‍ط·آ¨ط·آ­ط·آ« ط·آ¨ط·آ¹ط·آ¯ ط·ع¾ط¸ث†ط¸â€ڑط¸ظ¾ ط·آ§ط¸â€‍ط¸ئ’ط·ع¾ط·آ§ط·آ¨ط·آ©\u061B ط¸â€‍ط·آ§ ط·ع¾ط·آ³ط·آ¬ط¸â€‍ ط¸â€ ط·ع¾ط¸ظ¹ط·آ¬ط·آ© ط·ع¾ط·آ®ط·آµ ط·آ§ط·آ³ط·ع¾ط·آ¹ط¸â€‍ط·آ§ط¸â€¦ط¸â€¹ط·آ§ ط·آ³ط·آ§ط·ع¾ط·آ¨ط·آ§.
  useEffect(() => {
    if (deferredSearchQuery.trim().length <= 1) return;
    const query = deferredSearchQuery.trim();
    const resultCount = filteredEntries.length;
    const timeout = setTimeout(() => {
      logActivity("search_query", undefined, query, resultCount);
      logSearch(query, resultCount);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [deferredSearchQuery, filteredEntries.length]);

  const getDisplayMeaning = useCallback((entry: DictionaryEntry) => {
    return getMatchedMeaning(entry, (entry as any)._query || deferredSearchQuery, lang);
  }, [deferredSearchQuery, lang]);

  const handleWordPress = useCallback((entry: any) => {
    const q = entry._query || deferredSearchQuery;
    const l = entry._lang || lang;
    const m = entry._displayMeaning || getMatchedMeaning(entry, q, l);

    // Ensure effective language respects the actual language of the displayed meaning
    const effectiveLang = (m && isArabicText(m) && l !== "ar") ? "ar" : l;

    const matchedEntries = (entry as any)._matchedEntries as DictionaryEntry[] | undefined;
    const meaningLang = ((entry as any)._meaningLang || l) as Lang;
    const entriesByLemma = isCopticText(q) ? getEntriesByLemma() : new Map<string, DictionaryEntry[]>();
    const alternateEntries = matchedEntries
      ? buildAlternateEntries(entry, matchedEntries, entriesByLemma, q, meaningLang)
      : ((entry as any)._alternateEntries || []);
    const selected = {
      ...entry,
      _query: q,
      _lang: effectiveLang,
      _displayMeaning: m,
      _alternateEntries: alternateEntries,
    };

    addToHistory(selected);
    setSelectedEntry(selected);
    logActivity("open", entry);
  }, [addToHistory, deferredSearchQuery, lang, getEntriesByLemma]);

  const renderItem = useCallback(
    ({ item, index }: { item: DictionaryEntry; index: number }) => {
      let currentQuery = deferredSearchQuery;
      let currentLang = lang;

      if (showOnlyFavorites) {
        const fav = favorites.find(f => (typeof f === 'string' ? f : f.id) === item.id) as any;
        if (fav && typeof fav === 'object') {
          if (fav.query) currentQuery = fav.query;
          if (fav.lang) currentLang = fav.lang;
        }
      }

      const m = (item as any)._displayMeaning || getMatchedMeaning(item, currentQuery, currentLang);
      const effectiveLang = (item as any)._lang || ((m && isArabicText(m) && currentLang !== "ar") ? "ar" : currentLang);

      const alternateEntries = (item as any)._alternateEntries || [];
      const decorated = {
        ...item,
        _query: currentQuery,
        _lang: effectiveLang,
        _displayMeaning: m,
        _alternateEntries: alternateEntries,
      };

      return (
        <WordCard
          entry={decorated}
          index={index}
          query={currentQuery}
          displayMeaning={decorated._displayMeaning}
          forceLang={effectiveLang}
          compactResult={!!currentQuery.trim()}
          showMeaningCount={hasSearchQuery && !showOnlyFavorites && remoteSettings.controls.dictionary_meaning_count}
          meaningCount={(item as any)._meaningCount}
          showAudio={remoteSettings.controls.dictionary_result_audio}
          showSecondaryMeaning={remoteSettings.controls.dictionary_secondary_meaning}
          showMetadata={remoteSettings.controls.dictionary_word_metadata}
          showResultIndex={remoteSettings.controls.dictionary_result_index}
          audioDownloaded={audioIndex.has(item.audioId || item.id) || audioIndex.has(item.id)}
          cachePlayedAudio={cachePlayedAudio}
          onPress={() => handleWordPress(decorated)}
        />
      );
    },
    [deferredSearchQuery, handleWordPress, lang, favorites, showOnlyFavorites, audioIndex, cachePlayedAudio, entries, remoteSettings.controls]
  );

  const keyExtractor = useCallback((item: DictionaryEntry) => item.id, []);
  const bottomPad = showCoptic ? 320 : (Platform.OS === "web" ? 40 : 24);
  const audioIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (entry.audioUrl) ids.add(entry.audioId || entry.id);
    }
    return ids;
  }, [entries]);
  const audioDownloadedCount = useMemo(
    () => [...audioIds].filter((id) => audioIndex.has(id)).length,
    [audioIds, audioIndex]
  );
  const audioTotalCount = audioIds.size;
  useAudioDownloadReminder({
    audioDownloadedCount,
    audioTotalCount,
    enabled: splashDone && !isLoading,
    onOpenSync: openSyncFromAudioReminder,
  });
  const isAboutPage = activeScreen === "about";
  const isMainView = activeScreen === "home" || activeScreen === "favorites" || activeScreen === "training";

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      <StatusBar barStyle="light-content" backgroundColor={remoteSettings.content.brandColor || "#8B0000"} />

      <View>
        <Header
          onMenuPress={() => {
            Keyboard.dismiss();
            setShowCoptic(false);
            setDrawerOpen(true);
          }}
          onSyncPress={() => setSyncVisible(true)}
          isOfflineReady={isOfflineReady}
          isAbout={isAboutPage}
          compact={activeScreen !== "home"}
          showDateBar={remoteSettings.controls.home_coptic_date_bar}
        />
      </View>

      {activeScreen === "about" ? (
        <AboutScreen compactHeader />
      ) : activeScreen === "history" ? (
        <HistoryScreen onWordPress={handleWordPress} />
      ) : activeScreen === "name_coptic" ? (
        <NameInCopticScreen />
      ) : activeScreen === "learn_coptic" ? (
        <LearnCopticScreen />
      ) : activeScreen === "coptic_bible" ? (
        <CopticBibleScreen />
      ) : activeScreen === "training" ? (
        <TrainingScreen
          entries={entries}
          audioIndex={audioIndex}
          onToggleCoptic={handleToggleCoptic}
          showCoptic={showCoptic}
          copticKeyEvent={lastCopticKey}
          getAudioSource={getAudioSource}
          cachePlayedAudio={cachePlayedAudio}
        />
      ) : (
        <>
          {activeScreen === "home" && showRemoteAnnouncement && (
            <View style={[styles.remoteAnnouncement, { borderColor: remoteSettings.content.brandColor }]}>
              <Feather name="bell" size={16} color={remoteSettings.content.brandColor} />
              <Text style={styles.remoteAnnouncementText}>{remoteAnnouncement}</Text>
            </View>
          )}
          <SearchRow
            value={searchQuery}
            onChangeText={handleQueryChange}
            onClear={() => {
              setSearchQuery("");
              setShowCoptic(false);
            }}
            onFilterPress={() => setFilterVisible(true)}
            showCoptic={showCoptic}
            onToggleCoptic={handleToggleCoptic}
            showFilterButton={remoteSettings.controls.dictionary_filter_button}
            showCopticKeyboard={remoteSettings.controls.dictionary_coptic_keyboard}
            showClearButton={remoteSettings.controls.dictionary_clear_query}
            showSearchLogo={remoteSettings.controls.dictionary_search_logo}
          />
          {Platform.OS === "web" && <OfflineReadyBadge />}

          <Animated.View style={{ flex: 1, marginBottom: keyboardAnim, paddingBottom: insets.bottom }}>
            <View style={[styles.listContainer, { backgroundColor: bgColor }]}>
              {!isLoading && (
                <View style={styles.statsRow}>
                  {remoteSettings.controls.home_favorites_shortcut && favorites.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        const next = !showOnlyFavorites;
                        setShowOnlyFavorites(next);
                        setActiveScreen(next ? "favorites" : "home");
                      }}
                      style={[
                        styles.favBtn,
                        { backgroundColor: showOnlyFavorites ? "#8B0000" : "rgba(139,0,0,0.1)" },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name="star"
                        size={18}
                        color={showOnlyFavorites ? "#F5A623" : "#8B0000"}
                      />
                      <Text style={[styles.favBtnText, { color: showOnlyFavorites ? "#fff" : "#8B0000" }]}>
                        {remoteSettings.labels.button_home_favorites.trim() || t.menu.favorites} ({favorites.length})
                      </Text>
                    </TouchableOpacity>
                  )}
                  {remoteSettings.controls.dictionary_result_counter && <Text style={styles.statsText}>{showOnlyFavorites ? t.favoritesCount(filteredEntries.length) : deferredSearchQuery ? t.wordCount(filteredEntries.length) : ""}</Text>}
                  {remoteSettings.controls.home_connection_status && isOfflineReady && (
                    <View style={[styles.statsDot, { backgroundColor: "#4CAF50" }]} />
                  )}
                </View>
              )}

              {isLoading ? (
                <LoadingSkeleton />
              ) : filteredEntries.length === 0 ? (
                <EmptyState
                  type={
                    !deferredSearchQuery.trim() && !showOnlyFavorites
                      ? "start-search"
                      : "no-results"
                  }
                  searchQuery={deferredSearchQuery}
                />
              ) : (
                <FlatList
                  data={filteredEntries}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    <RefreshControl
                      refreshing={false}
                      onRefresh={refetchOnline}
                      tintColor="#8B0000"
                      colors={["#8B0000"]}
                    />
                  }
                  initialNumToRender={15}
                  maxToRenderPerBatch={20}
                  windowSize={10}
                  onEndReached={() => {
                    if (filteredEntries.length > 5) {
                      logActivity("list_end_reached", undefined, deferredSearchQuery || "favorites");
                    }
                  }}
                  onEndReachedThreshold={0.3}
                />
              )}
            </View>
          </Animated.View>
        </>
      )}

      <CopticKeyboard
        visible={showCoptic && isMainView}
        onChar={handleCopticChar}
        onBackspace={handleCopticBackspace}
        onClose={() => setShowCoptic(false)}
      />

      <DrawerMenu

        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={handleNavigate}
        activeScreen={activeScreen}
        favoritesCount={favorites.length}
        historyCount={history.length}
      />

      <WordDetailModal
        entry={selectedEntry}
        alternateEntries={(selectedEntry as any)?._alternateEntries || []}
        searchTerm={deferredSearchQuery}
        displayMeaning={selectedEntry ? getDisplayMeaning(selectedEntry) : undefined}
        onClose={() => setSelectedEntry(null)}
        getAudioSource={getAudioSource}
        cachePlayedAudio={cachePlayedAudio}
      />

      <FilterSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        mode={filterMode}
        onModeChange={setFilterMode}
      />

      <SyncSheet
        visible={syncVisible}
        onClose={() => setSyncVisible(false)}
        lastSync={lastSync}
        entryCount={entries.length}
        audioCount={audioDownloadedCount}
        audioTotalCount={audioTotalCount}
        audioSizeKnown={audioSizeKnown}
        audioSizeBytes={audioSizeBytes}
        downloadProgress={downloadProgress}
        onSync={sync}
        onDownloadAll={() => startDownload({ audioOnly: false })}
      />


    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F5F5" },
  listContainer: { flex: 1, backgroundColor: "#F5F5F5", overflow: "hidden" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  favBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#8B0000",
  },
  favBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  statsText: {
    color: "#888888",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  statsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  searchingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  searchingText: { color: "#888888", fontSize: 13, fontFamily: "Inter_400Regular" },
  list: { paddingTop: 4 },
  netBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
    gap: 6,
    flexWrap: "wrap",
  },
  netDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  netText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  netSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  remoteAnnouncement: { marginHorizontal: 16, marginTop: 5, marginBottom: 7, minHeight: 42, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, backgroundColor: "rgba(200,169,81,0.08)", flexDirection: "row", alignItems: "center", gap: 9 },
  remoteAnnouncementText: { flex: 1, color: "#E2E8F0", fontSize: 13, textAlign: "right", fontFamily: "Cairo_600SemiBold" },
});


