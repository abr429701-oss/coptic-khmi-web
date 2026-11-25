import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Image,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
  useWindowDimensions,
  Share,
  Platform,
  TextInput,
  ScrollView,
  Alert,
  BackHandler,
  Animated,
  Modal,
} from 'react-native';
import ReAnimated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAppConfig } from "@/contexts/AppConfigContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { Asset } from "expo-asset";
// Import SQLite utilities
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';
import * as Print from 'expo-print';
import { File, Paths } from "expo-file-system";
import { cacheDirectory, moveAsync, readAsStringAsync, writeAsStringAsync, EncodingType } from "expo-file-system/legacy";
import pptxgen from "pptxgenjs";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun } from "docx";
import qrcode from "qrcode-generator";
import { strToU8, zipSync } from "fflate";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { getChapterCount, searchVersesFTS, getMultiLangVerses, normalizeText as dbNormalize } from "@/utils/bibleDB";
import { getRemoteBibleBooks, type RemoteBibleBook } from "@/lib/bibleRemote";
import { CustomKeyboard, type KeyboardLang } from './CustomKeyboard';

const ALL_BIBLE_LANGS = ['ar', 'en', 'gr', 'he', 'cb', 'sy'];
const OLD_TESTAMENT_AVAILABLE = true;
const DEUTEROCANON_AVAILABLE = false;
const COPTIC_APP_NAME = "ⲭⲏⲙⲓ";
const EXPORT_LOGO_ASSET = require("../assets/images/logo22.png");

const { width } = Dimensions.get('window');

const LANG_COLORS: Record<string, string> = {
  ar: '#8B0000', // Deep Maroon (Arabic)
  cb: '#B8860B', // Dark Gold (Coptic)
  en: '#2E4053', // Slate Blue (English)
  gr: '#0E6655', // Deep Teal (Greek)
  he: '#6C3483', // Deep Purple (Hebrew)
  sy: '#21618C', // Steel Blue (Syriac)
  fr: '#935116', // Bronze (French)
  de: '#145A32', // Forest Green (German)
};

const isCopticBaseLetter = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? 0;
  return (codePoint >= 0x2C80 && codePoint <= 0x2CE4) || (codePoint >= 0x03E2 && codePoint <= 0x03EF);
};

const stripCopticVerseNumberPrefix = (text: string): string => {
  const value = String(text || '');
  const match = value.match(/^\s*\(([^)]{1,24})\)\s*/u);
  if (!match) return value;
  const token = Array.from(match[1]);
  const hasCopticLetter = token.some(isCopticBaseLetter);
  return hasCopticLetter && !/\s/u.test(match[1]) ? value.slice(match[0].length) : value;
};

// ava_arsany visually places U+0300 one glyph to the right; move it back one code point for display.
const shiftCopticJinkimBack = (text: string): string => {
  const characters = Array.from(text || '');
  for (let index = 1; index < characters.length; index++) {
    if (characters[index] === '\u0300' && isCopticBaseLetter(characters[index - 1])) {
      [characters[index - 1], characters[index]] = [characters[index], characters[index - 1]];
    }
  }
  return characters.join('');
};

const toCS = (text: string): string => {
  if (!text) return "";
  return shiftCopticJinkimBack(stripCopticVerseNumberPrefix(text));
};

const escapeXmlText = (value: unknown): string => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&apos;");

const escapeHtmlText = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

const excelColumnName = (column: number): string => {
  let name = "";
  while (column > 0) {
    const remainder = (column - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    column = Math.floor((column - 1) / 26);
  }
  return name;
};

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const base64ToBytes = (base64: string): Uint8Array => {
  const normalized = base64.replace(/\s/g, "").replace(/=+$/, "");
  if (normalized.length % 4 === 1) throw new Error("Invalid Base64 data for Excel logo");

  const bytes = new Uint8Array(Math.floor((normalized.length * 6) / 8));
  let buffer = 0;
  let bitsInBuffer = 0;
  let outputIndex = 0;
  for (const character of normalized) {
    const value = BASE64_ALPHABET.indexOf(character);
    if (value < 0) throw new Error("Invalid Base64 character in Excel logo data");
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes[outputIndex++] = (buffer >> bitsInBuffer) & 0xff;
      buffer &= (1 << bitsInBuffer) - 1;
    }
  }
  return bytes;
};
const waitForPosterRender = async (): Promise<void> => {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 40))));
};

const isBibleVerseRtl = (language: string): boolean => ['ar', 'he', 'sy'].includes(language);
const getBibleVerseAlignment = (language: string): 'left' | 'right' => language === 'ar' ? 'left' : 'right';
const getBibleVerseWritingDirection = (language: string): 'ltr' | 'rtl' => isBibleVerseRtl(language) ? 'rtl' : 'ltr';
const getExportVerseText = (text: string, language: string): string => {
  const value = String(text ?? '');
  return isBibleVerseRtl(language) ? '\u2067' + value + '\u2069' : value;
};

let exportLogoBase64Cache: string | null = null;
const getExportLogoBase64 = async (): Promise<string> => {
  if (exportLogoBase64Cache) return exportLogoBase64Cache;
  const asset = await Asset.fromModule(EXPORT_LOGO_ASSET).downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error('Export logo asset could not be resolved');
  exportLogoBase64Cache = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return exportLogoBase64Cache;
};

function createBibleXlsx(
  appName: string,
  bookTitle: string,
  chapter: number,
  verses: any[],
  languages: string[],
  languageLabels: Record<string, string>,
  appLanguage: string,
  logoBase64: string,
): Uint8Array {
  const bookHeader = appLanguage === "ar" ? "السفر" : appLanguage === "fr" ? "Livre" : appLanguage === "de" ? "Buch" : "Book";
  const chapterHeader = appLanguage === "ar" ? "الأصحاح" : appLanguage === "fr" ? "Chapitre" : appLanguage === "de" ? "Kapitel" : "Chapter";
  const verseHeader = appLanguage === "ar" ? "الآية" : appLanguage === "fr" ? "Verset" : appLanguage === "de" ? "Vers" : "Verse";
  const headers = [bookHeader, chapterHeader, verseHeader, ...languages.map(lk => languageLabels[lk] || lk.toUpperCase())];
  const titleImageBytes = logoBase64 ? base64ToBytes(logoBase64) : undefined;
  const titleImageWidthPx = 48;
  const titleImageHeightPx = 48;
  const rows: (string | number)[][] = [
    [titleImageBytes ? "" : appName],
    [`${bookTitle} — ${chapterHeader} ${chapter}`],
    headers,
    ...verses.map(verse => [bookTitle, chapter, Number(verse.num), ...languages.map(lk => String(verse[lk] ?? ""))]),
  ];
  const lastColumn = excelColumnName(headers.length);
  const lastRow = rows.length;
  const columnWidthsPx = headers.map((_, index) => Math.floor((index === 0 ? 28 : index === 1 ? 12 : index === 2 ? 10 : 44) * 7 + 5));
  const totalColumnsPx = columnWidthsPx.reduce((sum, value) => sum + value, 0);
  let titleAnchorColumn = 0;
  let titleAnchorOffsetPx = Math.max(0, Math.floor((totalColumnsPx - titleImageWidthPx) / 2));
  while (titleAnchorColumn < columnWidthsPx.length - 1 && titleAnchorOffsetPx >= columnWidthsPx[titleAnchorColumn]) {
    titleAnchorOffsetPx -= columnWidthsPx[titleAnchorColumn];
    titleAnchorColumn += 1;
  }
  const titleImageCx = titleImageWidthPx * 9525;
  const titleImageCy = titleImageHeightPx * 9525;
  const titleImageRowOffset = Math.round(((52 * 96 / 72 - titleImageHeightPx) / 2) * 9525);

  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${excelColumnName(columnIndex + 1)}${rowIndex + 1}`;
      const isDataRow = rowIndex >= 3;
      let styleId = rowIndex === 2 ? 5 : rowIndex < 3 ? 1 : 0;
      if (isDataRow) {
        if (columnIndex === 1 || columnIndex === 2) styleId = 4;
        else if (columnIndex === 0 && appLanguage === "ar") styleId = 7;
        else if (columnIndex >= 3) {
          const language = languages[columnIndex - 3];
          styleId = language === "ar" ? 6 : language === "cb" ? 3 : isBibleVerseRtl(language) ? 7 : 2;
        }
      }

      if (isDataRow && (columnIndex === 1 || columnIndex === 2) && typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${reference}" s="${styleId}"><v>${value}</v></c>`;
      }
      return `<c r="${reference}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXmlText(value)}</t></is></c>`;
    }).join("");
    const rowHeight = rowIndex < 3 ? ` ht="${rowIndex === 0 ? (titleImageBytes ? 52 : 28) : rowIndex === 2 ? 28 : 24}" customHeight="1"` : "";
    return `<row r="${rowIndex + 1}"${rowHeight}>${cells}</row>`;
  }).join("");

  const columnWidths = headers.map((_, index) => {
    const width = index === 0 ? 28 : index === 1 ? 12 : index === 2 ? 10 : 44;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");

  const imageContentTypes = titleImageBytes ? `<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : "";
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageContentTypes}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Bible" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><b/><sz val="11"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="11"/><name val="Arial"/><family val="2"/></font><font><sz val="16"/><name val="ava_arsany"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF700000"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" readingOrder="2"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const drawing = titleImageBytes ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>${titleAnchorColumn}</xdr:col><xdr:colOff>${Math.round(titleAnchorOffsetPx * 9525)}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${titleImageRowOffset}</xdr:rowOff></xdr:from><xdr:ext cx="${titleImageCx}" cy="${titleImageCy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Coptic Dictionary Title" descr="${escapeXmlText(appName)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${titleImageCx}" cy="${titleImageCy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>` : "";
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView showGridLines="1" rightToLeft="${appLanguage === "ar" || languages.some(lk => ["ar", "he", "sy"].includes(lk)) ? 1 : 0}" workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${columnWidths}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A3:${lastColumn}${lastRow}"/><mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>${titleImageBytes ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
  const packageFiles: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
  };
  if (titleImageBytes) {
    packageFiles["xl/worksheets/_rels/sheet1.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
    packageFiles["xl/drawings/drawing1.xml"] = strToU8(drawing);
    packageFiles["xl/drawings/_rels/drawing1.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo22.png"/></Relationships>`);
    packageFiles["xl/media/logo22.png"] = titleImageBytes;
  }
  return zipSync(packageFiles, { level: 1 });
}

// --- Highlight Helper (Optimized) ---
const HighlightText = React.memo(({ text, highlight, isDark }: { text: string, highlight: string, isDark: boolean }) => {
  if (!highlight.trim()) return <Text selectable={true}>{text}</Text>;

  const cleanQuery = React.useMemo(() => {
    let q = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (/[\u0600-\u06FF]/.test(q)) {
      const diacritics = "[\u064B-\u0652\u0640]*";
      q = q.split('').join(diacritics);
    }
    return q;
  }, [highlight]);

  const parts = React.useMemo(() => text.split(new RegExp(`(${cleanQuery})`, 'gi')), [text, cleanQuery]);

  return (
    <Text selectable={true}>
      {parts.map((part, i) =>
        new RegExp(`(${cleanQuery})`, 'gi').test(part) ? (
          <Text key={i} style={{ backgroundColor: 'rgba(200,169,81,0.4)', color: isDark ? "#FFF" : "#000" }}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
});

// --- Bible Books Metadata ---
const BIBLE_BOOKS = [
  // Old Testament
  { id: 'Genesis', titleAr: 'التكوين', titleFr: 'Genèse', titleDe: 'Genesis', titleCoptic: 'ⲅⲉⲛⲉⲥⲓⲥ', num: 1, testament: 'old' },
  { id: 'Exodus', titleAr: 'الخروج', titleFr: 'Exode', titleDe: 'Exodus', titleCoptic: 'ⲉⲝⲟⲇⲟⲥ', num: 2, testament: 'old' },
  { id: 'Leviticus', titleAr: 'اللاويين', titleFr: 'Lévitique', titleDe: 'Levitikus', titleCoptic: 'ⲗⲉⲩⲓⲧⲓⲕⲟⲛ', num: 3, testament: 'old' },
  { id: 'Numbers', titleAr: 'العدد', titleFr: 'Nombres', titleDe: 'Numeri', titleCoptic: 'ⲁⲣⲓⲑⲙⲟⲓ', num: 4, testament: 'old' },
  { id: 'Deuteronomy', titleAr: 'التثنية', titleFr: 'Deutéronome', titleDe: 'Deuteronomium', titleCoptic: 'ⲇⲉⲩⲧⲉⲣⲟⲛⲟⲙⲓⲟⲛ', num: 5, testament: 'old' },
  { id: 'Joshua', titleAr: 'يشوع', titleFr: 'Josué', titleDe: 'Josua', titleCoptic: 'ⲓⲏⲥⲟⲩⲥ', num: 6, testament: 'old' },
  { id: 'Judges', titleAr: 'القضاة', titleFr: 'Juges', titleDe: 'Richter', titleCoptic: 'ⲛⲓⲣⲉϥϯϩⲁⲡ', num: 7, testament: 'old' },
  { id: 'Ruth', titleAr: 'راعوث', titleFr: 'Ruth', titleDe: 'Rut', titleCoptic: 'ⲣⲟⲩⲑ', num: 8, testament: 'old' },
  { id: '1 Samuel', titleAr: 'صموئيل الأول', titleFr: '1 Samuel', titleDe: '1. Samuel', titleCoptic: 'ⲥⲁⲙⲟⲩⲏⲗ ⲁ̅', num: 9, testament: 'old' },
  { id: '2 Samuel', titleAr: 'صموئيل الثاني', titleFr: '2 Samuel', titleDe: '2. Samuel', titleCoptic: 'ⲥⲁⲙⲟⲩⲏⲗ ⲃ̅', num: 10, testament: 'old' },
  { id: '1 Kings', titleAr: 'الملوك الأول', titleFr: '1 Rois', titleDe: '1. Könige', titleCoptic: 'ⲡⲟⲩⲣⲟ ⲁ̅', num: 11, testament: 'old' },
  { id: '2 Kings', titleAr: 'الملوك الثاني', titleFr: '2 Rois', titleDe: '2. Könige', titleCoptic: 'ⲡⲟⲩⲣⲟ ⲃ̅', num: 12, testament: 'old' },
  { id: '1 Chronicles', titleAr: 'أخبار الأيام الأول', titleFr: '1 Chroniques', titleDe: '1. Chronik', titleCoptic: 'ⲡⲁⲣⲁⲗⲓⲡⲟⲙⲉⲛⲱⲛ ⲁ̅', num: 13, testament: 'old' },
  { id: '2 Chronicles', titleAr: 'أخبار الأيام الثاني', titleFr: '2 Chroniques', titleDe: '2. Chronik', titleCoptic: 'ⲡⲁⲣⲁⲗⲓⲡⲟⲙⲉⲛⲱⲛ ⲃ̅', num: 14, testament: 'old' },
  { id: 'Ezra', titleAr: 'عزرا', titleFr: 'Esdras', titleDe: 'Esra', titleCoptic: 'ⲉⲍⲇⲣⲁⲥ', num: 15, testament: 'old' },
  { id: 'Nehemiah', titleAr: 'نحميا', titleFr: 'Néhémie', titleDe: 'Nehemia', titleCoptic: 'ⲛⲉⲉⲙⲓⲁⲥ', num: 16, testament: 'old' },
  { id: 'Esther', titleAr: 'أستير', titleFr: 'Esther', titleDe: 'Ester', titleCoptic: 'ⲉⲥⲑⲏⲣ', num: 17, testament: 'old' },
  { id: 'Job', titleAr: 'أيوب', titleFr: 'Job', titleDe: 'Ijob', titleCoptic: 'ⲓⲱⲃ', num: 18, testament: 'old' },
  { id: 'Psalms', titleAr: 'المزامير', titleFr: 'Psaumes', titleDe: 'Psalmen', titleCoptic: 'ⲯⲁⲗⲙⲟⲓ', num: 19, testament: 'old' },
  { id: 'Proverbs', titleAr: 'الأمثال', titleFr: 'Proverbes', titleDe: 'Sprichwörter', titleCoptic: 'ⲡⲁⲣⲟⲓⲙⲓⲁⲓ', num: 20, testament: 'old' },
  { id: 'Ecclesiastes', titleAr: 'الجامعة', titleFr: 'Ecclésiaste', titleDe: 'Kohelet', titleCoptic: 'ⲉⲕⲕⲗⲏⲥⲓⲁⲥⲧⲏⲥ', num: 21, testament: 'old' },
  { id: 'Song of Solomon', titleAr: 'نشيد الأنشاد', titleFr: 'Cantique des Cantiques', titleDe: 'Hohelied', titleCoptic: 'ϫⲱ ⲛ̀ⲧⲉ ⲛⲓϫⲱ', num: 22, testament: 'old' },
  { id: 'Isaiah', titleAr: 'إشعياء', titleFr: 'Ésaïe', titleDe: 'Jesaja', titleCoptic: 'ⲏⲥⲁⲓⲁⲥ', num: 23, testament: 'old' },
  { id: 'Jeremiah', titleAr: 'إرميا', titleFr: 'Jérémie', titleDe: 'Jeremia', titleCoptic: 'ⲓⲉⲣⲉⲙⲓⲁⲥ', num: 24, testament: 'old' },
  { id: 'Lamentations', titleAr: 'مراثي إرميا', titleFr: 'Lamentations', titleDe: 'Klagelieder', titleCoptic: 'ⲑⲣⲏⲛⲟⲓ', num: 25, testament: 'old' },
  { id: 'Ezekiel', titleAr: 'حزقيال', titleFr: 'Ézéchiel', titleDe: 'Ezechiel', titleCoptic: 'ⲓⲉⲍⲉⲕⲓⲏⲗ', num: 26, testament: 'old' },
  { id: 'Daniel', titleAr: 'دانيال', titleFr: 'Daniel', titleDe: 'Daniel', titleCoptic: 'ⲇⲁⲛⲓⲏⲗ', num: 27, testament: 'old' },
  { id: 'Hosea', titleAr: 'هوشع', titleFr: 'Osée', titleDe: 'Hosea', titleCoptic: 'ⲱⲥⲏⲉ', num: 28, testament: 'old' },
  { id: 'Joel', titleAr: 'يوئيل', titleFr: 'Joël', titleDe: 'Joel', titleCoptic: 'ⲓⲱⲏⲗ', num: 29, testament: 'old' },
  { id: 'Amos', titleAr: 'عاموس', titleFr: 'Amos', titleDe: 'Amos', titleCoptic: 'ⲁⲙⲱⲥ', num: 30, testament: 'old' },
  { id: 'Obadiah', titleAr: 'عوبديا', titleFr: 'Abdias', titleDe: 'Obadja', titleCoptic: 'ⲁⲃⲇⲓⲟⲩ', num: 31, testament: 'old' },
  { id: 'Jonah', titleAr: 'يونان', titleFr: 'Jonas', titleDe: 'Jona', titleCoptic: 'ⲓⲱⲛⲁⲥ', num: 32, testament: 'old' },
  { id: 'Micah', titleAr: 'ميخا', titleFr: 'Michée', titleDe: 'Micha', titleCoptic: 'ⲙⲓⲭⲉⲁⲥ', num: 33, testament: 'old' },
  { id: 'Nahum', titleAr: 'ناحوم', titleFr: 'Nahum', titleDe: 'Nahum', titleCoptic: 'ⲛⲁⲟⲩⲙ', num: 34, testament: 'old' },
  { id: 'Habakkuk', titleAr: 'حبقوق', titleFr: 'Habacuc', titleDe: 'Habakuk', titleCoptic: 'ⲁⲙⲃⲁⲕⲟⲩⲙ', num: 35, testament: 'old' },
  { id: 'Zephaniah', titleAr: 'صفنيا', titleFr: 'Sophonie', titleDe: 'Zefanja', titleCoptic: 'ⲥⲟⲫⲟⲛⲓⲁⲥ', num: 36, testament: 'old' },
  { id: 'Haggai', titleAr: 'حجي', titleFr: 'Aggée', titleDe: 'Haggai', titleCoptic: 'ⲁⲅⲅⲉⲟⲥ', num: 37, testament: 'old' },
  { id: 'Zechariah', titleAr: 'زكريا', titleFr: 'Zacharie', titleDe: 'Sacharja', titleCoptic: 'ⲍⲁⲭⲁⲣⲓⲁⲥ', num: 38, testament: 'old' },
  { id: 'Malachi', titleAr: 'ملاخي', titleFr: 'Malachie', titleDe: 'Maleachi', titleCoptic: 'ⲙⲁⲗⲁⲭⲓⲁⲥ', num: 39, testament: 'old' },

  // New Testament
  { id: 'Matthew', titleAr: 'إنجيل متى', titleFr: 'Matthieu', titleDe: 'Matthäus', titleCoptic: 'ⲡⲓⲉⲩⲁⲅⲅⲉⲗⲓⲟⲛ ⲕⲁⲧⲁ ⲙⲁⲧⲑⲉⲟⲛ', num: 40, testament: 'new' },
  { id: 'Mark', titleAr: 'إنجيل مرقس', titleFr: 'Marc', titleDe: 'Markus', titleCoptic: 'ⲡⲓⲉⲩⲁⲅⲅⲉⲗⲓⲟⲛ ⲕⲁⲧⲁ ⲙⲣⲕⲟⲛ', num: 41, testament: 'new' },
  { id: 'Luke', titleAr: 'إنجيل لوقا', titleFr: 'Luc', titleDe: 'Lukas', titleCoptic: 'ⲡⲓⲉⲩⲁⲅⲅⲉⲗⲓⲟⲛ ⲕⲁⲧⲁ ⲗⲟⲩⲕⲁⲛ', num: 42, testament: 'new' },
  { id: 'John', titleAr: 'إنجيل يوحنا', titleFr: 'Jean', titleDe: 'Johannes', titleCoptic: 'ⲡⲓⲉⲩⲁⲅⲅⲉⲗⲓⲟⲛ ⲕⲁⲧⲁ ⲓⲱⲁⲛⲛⲏⲛ', num: 43, testament: 'new' },
  { id: 'Acts', titleAr: 'أعمال الرسل', titleFr: 'Actes', titleDe: 'Apostelgeschichte', titleCoptic: 'ⲛⲓⲡⲣⲁⲝⲓⲥ', num: 44, testament: 'new' },
  { id: 'Romans', titleAr: 'رومية', titleFr: 'Romains', titleDe: 'Römer', titleCoptic: 'ⲡⲣⲟⲥ ⲣⲱⲙⲁⲓⲟⲩⲥ', num: 45, testament: 'new' },
  { id: '1 Corinthians', titleAr: '1 كورنثوس', titleFr: '1 Corinthiens', titleDe: '1. Korinther', titleCoptic: 'ⲡⲣⲟⲥ ⲕⲟⲣⲓⲛⲑⲓⲟⲩⲥ ⲁ̅', num: 46, testament: 'new' },
  { id: '2 Corinthians', titleAr: '2 كورنثوس', titleFr: '2 Corinthiens', titleDe: '2. Korinther', titleCoptic: 'ⲡⲣⲟⲥ ⲕⲟⲣⲓⲛⲑⲓⲟⲩⲥ ⲃ̅', num: 47, testament: 'new' },
  { id: 'Galatians', titleAr: 'غلاطية', titleFr: 'Galates', titleDe: 'Galater', titleCoptic: 'ⲡⲣⲟⲥ ⲅⲁⲗⲁⲧⲁⲥ', num: 48, testament: 'new' },
  { id: 'Ephesians', titleAr: 'أفسس', titleFr: 'Éphésiens', titleDe: 'Epheser', titleCoptic: 'ⲡⲣⲟⲥ ⲉⲫⲉⲥⲓⲟⲩⲥ', num: 49, testament: 'new' },
  { id: 'Philippians', titleAr: 'فيلبي', titleFr: 'Philippiens', titleDe: 'Philipper', titleCoptic: 'ⲡⲣⲟⲥ ⲫⲓⲗⲓⲡⲡⲏⲥⲓⲟⲩⲥ', num: 50, testament: 'new' },
  { id: 'Colossians', titleAr: 'كولوسي', titleFr: 'Colossiens', titleDe: 'Kolosser', titleCoptic: 'ⲡⲣⲟⲥ ⲕⲟⲗⲟⲥⲥⲁⲉⲩⲥ', num: 51, testament: 'new' },
  { id: '1 Thessalonians', titleAr: '1 تسالونيكي', titleFr: '1 Thessaloniciens', titleDe: '1. Thessalonicher', titleCoptic: 'ⲡⲣⲟⲥ ⲑⲉⲥⲥⲁⲗⲟⲛⲓⲕⲉⲩⲥ ⲁ̅', num: 52, testament: 'new' },
  { id: '2 Thessalonians', titleAr: '2 تسالونيكي', titleFr: '2 Thessaloniciens', titleDe: '2. Thessalonicher', titleCoptic: 'ⲡⲣⲟⲥ ⲑⲉⲥⲥⲁⲗⲟⲛⲓⲕⲉⲩⲥ ⲃ̅', num: 53, testament: 'new' },
  { id: '1 Timothy', titleAr: '1 تيموثاوس', titleFr: '1 Timothée', titleDe: '1. Timotheus', titleCoptic: 'ⲡⲣⲟⲥ ⲧⲓⲙⲟⲑⲉⲟⲛ ⲁ̅', num: 54, testament: 'new' },
  { id: '2 Timothy', titleAr: '2 تيموثاوس', titleFr: '2 Timothée', titleDe: '2. Timotheus', titleCoptic: 'ⲡⲣⲟⲥ ⲧⲓⲙⲟⲑⲉⲟⲛ ⲃ̅', num: 55, testament: 'new' },
  { id: 'Titus', titleAr: 'تيطس', titleFr: 'Tite', titleDe: 'Titus', titleCoptic: 'ⲡⲣⲟⲥ ⲧⲓⲧⲟⲛ', num: 56, testament: 'new' },
  { id: 'Philemon', titleAr: 'فليمون', titleFr: 'Philémon', titleDe: 'Philemon', titleCoptic: 'ⲡⲣⲟⲥ ⲫⲓⲗⲏⲙⲟⲛⲁ', num: 57, testament: 'new' },
  { id: 'Hebrews', titleAr: 'العبرانيين', titleFr: 'Hébreux', titleDe: 'Hebräer', titleCoptic: 'ⲡⲣⲟⲥ ⲉⲃⲣⲁⲓⲟⲩⲥ', num: 58, testament: 'new' },
  { id: 'James', titleAr: 'يعقوب', titleFr: 'Jacques', titleDe: 'Jakobus', titleCoptic: 'ⲓⲁⲕⲱⲃⲟⲩ', num: 59, testament: 'new' },
  { id: '1 Peter', titleAr: '1 بطرس', titleFr: '1 Pierre', titleDe: '1. Petrus', titleCoptic: 'ⲡⲉⲧⲣⲟⲩ ⲁ̅', num: 60, testament: 'new' },
  { id: '2 Peter', titleAr: '2 بطرس', titleFr: '2 Pierre', titleDe: '2. Petrus', titleCoptic: 'ⲡⲉⲧⲣⲟⲩ ⲃ̅', num: 61, testament: 'new' },
  { id: '1 John', titleAr: '1 يوحنا', titleFr: '1 Jean', titleDe: '1. Johannes', titleCoptic: 'ⲓⲱⲁⲛⲛⲟⲩ ⲁ̅', num: 62, testament: 'new' },
  { id: '2 John', titleAr: '2 يوحنا', titleFr: '2 Jean', titleDe: '2. Johannes', titleCoptic: 'ⲓⲱⲁⲛⲛⲟⲩ ⲃ̅', num: 63, testament: 'new' },
  { id: '3 John', titleAr: '3 يوحنا', titleFr: '3 Jean', titleDe: '3. Johannes', titleCoptic: 'ⲓⲱⲁⲛⲛⲟⲩ ⲅ̅', num: 64, testament: 'new' },
  { id: 'Jude', titleAr: 'يهوذا', titleFr: 'Jude', titleDe: 'Judas', titleCoptic: 'ⲓⲟⲩⲇⲁ', num: 65, testament: 'new' },
  { id: 'Revelation', titleAr: 'الرؤيا', titleFr: 'Apocalypse', titleDe: 'Offenbarung', titleCoptic: 'ⲧⲁⲡⲟⲕⲁⲗⲩⲯⲓⲥ', num: 66, testament: 'new' },

  // Deuterocanonical Books (الأسفار القانونية الثانية)
  { id: 'Tobit', titleAr: 'سفر طوبيا', titleFr: 'Tobie', titleDe: 'Tobit', titleCoptic: 'ⲧⲱⲃⲓⲧ', num: 67, testament: 'deutero' },
  { id: 'Judith', titleAr: 'سفر يهوديت', titleFr: 'Judith', titleDe: 'Judit', titleCoptic: 'ⲓⲟⲩⲇⲓⲑ', num: 68, testament: 'deutero' },
  { id: 'Esther Additions', titleAr: 'تتمة سفر أستير', titleFr: 'Additions à Esther', titleDe: 'Zusätze zu Ester', titleCoptic: 'ⲉⲥⲑⲏⲣ ⲃ̅', num: 69, testament: 'deutero' },
  { id: 'Wisdom', titleAr: 'سفر الحكمة', titleFr: 'Sagesse de Salomon', titleDe: 'Weisheit Salomos', titleCoptic: 'ⲥⲟⲫⲓⲁ ⲥⲟⲗⲟⲙⲱⲛ', num: 70, testament: 'deutero' },
  { id: 'Sirach', titleAr: 'سفر يشوع بن سيراخ', titleFr: 'Siracide', titleDe: 'Jesus Sirach', titleCoptic: 'ⲥⲟⲫⲓⲁ ⲥⲓⲣⲁⲭ', num: 71, testament: 'deutero' },
  { id: 'Baruch', titleAr: 'سفر نبوة باروخ', titleFr: 'Baruch', titleDe: 'Baruch', titleCoptic: 'ⲃⲁⲣⲟⲩⲭ', num: 72, testament: 'deutero' },
  { id: 'Daniel Additions', titleAr: 'تتمة سفر دانيال', titleFr: 'Additions à Daniel', titleDe: 'Zusätze zu Daniel', titleCoptic: 'ⲇⲁⲛⲓⲏⲗ ⲃ̅', num: 73, testament: 'deutero' },
  { id: '1 Maccabees', titleAr: 'سفر المكابيين الأول', titleFr: '1 Maccabées', titleDe: '1. Makkabäer', titleCoptic: 'ⲙⲁⲕⲕⲁⲃⲁⲓⲟⲩ ⲁ̅', num: 74, testament: 'deutero' },
  { id: '2 Maccabees', titleAr: 'سفر المكابيين الثاني', titleFr: '2 Maccabées', titleDe: '2. Makkabäer', titleCoptic: 'ⲙⲁⲕⲕⲁⲃⲁⲓⲟⲩ ⲃ̅', num: 75, testament: 'deutero' },
  { id: 'Psalm 151', titleAr: 'المزمور 151', titleFr: 'Psaume 151', titleDe: 'Psalm 151', titleCoptic: 'ⲯⲁⲗⲙⲟⲥ ⲣ̅ⲛ̅ⲁ̅', num: 76, testament: 'deutero' },
];

// --- Optimized Book Item Component ---
const BookItem = React.memo(({ item, index, isDark, lang, isRTL, onPress }: any) => (
  <TouchableOpacity
    style={[styles.bookCard, { backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]}
    onPress={() => onPress(item)}
  >
    <View style={styles.bookIconContainer}>
      <Text style={styles.bookIconText}>
        {BIBLE_BOOKS.filter(b => b.testament === item.testament).findIndex(b => b.id === item.id) + 1}
      </Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[styles.bookTitleAr, { color: isDark ? "#FFF" : "#333", textAlign: lang === 'ar' ? 'left' : 'right', marginTop: item.testament === 'old' ? 5 : 0 }]}>
        {getBookTitle(item, lang)}
      </Text>
    </View>
    <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color="#C8A951" />
  </TouchableOpacity>
));

const VerseResultCard = React.memo(({ item, index, isDark, lang, searchQuery, onPress }: any) => {
  const isRtlResult = item.primaryLang === 'ar' || item.primaryLang === 'he' || item.primaryLang === 'sy';
  const langColor = LANG_COLORS[item.primaryLang] || '#555';

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={[styles.verseResultCard, { backgroundColor: isDark ? "#1C1B19" : "#FFF", marginHorizontal: 20, borderColor: isDark ? 'rgba(200,169,81,0.22)' : '#EAE5D9' }]}
      onPress={() => onPress(item)}
    >
      <View style={styles.resultTopRow}>
        <Text style={[styles.verseResultHeader, { flex: 1, textAlign: isRtlResult ? 'right' : 'left', color: isDark ? '#E6C96E' : '#8B0000' }]} numberOfLines={1}>
          {lang === 'ar' ? item.bookTitleAr : item.bookId} - {item.chapterNum}:{item.verseNumber}
        </Text>
        <View style={[styles.transLabel, { backgroundColor: langColor + '18', borderColor: langColor + '40', marginLeft: 8 }]}>
          <Text style={[styles.transLabelText, { color: langColor }]}>
            {item.primaryLang.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={[
        item.primaryLang === 'cb' ? styles.copticText : (isRtlResult ? styles.arabicText : styles.latinText),
        {
          color: isDark ? "#E5E1D8" : "#383631",
          fontSize: item.primaryLang === 'cb' ? 20 : (isRtlResult ? 16 : 14),
          textAlign: isRtlResult ? 'right' : 'left',
          writingDirection: isRtlResult ? 'rtl' : 'ltr',
          lineHeight: isRtlResult ? 29 : 23,
          fontFamily: item.primaryLang === 'cb' ? "CSAvaVeni-Regular" : undefined
        }
      ]}>
        <HighlightText
          text={item.primaryLang === 'cb' ? toCS(item.matchedText) : item.matchedText}
          highlight={searchQuery}
          isDark={isDark}
        />
      </Text>
    </TouchableOpacity>
  );
});

// Helper to get localized book title
const getBookTitle = (book: any, lang: string) => {
  if (!book) return "";
  if (lang === 'ar') return book.titleAr;
  if (lang === 'fr') return book.titleFr || book.titleEn || book.id;
  if (lang === 'de') return book.titleDe || book.titleEn || book.id;
  return book.titleEn || book.id; // English or default
};

export function CopticBibleScreen() {
  const { t, language, isRTL, lang } = useLanguage();
  const { remoteSettings, remoteSettingsReady } = useAppConfig();
  const remoteControls = remoteSettings.controls;
  const isBibleBookVisible = useCallback((book: { num: number; hidden?: boolean }) => !book.hidden && remoteSettings.visibility.bibleBooks[String(book.num)] !== false, [remoteSettings.visibility.bibleBooks]);
  const allowedBibleLanguages = useMemo(() => ALL_BIBLE_LANGS.filter((code) => remoteSettings.visibility.bibleTranslations[code] !== false), [remoteSettings.visibility.bibleTranslations]);
  const { currentAppLink } = useAppUpdate();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const [remoteBookMetadata, setRemoteBookMetadata] = useState<RemoteBibleBook[]>([]);
  const allBibleBooks = useMemo<any[]>(() => {
    const merged = new Map<number, any>(BIBLE_BOOKS.map((book) => [book.num, { ...book, order: book.num }]));
    for (const override of remoteBookMetadata) {
      if (override.deleted) { merged.delete(override.id); continue; }
      const local = merged.get(Number(override.id));
      const fallback = local || { id: String(override.id), num: override.id, titleAr: "", titleEn: "", titleFr: "", titleDe: "", titleCoptic: "", testament: override.testament };
      merged.set(Number(override.id), {
        ...fallback,
        id: local?.id ?? String(override.id), num: Number(override.id), order: Number(override.order || override.id),
        titleAr: override.titleAr || fallback.titleAr, titleEn: override.titleEn || fallback.titleEn,
        titleFr: override.titleFr || fallback.titleFr, titleDe: override.titleDe || fallback.titleDe,
        titleCoptic: override.titleCoptic || fallback.titleCoptic, testament: override.testament === "custom" ? "new" : (override.testament || fallback.testament),
        hidden: Boolean(override.hidden),
      });
    }
    return Array.from(merged.values()).sort((a, b) => Number(a.order || a.num) - Number(b.order || b.num));
  }, [remoteBookMetadata]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => { const books = await getRemoteBibleBooks(true); if (!cancelled) setRemoteBookMetadata(books); };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const [activeTestament, setActiveTestament] = useState<'old' | 'new'>('new');
  const [isDeuteroVisible, setIsDeuteroVisible] = useState(false);
  const [showDeuteroNotice, setShowDeuteroNotice] = useState(false);
  useEffect(() => {
    if (isDeuteroVisible && !remoteControls.bible_deuterocanonical) setIsDeuteroVisible(false);
    if (activeTestament === 'old' && !remoteControls.bible_old_testament && remoteControls.bible_new_testament) setActiveTestament('new');
    else if (activeTestament === 'new' && !remoteControls.bible_new_testament && remoteControls.bible_old_testament) setActiveTestament('old');
  }, [activeTestament, isDeuteroVisible, remoteControls.bible_deuterocanonical, remoteControls.bible_old_testament, remoteControls.bible_new_testament]);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<any | null>(null);
  const [bookData, setBookData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [searchQuery, setSearchQuery] = useState('');

  // Translation visibility states
  const [selectedTrans, setVisibleTrans] = useState<string[]>(['ar', 'en']);
  const visibleTrans = useMemo(() => selectedTrans.filter((code) => allowedBibleLanguages.includes(code)), [selectedTrans, allowedBibleLanguages]);

  const [showDiacritics, setShowDiacritics] = useState(true);
  const [tableView, setTableView] = useState(false);

  const [globalResults, setGlobalResults] = useState<any[]>([]);
  const [visibleResultsCount, setVisibleResultsCount] = useState(50);
  const [isSearchingVerses, setIsSearchingVerses] = useState(false);
  const [inputText, setInputText] = useState(''); // الحالة المحلية للإدخال (لضمان سلاسة الكتابة)
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [kbVisible, setKbVisible] = useState(false);
  const [currentKbLang, setCurrentKbLang] = useState<KeyboardLang>(lang === 'ar' ? 'ar' : 'en');
  const [searchScope, setSearchScope] = useState<'all' | 'old' | 'new' | 'book' | 'deutero'>('all');
  const [searchBookId, setSearchBookId] = useState<number | null>(null);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [isFromSearch, setIsFromSearch] = useState(false);
  useEffect(() => {
    if (selectedBook && !isBibleBookVisible(selectedBook)) {
      setSelectedBook(null);
      setSelectedChapter(null);
      setBookData([]);
      setIsFromSearch(false);
    }
    if (searchBookId !== null) {
      const scopedBook = allBibleBooks.find((book) => book.num === searchBookId);
      if (scopedBook && !isBibleBookVisible(scopedBook)) {
        setSearchBookId(null);
        setSearchScope('all');
      }
    }
  }, [selectedBook, searchBookId, isBibleBookVisible]);
  const [showVersePicker, setShowVersePicker] = useState(false);
  const [currentVerse, setCurrentVerse] = useState(1);
  const [showCrossRefs, setShowCrossRefs] = useState(false);
  const [crossRefData, setCrossRefData] = useState<any[]>([]);
  const [visibleCrossRefsCount, setVisibleCrossRefsCount] = useState(10);
  const [currentSourceVerse, setCurrentSourceVerse] = useState<any>(null);
  const crossRefCache = useRef<Record<string, any[]>>({});

  const handleChar = useCallback((char: string) => {
    setInputText(prev => prev + char);
  }, []);

  const handleBackspace = useCallback(() => {
    setInputText(prev => prev.slice(0, -1));
  }, []);

  // --- Toast Success Logic (Matching Handwriting Modal Exactly) ---
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    triggerHaptic();
    setTimeout(() => {
      setToastVisible(false);
    }, 3000);
  };

  const displayedResults = useMemo(() => globalResults.filter((item: any) => { const book = allBibleBooks.find((entry) => entry.id === item.bookId); return Boolean(book && isBibleBookVisible(book)); }).slice(0, visibleResultsCount), [globalResults, visibleResultsCount, isBibleBookVisible]);

  const renderVerseResult = useCallback(({ item }: any) => (
    <VerseResultCard
      item={item}
      isDark={isDark}
      lang={lang}
      searchQuery={searchQuery}
      onPress={async (verseItem: any) => {
        const book = allBibleBooks.find(b => b.id === verseItem.bookId);
        if (book && isBibleBookVisible(book)) {
          setSelectedBook(book);
          setSearchBookId(book.num);
          setIsLoading(true);
          try {
            const chapters = await getChapterCount(book.num);
            setBookData(chapters.map((c: { chapter: number }) => ({ num: c.chapter })));
            const combined = await getMultiLangVerses(book.num, verseItem.chapterNum, visibleTrans);
            lastFetchKeyRef.current = `${book.id}-${verseItem.chapterNum}-${visibleTrans.slice().sort().join(',')}`;
            setSelectedChapter({ num: verseItem.chapterNum, combinedVerses: combined });
            setTargetVerse(Number(verseItem.verseNumber));
            setIsFromSearch(true);
          } catch (err) {
            console.error("Result navigation error:", err);
          } finally {
            setIsLoading(false);
          }
        }
      }}
    />
  ), [isDark, lang, searchQuery, visibleTrans, isBibleBookVisible]);

  // --- Definitive Search Normalization ---
  const normalize = (text: string) => {
    if (!text) return "";
    return text
      .replace(/[\u064B-\u0652\u0640]/g, "") // Remove Arabic diacritics
      .replace(/[أإآ]/g, "ا")
      .replace(/ٱ/g, "ا") // Alef wasla → plain alef
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .toLowerCase();
  };

  const viewShotRef = useRef<any>(null);
  const copticAppNameImageRef = useRef<any>(null);
  const captureCopticAppNamePng = async (): Promise<string> => {
    if (!copticAppNameImageRef.current) throw new Error("Coptic title view is not ready");
    const captured = await captureRef(copticAppNameImageRef.current, { format: "png", quality: 1, result: "base64" });
    if (typeof captured !== "string" || !captured) throw new Error("Could not capture the local Coptic font");
    return captured.replace(/^data:image\/png;base64,/i, "");
  };
  const [shotVerse, setShotVerse] = useState<any>(null);
  const [isSavingVerse, setIsSavingVerse] = useState(false);
  const versesListRef = useRef<FlatList>(null);
  const [targetVerse, setTargetVerse] = useState<number | null>(null);
  const [scrollLockVerse, setScrollLockVerse] = useState<number | null>(null); // قفل المكان عند تغيير الإعدادات
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const topItem = viewableItems[0];
      if (topItem && topItem.item && topItem.item.num) {
        setCurrentVerse(Number(topItem.item.num));
      }
    }
  }).current;
  const searchIdRef = useRef(0);
  const lastFetchKeyRef = useRef<string>("");

  useEffect(() => {
    if (targetVerse !== null && selectedChapter?.combinedVerses) {
      const timer = setTimeout(() => {
        const index = selectedChapter.combinedVerses.findIndex((v: any) => Number(v.num) === targetVerse);
        if (index !== -1) {
          versesListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }
        setTargetVerse(null);
      }, 400); // زيادة التأخير لضمان استقرار القائمة بعد تغيير الحجم

      return () => clearTimeout(timer);
    }
  }, [targetVerse, selectedChapter]);

  const handleGlobalSearch = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setGlobalResults([]);
      return;
    }
    const currentSearchId = ++searchIdRef.current; // زيادة الرقم لكل عملية بحث جديدة
    setIsSearchingVerses(true);
    try {
      const rows = await searchVersesFTS(
        query,
        visibleTrans,
        Number(currentSearchId),
        () => searchIdRef.current,
        searchScope,
        searchBookId
      );

      // التحقق: هل هذه النتائج تابعة لآخر عملية بحث طلبها المستخدم؟
      if (currentSearchId !== searchIdRef.current) return;

      const results = rows.filter((r: any) => {
        const bookMeta = allBibleBooks.find(b => b.num === r.book);
        return Boolean(bookMeta && isBibleBookVisible(bookMeta));
      }).map((r: any) => {
        const bookMeta = allBibleBooks.find(b => b.num === r.book);
        return {
          primaryLang: r.langCode,
          matchedText: r.text,
          bookId: bookMeta?.id || '',
          bookTitleAr: bookMeta?.titleAr || '',
          chapterNum: r.chapter,
          verseNumber: String(r.verse),
        };
      });
      setGlobalResults(results);
      setVisibleResultsCount(50); // إعادة التعيين عند كل بحث جديد
    } catch (e) {
      console.error('Search error:', e);
      setGlobalResults([]);
    } finally {
      setIsSearchingVerses(false);
    }
  }, [visibleTrans, searchScope, searchBookId, isBibleBookVisible]);

  useEffect(() => {
    const q = inputText.trim();

    // Debounce both searching and clearing to keep UI thread smooth
    const timer = setTimeout(() => {
      if (q.length === 0) {
        setSearchQuery('');
        setGlobalResults([]);
      } else {
        setSearchQuery(q);
        handleGlobalSearch(q);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputText, handleGlobalSearch, searchScope, searchBookId]);
  useEffect(() => {
    const backAction = () => {
      if (selectedChapter) {
        if (isFromSearch) {
          // If we came from search, go straight back to search results
          setSelectedChapter(null);
          setSelectedBook(null);
          setIsFromSearch(false);
        } else {
          setSelectedChapter(null);
        }
        return true;
      }
      if (selectedBook) {
        setSelectedBook(null);
        return true;
      }
      if (searchQuery.length > 0) {
        setSearchQuery('');
        setInputText('');
        setKbVisible(false);
        return true;
      }
      if (inputText.length > 0 || kbVisible) {
        setInputText('');
        setKbVisible(false);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [selectedBook, selectedChapter]);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // 🔗 ميزة الربط: فتح القائمة السفلية وبدء البحث التلقائي
  const handleOpenCrossRefs = (verse: any, lk: string) => {
    triggerHaptic();
    setCrossRefData([]);
    setVisibleCrossRefsCount(10); // إعادة تعيين العداد عند كل بحث جديد
    setCurrentSourceVerse({ ...verse, lk });
    setShowCrossRefs(true);
  };

  const displayedCrossRefs = useMemo(() => {
    return crossRefData.slice(0, visibleCrossRefsCount);
  }, [crossRefData, visibleCrossRefsCount]);

  // 🚀 حل جذري: تشغيل البحث بعد أن تكون القائمة قد فتحت فعلياً لتجنب أي تأخير في الواجهة
  useEffect(() => {
    if (showCrossRefs && currentSourceVerse && crossRefData.length === 0) {
      const performSearch = async () => {
        try {
          const { lk } = currentSourceVerse;
          const text = currentSourceVerse[lk] || "";
          
          // تنظيف النص وتوحيده (إزالة التشكيل) لضمان مطابقة الكلمات في البحث
          const normalizedText = dbNormalize(text, lk);
          
          // استخراج الكلمات الهامة (الأسماء والأفعال الطويلة)
          let words = normalizedText.replace(/[.,!?;:()\[\]{}\"\']+/g, " ")
            .split(/\s+/)
            .filter((w: string) => w.length > 3) // التركيز على الكلمات الطويلة
            .sort((a: string, b: string) => b.length - a.length); // الأطول أولاً

          const keywords = words.slice(0, 3).join(" "); // أخذ أهم 3 كلمات
          if (!keywords) return;

          const cacheKey = `${selectedBook?.num}-${selectedChapter?.num}-${currentSourceVerse.num}-${lk}`;
          if (crossRefCache.current[cacheKey]) {
            setCrossRefData(crossRefCache.current[cacheKey]);
            return;
          }

          setIsLoading(true);
          const results = await searchVersesFTS(keywords, [lk], 0, () => 0, 'all', null, 200, 'any');
          
          // استبعاد الآية الحالية وترتيب النتائج حسب ترتيب الأسفار (العهد القديم -> القانونية الثانية -> العهد الجديد)
          const filtered = results
            .filter((r: any) => 
              !(r.book === selectedBook?.num && r.chapter === selectedChapter?.num && r.verse === currentSourceVerse.num)
            )
            .sort((a: any, b: any) => {
              const getSortIndex = (num: number) => {
                if (num >= 1 && num <= 39) return num; // عهد قديم (1-39)
                if (num >= 67 && num <= 76) return num - 20; // قانونية ثانية (67-20 = 47)
                if (num >= 40 && num <= 66) return num + 40; // عهد جديد (40+40 = 80)
                return num;
              };
              const orderA = getSortIndex(a.book);
              const orderB = getSortIndex(b.book);
              if (orderA !== orderB) return orderA - orderB;
              if (a.chapter !== b.chapter) return a.chapter - b.chapter;
              return a.verse - b.verse;
            });

          // جلب النصوص الكاملة للآيات المرتبطة
          const mapped = await Promise.all(filtered.map(async (r: any) => {
            const verses = await getMultiLangVerses(r.book, r.chapter, [lk]);
            const vText = verses.find((v: any) => v.num === r.verse)?.[lk] || "";
            return { ...r, text: vText };
          }));

          crossRefCache.current[cacheKey] = mapped;
          setCrossRefData(mapped);
        } catch (err) {
          console.error("CrossRef search error:", err);
        } finally {
          setIsLoading(false);
        }
      };

      // تأخير بسيط لضمان سلاسة حركة الـ Modal
      const timer = setTimeout(performSearch, 300);
      return () => clearTimeout(timer);
    }
  }, [showCrossRefs, currentSourceVerse]);

  const navigateToVerse = (bookId: number, chapter: number, verse: number) => {
    triggerHaptic();
    setShowCrossRefs(false);
    const book = allBibleBooks.find(b => b.num === bookId);
    if (book) {
      loadBook(book);
      // نحتاج لانتظار تحميل الكتاب ثم الأصحاح
      setTimeout(() => {
        const chap = { num: chapter };
        setSelectedChapter(chap);
        setCurrentVerse(verse);
        setTargetVerse(verse);
      }, 500);
    }
  };

  const loadBook = async (book: any) => {
    if (!book || !isBibleBookVisible(book)) return;
    setBookData([]); // مسح البيانات القديمة فوراً
    setIsLoading(true);
    triggerHaptic();
    try {
      const chapters = await getChapterCount(book.num);
      if (chapters && chapters.length > 0) {
        setBookData(chapters.map((c: { chapter: number }) => ({ num: c.chapter })));
        setSelectedBook(book);
        setSearchBookId(book.num);
        setIsFromSearch(false);
        setCurrentVerse(1); // تصفير رقم الآية عند اختيار سفر جديد

      } else {
        Alert.alert("تنبيه", "لا توجد أصحاحات متاحة لهذا السفر حالياً.");
      }
    } catch (error) {
      console.error('Failed to load book:', error);
      Alert.alert("عذراً", "حدث خطأ أثناء تحميل السفر.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadChapter = async (chap: any, resetSearchState = true) => {
    if (!selectedBook) return;
    setIsLoading(true);
    try {
      const combined = await getMultiLangVerses(selectedBook.num, chap.num, visibleTrans);
      setSelectedChapter({ ...chap, combinedVerses: combined });
      if (resetSearchState) {
        setIsFromSearch(false);
      }
      setCurrentVerse(1); // تصفير رقم الآية عند فتح أصحاح جديد

    } catch (e) {
      console.error("Load chapter error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // تحديث الفصل عند تغيير اللغات المفعلة أو تغيير السفر/الأصحاح (مع منع التكرار اللانهائي)
  useEffect(() => {
    if (selectedBook && selectedChapter) {
      const fetchKey = `${selectedBook.id}-${selectedChapter.num}-${visibleTrans.slice().sort().join(',')}`;
      if (lastFetchKeyRef.current !== fetchKey) {
        lastFetchKeyRef.current = fetchKey;
        loadChapter(selectedChapter, false); // Do NOT reset search state when just changing translations
      }
    } else {
      lastFetchKeyRef.current = "";
    }
  }, [visibleTrans, selectedBook, selectedChapter]);

  useEffect(() => {
    if (!selectedBook || !selectedChapter) return;
    let active = true;
    const refreshOpenChapter = async () => {
      const combined = await getMultiLangVerses(selectedBook.num, selectedChapter.num, visibleTrans);
      if (active) setSelectedChapter((current: any) => current?.num === selectedChapter.num ? { ...current, combinedVerses: combined } : current);
    };
    const timer = setInterval(() => void refreshOpenChapter(), 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [visibleTrans, selectedBook, selectedChapter?.num]);

  const copyVerse = async (verse: any) => {
    const bookTitle = getBookTitle(selectedBook, lang);
    const ref = lang === 'ar'
      ? `${bookTitle} ${verse.num}:${selectedChapter?.num}`
      : `${bookTitle} ${selectedChapter?.num}:${verse.num}`;
    let text = `[${ref}]\n\n`;
    visibleTrans.forEach(lk => {
      if (verse[lk]) text += `${t.bible.keyboard[lk] || lk}: ${verse[lk]}\n\n`;
    });
    await Clipboard.setStringAsync(text.trim());
    triggerHaptic();
    showToast(lang === 'ar' ? 'تم نسخ الآية بنجاح ✓' : 'Verse copied successfully ✓');
  };

  const capturePosterForVerse = async (verse: any, format: 'png' | 'jpg' = 'png'): Promise<string> => {
    setShotVerse(verse);
    await waitForPosterRender();
    const base64 = await captureRef(viewShotRef.current, { format, quality: format === 'jpg' ? 0.82 : 0.9, result: 'base64' });
    if (!base64) throw new Error('Could not capture the verse poster');
    return base64;
  };

  const shareVerseAsImage = async (verse: any) => {
    // طلب صلاحيات الحفظ أولاً
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(lang === 'ar' ? 'خطأ' : 'Error', lang === 'ar' ? 'نحتاج لصلاحية الوصول للصور لحفظ البطاقة' : 'Permission to access media library is required');
      return;
    }

    setShotVerse(verse);
    setIsSavingVerse(true);
    triggerHaptic();
    let success = false;
    try {
      await waitForPosterRender();
      const uri = await captureRef(viewShotRef.current, {
        format: 'png',
        quality: 0.9,
        result: "tmpfile"
      });

      const bookName = lang === 'ar' ? selectedBook.titleAr : selectedBook.id;
      const fileName = `${bookName}_${selectedChapter.num}_${verse.num}.png`;
      const newUri = cacheDirectory + fileName;
      await moveAsync({ from: uri, to: newUri });
      await MediaLibrary.saveToLibraryAsync(newUri);
      success = true;
    } catch (err) {
      console.error("Capture error:", err);
      Alert.alert(lang === 'ar' ? 'خطأ' : 'Error', lang === 'ar' ? 'فشل حفظ الصورة' : 'Failed to save image');
    } finally {
      setShotVerse(null);
      setIsSavingVerse(false);
      if (success) showToast(lang === 'ar' ? 'تم الحفظ بنجاح ✓' : 'Saved successfully ✓');
    }
  };

  const exportChapterToPDF = async () => {
    if (!selectedChapter?.combinedVerses || !selectedBook) return;

    setIsSavingVerse(true);
    triggerHaptic();
    let success = false;

    try {
      const posterPages: string[] = [];
      for (const verse of selectedChapter.combinedVerses) posterPages.push(await capturePosterForVerse(verse, 'jpg'));
      let htmlContent = "<!doctype html><html><head><meta charset='UTF-8'><style>html,body{margin:0;padding:0;width:6in;background:#150505}.page{width:6in;height:10in;page-break-after:always;break-after:page;overflow:hidden}.page:last-child{page-break-after:auto;break-after:auto}img{display:block;width:6in;height:10in;object-fit:fill}</style></head><body>";
      posterPages.forEach(poster => { htmlContent += "<section class='page'><img src='data:image/jpeg;base64," + poster + "'/></section>"; });
      htmlContent += '</body></html>';
      const { uri } = await Print.printToFileAsync({ html: htmlContent, width: 432, height: 720, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      // تحضير اسم ملف PDF احترافي باللغة المختارة
      const bookName = lang === 'ar' ? selectedBook.titleAr : selectedBook.id;
      const chapLabel = lang === 'ar' ? 'أصحاح' : 'Chapter';
      const pdfName = `${bookName}_${chapLabel}_${selectedChapter.num}.pdf`;
      const pdfUri = cacheDirectory + pdfName;

      // إعادة تسمية الملف
      await moveAsync({ from: uri, to: pdfUri });

      try {
        // محاولة الحفظ المباشر (قد تنجح في بعض إصدارات أندرويد/iOS للمستندات)
        await MediaLibrary.saveToLibraryAsync(pdfUri);
        showToast(lang === 'ar' ? 'تم الحفظ في المستندات ✓' : 'Saved to documents ✓');
      } catch (saveErr) {
        // لو فشل الحفظ المباشر (لأنها مستند وليس ميديا)، نفتح قائمة المشاركة
        await Sharing.shareAsync(pdfUri, { UTI: '.pdf', mimeType: 'application/pdf' });
        showToast(lang === 'ar' ? 'تم توليد ملف PDF بنجاح ✓' : 'PDF generated successfully ✓');
      }
      success = true;
    } catch (err) {
      console.error("PDF Export error:", err);
      Alert.alert(lang === 'ar' ? 'خطأ' : 'Error', lang === 'ar' ? 'فشل توليد ملف PDF' : 'Failed to generate PDF');
    } finally {
      setShotVerse(null);
      setIsSavingVerse(false);
      if (success) {
        setTimeout(() => {
          showToast(lang === 'ar' ? 'تم توليد ملف PDF بنجاح ✓' : 'PDF generated successfully ✓');
        }, 800);
      }
    }
  };

  const exportChapterToPPTX = async () => {
    if (!selectedChapter?.combinedVerses || !selectedBook) return;

    setIsSavingVerse(true);
    triggerHaptic();
    let success = false;

    try {
      const pptx = new pptxgen();
      pptx.rtlMode = false;

      // إعدادات الملف
      pptx.title = `${getBookTitle(selectedBook, lang)} - ${selectedChapter.num}`;
      pptx.author = "Khmi Coptic Dictionary";

      pptx.defineLayout({ name: 'COPTIC_POSTER', width: 6, height: 10 });
      pptx.layout = 'COPTIC_POSTER';
      for (const verse of selectedChapter.combinedVerses) {
        const posterBase64 = await capturePosterForVerse(verse, 'jpg');
        const slide = pptx.addSlide();
        slide.background = { color: '150505' };
        slide.addImage({ data: `data:image/jpeg;base64,${posterBase64}`, x: 0, y: 0, w: 6, h: 10 });
      }

      const b64 = await pptx.write({ outputType: "base64" }) as string;

      // تحضير اسم ملف احترافي باللغة المختارة
      const bookName = lang === 'ar' ? selectedBook.titleAr : selectedBook.id;
      const chapLabel = lang === 'ar' ? 'أصحاح' : 'Chapter';
      const pptxName = `${bookName}_${chapLabel}_${selectedChapter.num}.pptx`;
      const pptxUri = cacheDirectory + pptxName;

      await writeAsStringAsync(pptxUri, b64, { encoding: EncodingType.Base64 });
      await Sharing.shareAsync(pptxUri, { UTI: 'com.microsoft.powerpoint.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });

      success = true;
    } catch (err) {
      console.error("PPTX Export error:", err);
      Alert.alert(lang === 'ar' ? 'خطأ' : 'Error', lang === 'ar' ? 'فشل توليد ملف PowerPoint' : 'Failed to generate PPTX');
    } finally {
      setShotVerse(null);
      setIsSavingVerse(false);
      if (success) {
        setTimeout(() => {
          showToast(lang === 'ar' ? 'تم توليد ملف PowerPoint بنجاح ✓' : 'PowerPoint generated successfully ✓');
        }, 800);
      }
    }
  };

  const exportChapterToDOCX = async () => {
    if (!selectedChapter?.combinedVerses || !selectedBook) return;

    setIsSavingVerse(true);
    triggerHaptic();
    let success = false;

    try {
      const docChildren: Paragraph[] = [];
      const chapterTitle = `${getBookTitle(selectedBook, lang)} ${selectedChapter.num}`;
      const titleIsRtl = isBibleVerseRtl(lang);
      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: titleIsRtl,
        spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: chapterTitle, bold: true, size: 24, color: '8B0000', rightToLeft: titleIsRtl })],
      }));
      if (currentAppLink) {
        const qrCode = qrcode(0, 'M');
        qrCode.addData(currentAppLink);
        qrCode.make();
        const qrBase64 = qrCode.createDataURL(6, 2).split(',')[1];
        docChildren.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: [new ImageRun({ data: base64ToBytes(qrBase64), transformation: { width: 90, height: 90 }, type: 'gif' })],
        }));
      }
      const copyHeading = lang === 'ar' ? 'نصوص الآيات القابلة للنسخ' : lang === 'fr' ? 'Textes des versets à copier' : lang === 'de' ? 'Kopierbare Versverse' : 'Copyable verse text';
      docChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: titleIsRtl, spacing: { after: 240 }, children: [new TextRun({ text: copyHeading, bold: true, size: 18, color: '8B0000', rightToLeft: titleIsRtl })] }));
      for (const verse of selectedChapter.combinedVerses) {
        docChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: titleIsRtl, spacing: { before: 120, after: 60 }, children: [new TextRun({ text: getBookTitle(selectedBook, lang) + ' ' + selectedChapter.num + ':' + verse.num, bold: true, size: 16, color: 'C8A951', rightToLeft: titleIsRtl })] }));
        for (const lk of visibleTrans) {
          const text = verse[lk];
          if (!text) continue;
          const isRtl = isBibleVerseRtl(lk);
          docChildren.push(new Paragraph({ alignment: getBibleVerseAlignment(lk) === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT, bidirectional: isRtl, spacing: { before: 40, after: 40 }, children: [new TextRun({ text: t.bible.keyboard[lk] || lk.toUpperCase(), bold: true, size: 10, color: '777777' })] }));
          docChildren.push(new Paragraph({ alignment: getBibleVerseAlignment(lk) === 'left' ? AlignmentType.LEFT : AlignmentType.RIGHT, bidirectional: isRtl, spacing: { before: 0, after: 100 }, children: [new TextRun({ text: String(text), font: lk === 'cb' ? 'ava_arsany' : isRtl ? 'Cairo_700Bold' : 'Arial', bold: lk !== 'cb', size: 18, rightToLeft: isRtl })] }));
        }
      }
      const doc = new Document({ sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children: docChildren }] });
      const b64 = await Packer.toBase64String(doc);

      const bookName = lang === 'ar' ? selectedBook.titleAr : selectedBook.id;
      const chapLabel = lang === 'ar' ? 'أصحاح' : 'Chapter';
      const docxName = `${bookName}_${chapLabel}_${selectedChapter.num}.docx`;
      const docxUri = cacheDirectory + docxName;

      await writeAsStringAsync(docxUri, b64, { encoding: EncodingType.Base64 });
      await Sharing.shareAsync(docxUri, { UTI: 'com.microsoft.word.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

      success = true;
    } catch (err) {
      console.error("DOCX Export error:", err);
      Alert.alert(lang === 'ar' ? 'خطأ' : 'Error', lang === 'ar' ? 'فشل توليد ملف Word' : 'Failed to generate Word document');
    } finally {
      setShotVerse(null);
      setIsSavingVerse(false);
      if (success) {
        setTimeout(() => {
          showToast(lang === 'ar' ? 'تم توليد ملف Word بنجاح ✓' : 'Word document generated successfully ✓');
        }, 800);
      }
    }
  };

  const filteredBooks = useMemo(() => {
    return allBibleBooks.filter(b => b.testament === activeTestament && isBibleBookVisible(b));
  }, [activeTestament, isBibleBookVisible]);

  const exportChapterToExcel = async () => {
    if (!selectedChapter?.combinedVerses || !selectedBook) return;

    setIsSavingVerse(true);
    triggerHaptic();
    let success = false;

    try {
      const languageLabels: Record<string, string> = {};
      visibleTrans.forEach(lk => {
        languageLabels[lk] = t.bible.keyboard[lk] || lk.toUpperCase();
      });

      let logoBase64 = "";
      try {
        logoBase64 = await getExportLogoBase64();
      } catch (logoError) {
        console.warn("Excel export will continue without the optional logo:", logoError);
      }
      const workbookBytes = createBibleXlsx(
        COPTIC_APP_NAME,
        getBookTitle(selectedBook, lang),
        selectedChapter.num,
        selectedChapter.combinedVerses,
        visibleTrans,
        languageLabels,
        lang,
        logoBase64,
      );
      const safeBookName = String(selectedBook.id).replace(/[^a-z0-9]+/gi, "_");
      const excelName = `Bible_${safeBookName}_Chapter_${selectedChapter.num}.xlsx`;
      const excelFile = new File(Paths.cache, excelName);

      excelFile.write(workbookBytes);
      await Sharing.shareAsync(excelFile.uri, {
        UTI: "org.openxmlformats.spreadsheetml.sheet",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      success = true;
    } catch (err) {
      console.error("Excel export error:", err);
      Alert.alert(lang === 'ar' ? 'خطأ' : 'Error', lang === 'ar' ? 'فشل توليد ملف Excel' : 'Failed to generate Excel workbook');
    } finally {
      setIsSavingVerse(false);
      if (success) {
        setTimeout(() => {
          showToast(lang === 'ar' ? 'تم توليد ملف Excel بنجاح ✓' : 'Excel workbook generated successfully ✓');
        }, 800);
      }
    }
  };

  const renderBookItem = ({ item, index }: { item: any, index: number }) => (
    <TouchableOpacity
      style={[styles.bookCard, { backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]}
      onPress={() => loadBook(item)}
    >
      <View style={styles.bookIconContainer}>
        <Text style={styles.bookIconText}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {item.titleCoptic && (
          <Text style={[styles.bookTitleCoptic, { color: isDark ? "#C8A951" : "#8B0000", textAlign: lang === 'ar' ? 'left' : 'right' }]}>
            {toCS(item.titleCoptic)}
          </Text>
        )}
        <Text style={[styles.bookTitleAr, { color: isDark ? "#FFF" : "#333", textAlign: lang === 'ar' ? 'left' : 'right', marginTop: item.testament === 'old' ? 5 : 0 }]}>
          {lang === 'ar' ? item.titleAr : item.id}
        </Text>
      </View>
      <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color="#C8A951" />
    </TouchableOpacity>
  );

  const stripDiacritics = (text: string) => text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]/g, '').replace(/ٱ/g, 'ا');

  const getVerseCellText = (item: any, languageCode: string) => {
    let value = String(item?.[languageCode] ?? '');
    if (languageCode === 'ar' && !showDiacritics) value = stripDiacritics(value);
    if (languageCode === 'cb') value = toCS(value);
    return value;
  };

  const renderVerse = ({ item }: { item: any }) => {
    return (
      <View style={[styles.verseContainer, { backgroundColor: isDark ? "#1E1E1E" : "#FFF", borderColor: isDark ? "#2A2A2A" : "#EEE" }]}>
        <View style={[styles.verseHeader, { justifyContent: 'space-between', paddingHorizontal: 5 }]}>
          {/* 1. الجانب الأيسر: اسم اللغة وعلامة الارتباط */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {visibleTrans.length > 0 && (
              <>
                <View style={[styles.transLabel, { 
                  backgroundColor: LANG_COLORS[visibleTrans[0]] || '#555', 
                }]}>
                  <Text style={[styles.transLabelText, { color: '#FFF' }]}>
                    {t.bible.keyboard[visibleTrans[0]] || visibleTrans[0]}
                  </Text>
                </View>
                {remoteControls.bible_cross_references && <TouchableOpacity
                  onPress={() => handleOpenCrossRefs(item, visibleTrans[0])} 
                  style={[styles.linkBtn, { backgroundColor: (LANG_COLORS[visibleTrans[0]] || '#555') + '20', borderColor: (LANG_COLORS[visibleTrans[0]] || '#555') + '40', borderWidth: 1 }]}
                >
                  <Feather name="link" size={15} color={LANG_COLORS[visibleTrans[0]] || '#555'} />
                </TouchableOpacity>}
              </>
            )}
          </View>

          {/* 2. المنتصف: رقم الآية */}
          <View style={{ alignItems: 'center' }}>
            <View style={{ 
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: isDark ? '#C8A951' : '#8B0000',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.2,
              shadowRadius: 1.41,
              elevation: 2,
            }}>
              <Text style={{ 
                fontSize: 12, 
                fontFamily: 'Cairo_700Bold', 
                color: isDark ? "#1A1A1A" : "#FFF",
                marginTop: Platform.OS === 'ios' ? 0 : -2
              }}>
                {item.num}
              </Text>
            </View>
          </View>

          {/* 3. الجانب الأيمن: أيقونات التحكم */}
          {remoteControls.bible_verse_actions && <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={remoteSettings.labels.button_bible_verse_download.trim() || (lang === 'ar' ? 'حفظ الآية كصورة' : 'Save verse as image')} onPress={() => shareVerseAsImage(item)} style={styles.copyBtn} activeOpacity={0.7}>
              <Feather name="download" size={16} color={isDark ? "#C8A951" : "#8B0000"} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={remoteSettings.labels.button_bible_verse_copy.trim() || (lang === 'ar' ? 'نسخ الآية' : 'Copy verse')} onPress={() => copyVerse(item)} style={styles.copyBtn} activeOpacity={0.7}>
              <Feather name="copy" size={16} color={isDark ? "#C8A951" : "#8B0000"} />
            </TouchableOpacity>
          </View>}
        </View>
        <View style={styles.verseContent}>
          {visibleTrans.map((lk, idx) => {
            const isRtl = isBibleVerseRtl(lk);
            const color = LANG_COLORS[lk] || '#555';
            let displayText = item[lk] || '';
            if (lk === 'ar' && !showDiacritics) displayText = stripDiacritics(displayText);
            if (lk === 'cb') displayText = toCS(displayText);
            return (
              <React.Fragment key={lk}>
                {idx > 0 && (
                  <>
                    <View style={styles.divider} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={[styles.transLabel, { 
                        backgroundColor: LANG_COLORS[lk] || '#555', 
                      }]}>
                        <Text style={[styles.transLabelText, { color: '#FFF' }]}>
                          {t.bible.keyboard[lk] || lk}
                        </Text>
                      </View>
                      {remoteControls.bible_cross_references && <TouchableOpacity
                        onPress={() => handleOpenCrossRefs(item, lk)} 
                        style={[styles.linkBtn, { backgroundColor: (LANG_COLORS[lk] || '#555') + '20', borderColor: (LANG_COLORS[lk] || '#555') + '40', borderWidth: 1 }]}
                      >
                        <Feather name="link" size={15} color={LANG_COLORS[lk] || '#555'} />
                      </TouchableOpacity>}
                    </View>
                  </>
                )}
                <Text
                  selectable={true}
                  style={[
                    lk === 'cb' ? styles.copticText : (isRtl ? styles.arabicText : styles.latinText),
                    {
                      color: isDark ? "#F0F0F0" : "#222",
                      fontSize: lk === 'cb' ? fontSize + 4 : (isRtl ? fontSize : fontSize - 2),
                      textAlign: isRtl ? 'left' : 'right',
                    }
                  ]}>
                  {displayText}
                </Text>
              </React.Fragment>
            );
          })}
        </View>
      </View>
    );
  };

  const tableViewportWidth = viewportWidth;
  const tableVerseColumnWidth = Math.max(46, Math.min(70, Math.round(tableViewportWidth * 0.16)));
  const tableAvailableTranslationWidth = Math.max(0, tableViewportWidth - tableVerseColumnWidth);
  const tableLanguageColumnWidth = tableAvailableTranslationWidth / Math.max(1, visibleTrans.length);
  const tableContentWidth = tableViewportWidth;
  const tableBodyFontSize = Math.max(10, Math.min(fontSize, tableLanguageColumnWidth < 64 ? 12 : tableLanguageColumnWidth < 92 ? 14 : tableLanguageColumnWidth < 132 ? 18 : tableLanguageColumnWidth < 190 ? 24 : 32));
  const renderTableVerse = ({ item, index }: { item: any; index: number }) => (
    <View style={[styles.tableRow, { backgroundColor: index % 2 === 0 ? (isDark ? '#1E1E1E' : '#FFF') : (isDark ? '#191919' : '#FAF8F3') }]}>
      <View style={[styles.tableVerseCell, { width: tableVerseColumnWidth, borderColor: isDark ? '#343434' : '#E8E2D6' }]}>
        <View style={[styles.tableVerseBadge, { backgroundColor: isDark ? '#C8A951' : '#8B0000' }]}>
          <Text style={[styles.tableVerseNumber, { color: isDark ? '#1A1A1A' : '#FFF' }]}>{item.num}</Text>
        </View>
        <View style={styles.tableVerseActions}>
          <TouchableOpacity onPress={() => shareVerseAsImage(item)} accessibilityRole="button" accessibilityLabel={lang === 'ar' ? 'حفظ الآية كصورة' : 'Save verse as image'}>
            <Feather name="download" size={14} color={isDark ? '#C8A951' : '#8B0000'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => copyVerse(item)} accessibilityRole="button" accessibilityLabel={lang === 'ar' ? 'نسخ الآية' : 'Copy verse'}>
            <Feather name="copy" size={14} color={isDark ? '#C8A951' : '#8B0000'} />
          </TouchableOpacity>
        </View>
      </View>
      {visibleTrans.map((languageCode) => {
        const value = getVerseCellText(item, languageCode);
        const isRtlText = isBibleVerseRtl(languageCode);
        return (
          <View key={languageCode} style={[styles.tableTranslationCell, { width: tableLanguageColumnWidth, paddingHorizontal: tableLanguageColumnWidth < 64 ? 2 : tableLanguageColumnWidth < 88 ? 4 : tableLanguageColumnWidth < 130 ? 6 : 10, borderColor: isDark ? '#343434' : '#E8E2D6' }]}>
            {value.trim() ? (
              <Text
                selectable
                style={[
                  languageCode === 'cb' ? styles.copticText : (isRtlText ? styles.arabicText : styles.latinText),
                  styles.tableTranslationText,
                  {
                    color: isDark ? '#F0F0F0' : '#292722',
                    fontSize: languageCode === 'cb' ? tableBodyFontSize + 2 : (isRtlText ? Math.max(11, tableBodyFontSize - 1) : Math.max(10, tableBodyFontSize - 3)),
                    lineHeight: languageCode === 'cb' ? tableBodyFontSize + 14 : tableBodyFontSize + 10,
                    textAlign: isRtlText ? 'left' : 'right',
                    writingDirection: getBibleVerseWritingDirection(languageCode),
                  }
                ]}
              >
                {value}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  if (selectedChapter) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? "#121212" : "#F8F8F8", paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.header, { paddingTop: 5, paddingBottom: 10 }]}>
          <TouchableOpacity
            onPress={() => {
              if (isFromSearch) {
                setSelectedChapter(null);
                setSelectedBook(null);
                setIsFromSearch(false);
              } else {
                setSelectedChapter(null);
              }
            }}
            style={styles.backBtn}
          >
            <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={24} color="#C8A951" />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, alignItems: 'center' }}
            onPress={() => setShowVersePicker(true)}
            activeOpacity={0.7}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.headerTitle, { color: isDark ? "#FFF" : "#8B0000", marginTop: -5, flexShrink: 1 }]}>
              {getBookTitle(selectedBook, lang)} {selectedChapter.num}
              <Feather name="chevron-down" size={14} color="#C8A951" style={{ marginLeft: 5 }} />
            </Text>
          </TouchableOpacity>

          {remoteControls.bible_export_controls && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6 }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={remoteSettings.labels.button_bible_export_word.trim() || (lang === 'ar' ? 'تصدير إلى Word' : 'Export to Word')} onPress={exportChapterToDOCX} style={[styles.backBtn, { width: 34 }]}>
              <MaterialCommunityIcons name="file-word-box" size={23} color="#2B579A" />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={remoteSettings.labels.button_bible_export_pptx.trim() || (lang === 'ar' ? 'تصدير إلى PowerPoint' : 'Export to PowerPoint')} onPress={exportChapterToPPTX} style={[styles.backBtn, { width: 34 }]}>
              <MaterialCommunityIcons name="microsoft-powerpoint" size={22} color="#E06C3F" />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={remoteSettings.labels.button_bible_export_pdf.trim() || (lang === 'ar' ? 'تصدير إلى PDF' : 'Export to PDF')} onPress={exportChapterToPDF} style={[styles.backBtn, { width: 34 }]}>
              <MaterialCommunityIcons name="file-pdf-box" size={23} color="#C8A951" />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={remoteSettings.labels.button_bible_export_excel.trim() || (lang === 'ar' ? 'تصدير الفصل إلى Excel' : lang === 'fr' ? 'Exporter le chapitre vers Excel' : lang === 'de' ? 'Kapitel nach Excel exportieren' : 'Export chapter to Excel')} onPress={exportChapterToExcel} style={[styles.backBtn, { width: 34 }]}>
              <MaterialCommunityIcons name="file-excel-box" size={23} color="#217346" />
            </TouchableOpacity>
          </View>}
        </View>
        {/* ── Controls Panel ── */}
        <View style={[styles.controlsBar, { backgroundColor: isDark ? "#1A1A1A" : "#FFF" }]}>
          {remoteControls.bible_layout_modes && <View style={[styles.layoutModeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.layoutModeGroup, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity
                onPress={() => { setScrollLockVerse(currentVerse); setTableView(false); }}
                style={[styles.layoutModeButton, !tableView && styles.layoutModeButtonActive]}
                accessibilityRole="button"
                accessibilityLabel={lang === 'ar' ? 'عرض الترجمات بالتتابع' : lang === 'fr' ? 'Afficher les traductions verticalement' : lang === 'de' ? 'Übersetzungen untereinander anzeigen' : 'Show translations stacked'}
              >
                <Feather name="align-left" size={15} color={!tableView ? '#FFF' : (isDark ? '#AAA' : '#666')} />
                <Text numberOfLines={1} style={[styles.layoutModeText, { color: !tableView ? '#FFF' : (isDark ? '#AAA' : '#666') }]}>
                  {remoteSettings.labels.button_bible_layout_stacked.trim() || (lang === 'ar' ? 'متتابع' : lang === 'fr' ? 'Vertical' : lang === 'de' ? 'Untereinander' : 'Stacked')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setScrollLockVerse(currentVerse); setTableView(true); }}
                style={[styles.layoutModeButton, tableView && styles.layoutModeButtonActive]}
                accessibilityRole="button"
                accessibilityLabel={lang === 'ar' ? 'عرض الترجمات جنبًا إلى جنب' : lang === 'fr' ? 'Comparer les traductions côte à côte' : lang === 'de' ? 'Übersetzungen nebeneinander vergleichen' : 'Compare translations side by side'}
              >
                <Feather name="grid" size={15} color={tableView ? '#FFF' : (isDark ? '#AAA' : '#666')} />
                <Text numberOfLines={1} style={[styles.layoutModeText, { color: tableView ? '#FFF' : (isDark ? '#AAA' : '#666') }]}>
                  {remoteSettings.labels.button_bible_layout_table.trim() || (lang === 'ar' ? 'جدولي' : lang === 'fr' ? 'Tableau' : lang === 'de' ? 'Tabelle' : 'Table')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>}
          {/* Row 1: All language chips visible (no scroll) */}
          {remoteControls.bible_translation_controls && <View style={styles.langChipsWrap}>
            {allowedBibleLanguages.map(lk => {
              const active = visibleTrans.includes(lk);
              const isAvailable = true; // Always available per user request
              return (
                <TouchableOpacity
                  key={lk}
                  activeOpacity={0.7}
                  disabled={!isAvailable}
                  onPress={() => {
                    triggerHaptic();
                    const next = active ? visibleTrans.filter(x => x !== lk) : [...visibleTrans, lk];
                    if (next.length > 0) {
                      setScrollLockVerse(currentVerse); // قفل المكان فوراً
                      setVisibleTrans(next);
                    }

                  }}
                  style={[
                    styles.langChip,
                    {
                      backgroundColor: active ? (LANG_COLORS[lk] || '#8B0000') : (isDark ? '#252525' : '#F0F0F0'),
                      borderColor: active ? '#C8A951' : (isDark ? '#333' : '#DDD'),
                      opacity: isAvailable ? 1 : 0.3
                    }
                  ]}
                >
                  <Text 
                    numberOfLines={1} 
                    adjustsFontSizeToFit 
                    style={[styles.langChipText, { color: active ? '#FFF' : (isDark ? '#888' : '#666') }]}
                  >
                    {t.bible.keyboard[lk] || lk}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>}
          {/* Row 2: Diacritics + Font Size */}
          {/* Row 2: Controls with Labels (Even Spacing) */}
          <View style={styles.controlsRow2}>
            {visibleTrans.includes('ar') && (
              <View style={styles.controlGroup}>
                <Text style={styles.controlLabel}>{t.bible.controls.diacritics}</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { triggerHaptic(); setShowDiacritics(prev => !prev); }}
                  style={[styles.diacriticsBtn, { backgroundColor: showDiacritics ? (isDark ? 'rgba(200,169,81,0.25)' : 'rgba(200,169,81,0.15)') : (isDark ? '#252525' : '#F0F0F0') }]}
                >
                  <Feather name={showDiacritics ? "eye" : "eye-off"} size={14} color={showDiacritics ? "#C8A951" : "#888"} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>{t.bible.controls.verse}</Text>
              <View style={styles.fontSizeControls}>
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    const next = Math.max(1, currentVerse - 1);
                    setCurrentVerse(next);
                    setTargetVerse(next);
                  }}
                  style={styles.fontBtn}
                >
                  <Feather name="minus" size={14} color="#C8A951" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowVersePicker(true)} style={{ paddingHorizontal: 6 }}>
                  <Text style={[styles.fontSizeLabel, { color: "#C8A951", minWidth: 25 }]}>{currentVerse}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic();
                    const next = Math.min(selectedChapter?.combinedVerses?.length || 1, currentVerse + 1);
                    setCurrentVerse(next);
                    setTargetVerse(next);
                  }}
                  style={styles.fontBtn}
                >
                  <Feather name="plus" size={14} color="#C8A951" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>{t.bible.controls.font}</Text>
              <View style={styles.fontSizeControls}>
                <TouchableOpacity onPress={() => {
                  triggerHaptic();
                  setScrollLockVerse(currentVerse);
                  setFontSize(s => Math.max(12, s - 2));
                }} style={styles.fontBtn}>


                  <Feather name="minus" size={14} color={isDark ? "#CCC" : "#555"} />
                </TouchableOpacity>
                <Text style={[styles.fontSizeLabel, { color: isDark ? "#CCC" : "#555" }]}>{fontSize}</Text>
                <TouchableOpacity onPress={() => {
                  triggerHaptic();
                  setScrollLockVerse(currentVerse);
                  setFontSize(s => Math.min(32, s + 2));
                }} style={styles.fontBtn}>


                  <Feather name="plus" size={14} color={isDark ? "#CCC" : "#555"} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {tableView ? (
          <View style={{ flex: 1, width: '100%' }}>
            <View style={{ width: tableContentWidth, flex: 1 }}>
              <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? '#252525' : '#EFE9DC', borderColor: isDark ? '#45413A' : '#DCD3C0' }]}>
                <View style={[styles.tableHeaderVerseCell, { width: tableVerseColumnWidth }]}>
                  <Text style={[styles.tableHeaderText, { color: isDark ? '#C8A951' : '#72591E' }]}>
                    {lang === 'ar' ? 'آية' : lang === 'fr' ? 'N°' : lang === 'de' ? 'Nr.' : 'Verse'}
                  </Text>
                </View>
                {visibleTrans.map((languageCode) => (
                  <View key={languageCode} style={[styles.tableHeaderLanguageCell, { width: tableLanguageColumnWidth, paddingHorizontal: tableLanguageColumnWidth < 64 ? 2 : tableLanguageColumnWidth < 88 ? 4 : 8, borderLeftColor: isDark ? '#45413A' : '#DCD3C0', borderTopColor: LANG_COLORS[languageCode] || '#8B0000' }]}>
                    <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableHeaderText, { color: isDark ? '#FFF' : '#333' }]}>
                      {t.bible.keyboard[languageCode] || languageCode.toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>
              <FlatList
                ref={versesListRef}
                style={{ flex: 1, width: tableContentWidth }}
                data={selectedChapter?.combinedVerses || []}
                renderItem={renderTableVerse}
                keyExtractor={(item) => String(item.num)}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                showsVerticalScrollIndicator
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={21}
                removeClippedSubviews={false}
                maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: -1 }}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onContentSizeChange={() => {
                  if (scrollLockVerse !== null && selectedChapter?.combinedVerses) {
                    const index = selectedChapter.combinedVerses.findIndex((v: any) => Number(v.num) === scrollLockVerse);
                    if (index !== -1) versesListRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
                    setScrollLockVerse(null);
                  }
                }}
                onScrollToIndexFailed={(info) => {
                  versesListRef.current?.scrollToOffset({ offset: info.index * (fontSize * 5 + 80), animated: false });
                  setTimeout(() => versesListRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 }), 50);
                }}
              />
            </View>
          </View>
        ) : (
          <FlatList
            ref={versesListRef}
            data={selectedChapter?.combinedVerses || []}
            renderItem={renderVerse}
            keyExtractor={(v, i) => i.toString()}
            contentContainerStyle={[styles.versesList, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={true}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={21}
            removeClippedSubviews={false}
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: -1 }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onContentSizeChange={() => {
              if (scrollLockVerse !== null && selectedChapter?.combinedVerses) {
                const index = selectedChapter.combinedVerses.findIndex((v: any) => Number(v.num) === scrollLockVerse);
                if (index !== -1) versesListRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
                setScrollLockVerse(null);
              }
            }}
            onScrollToIndexFailed={(info) => {
              const offset = info.index * (visibleTrans.length * 120 + 60);
              versesListRef.current?.scrollToOffset({ offset, animated: false });
              setTimeout(() => versesListRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 }), 50);
            }}
          />
        )}

        {/* Hidden Poster for Verse Image Generation (Matching Coptic Letter Poster Design) */}
        <View style={styles.hiddenPosterContainer} pointerEvents="none">
          <View ref={viewShotRef} collapsable={false} style={styles.poster}>
            <LinearGradient colors={["#1A0101", "#0A0000"]} style={styles.posterGradient}>
              <View style={styles.posterFrame} />

              {/* Header (Top) */}
              <View style={styles.posterHeader}>
                <Image source={EXPORT_LOGO_ASSET} style={styles.posterLogo} resizeMode="contain" />
                <View ref={copticAppNameImageRef} collapsable={false} style={styles.copticNameCapture}>
                  <Text style={styles.posterAppName}>{COPTIC_APP_NAME}</Text>
                </View>
                <Text style={styles.posterAppSub}>COPTIC DICTIONARY</Text>
              </View>

              {/* Bible Content (Middle - Expands) */}
              <View style={styles.posterContentArea}>
                <Text style={[styles.posterBibleRef, { writingDirection: lang === 'ar' ? 'rtl' : 'ltr' }]}>
                  {lang === 'ar'
                    ? `${getBookTitle(selectedBook, lang)} ${shotVerse?.num}:${selectedChapter?.num}`
                    : `${getBookTitle(selectedBook, lang)} ${selectedChapter?.num}:${shotVerse?.num}`}
                </Text>
                <View style={styles.posterLine} />
                <View style={styles.posterVersesWrap}>
                  {visibleTrans.map((lk, idx) => {
                    const isRtl = isBibleVerseRtl(lk);
                    const text = shotVerse?.[lk];
                    const langColor = LANG_COLORS[lk] || '#C8A951';
                    if (!text) return null;
                    return (
                      <View key={lk} style={{ width: '100%', marginBottom: 15, alignItems: 'center' }}>
                        {/* Language Label in Poster */}
                        <View style={{ 
                          backgroundColor: langColor, 
                          paddingHorizontal: 12, 
                          paddingVertical: 4, 
                          borderRadius: 8, 
                          marginBottom: 8
                        }}>
                          <Text style={{ color: '#FFF', fontFamily: 'Cairo_700Bold', fontSize: 14 }}>
                            {t.bible.keyboard[lk] || lk}
                          </Text>
                        </View>
                        <Text
                          adjustsFontSizeToFit
                          numberOfLines={10}
                          style={[
                            lk === 'cb' ? styles.posterTextCb : (isRtl ? styles.posterTextAr : styles.posterTextEn),
                            { fontSize: lk === 'cb' ? 36 : (isRtl ? 32 : 24), width: '100%', alignSelf: 'stretch', textAlign: getBibleVerseAlignment(lk), writingDirection: getBibleVerseWritingDirection(lk) }
                          ]}
                        >
                          {lk === 'cb' ? toCS(text) : text}
                        </Text>
                        {idx < visibleTrans.length - 1 && <View style={[styles.posterLine, { width: 80, opacity: 0.1, marginVertical: 8 }]} />}
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Footer (Bottom) */}
              <View style={styles.posterFooter}>
                <View style={styles.posterQRContainer}>
                  <QRCode value={currentAppLink} size={90} backgroundColor="white" color="black" quietZone={2} />
                </View>
                <Text style={[styles.posterBottomPromo, { writingDirection: lang === 'ar' ? 'rtl' : 'ltr', textAlign: 'center' }]}>{t.handwriting.promo}</Text>
                <Text style={styles.posterBottomCredit}>Ebram merzik</Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* 📖 Verse Picker Modal (Professional Bottom Sheet Design) */}
        <Modal visible={showVersePicker} animationType="slide" transparent>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowVersePicker(false)}
            style={styles.modalOverlay}
          >
            <TouchableOpacity activeOpacity={1} style={[styles.bottomSheetContent, { backgroundColor: isDark ? "#1A1A1A" : "#FFF" }]}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetTitleRow}>
                  <View>
                    <Text style={[styles.pickerTitle, { color: isDark ? "#FFF" : "#8B0000" }]}>
                      {t.bible.select_verse}
                    </Text>
                    <Text style={{ color: '#888', fontSize: 12, fontFamily: 'Cairo_600SemiBold' }}>
                      {getBookTitle(selectedBook, lang)} {selectedChapter?.num} • {selectedChapter?.combinedVerses?.length || 0} {t.bible.verses}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowVersePicker(false)} style={styles.sheetCloseBtn}>
                    <Feather name="chevron-down" size={28} color={isDark ? "#555" : "#CCC"} />
                  </TouchableOpacity>
                </View>
              </View>

              <FlatList
                data={selectedChapter?.combinedVerses || []}
                keyExtractor={(item) => `v-${item.num}`}
                numColumns={4} // تغيير للأعمدة الأربعة بناءً على طلب المستخدم
                showsVerticalScrollIndicator={false}
                initialNumToRender={selectedChapter?.combinedVerses?.length || 60}
                columnWrapperStyle={styles.verseGridRow}
                contentContainerStyle={styles.verseGridContainer}
                renderItem={({ item }) => {
                  const isSelected = currentVerse === Number(item.num);
                  return (
                    <TouchableOpacity
                      activeOpacity={0.6}
                      style={[
                        styles.modernVerseBox,
                        {
                          backgroundColor: isSelected ? "#8B0000" : (isDark ? "rgba(255,255,255,0.05)" : "#F8F9FA"),
                          borderColor: isSelected ? "#C8A951" : (isDark ? "rgba(255,255,255,0.1)" : "#EEE"),
                          borderWidth: isSelected ? 2 : 1,
                        }
                      ]}
                      onPress={() => {
                        triggerHaptic();
                        setCurrentVerse(Number(item.num));
                        setTargetVerse(Number(item.num));
                        setShowVersePicker(false);
                      }}
                    >
                      <Text style={[
                        styles.modernVerseText,
                        {
                          color: isSelected ? "#FFF" : (isDark ? "#AAA" : "#555"),
                          fontFamily: isSelected ? "Cairo_700Bold" : "Cairo_600SemiBold"
                        }
                      ]}>
                        {item.num}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* 🔗 Cross Reference Modal (Bottom Sheet) */}
        <Modal visible={showCrossRefs} animationType="slide" transparent>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowCrossRefs(false)}
            style={styles.modalOverlay}
          >
            <View style={[styles.bottomSheetContent, { backgroundColor: isDark ? "#1A1A1A" : "#FFF" }]}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetTitleRow}>
                  <Text style={[styles.pickerTitle, { color: isDark ? "#FFF" : "#8B0000" }]}>
                    {lang === 'ar' ? 'الآيات المرتبطة' : 'Related Verses'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowCrossRefs(false)} style={styles.sheetCloseBtn}>
                    <Feather name="x" size={20} color={isDark ? "#888" : "#333"} />
                  </TouchableOpacity>
                </View>
              </View>

              {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#C8A951" />
                  <Text style={{ marginTop: 10, color: '#888', fontFamily: 'Cairo_600SemiBold' }}>
                    {lang === 'ar' ? 'جاري البحث عن آيات مرتبطة...' : 'Searching for related verses...'}
                  </Text>
                </View>
              ) : crossRefData.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                  <Feather name="search" size={40} color="rgba(200,169,81,0.2)" />
                  <Text style={{ color: '#888', marginTop: 15, textAlign: 'center', fontFamily: 'Cairo_600SemiBold' }}>
                    {lang === 'ar' ? 'لم نجد آيات مرتبطة مباشرة بهذه الآية' : 'No directly related verses found for this verse'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={displayedCrossRefs}
                  keyExtractor={(item, idx) => `ref-${idx}`}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  ListFooterComponent={() => (
                    visibleCrossRefsCount < crossRefData.length ? (
                      <TouchableOpacity
                        onPress={() => setVisibleCrossRefsCount(prev => prev + 20)}
                        style={[styles.loadMoreBtn, { marginTop: 20, marginHorizontal: 20 }]}
                      >
                        <LinearGradient
                          colors={['#C8A951', '#8B0000']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.loadMoreGradient}
                        >
                          <Text style={styles.loadMoreText}>
                            {lang === 'ar' ? 'عرض المزيد من الآيات المرتبطة' : 'Show more related verses'}
                          </Text>
                          <Feather name="chevron-down" size={18} color="#FFF" />
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : null
                  )}
                  renderItem={({ item, index }) => (
                    <VerseResultCard
                      item={{
                        primaryLang: item.langCode,
                        matchedText: item.text,
                        bookId: allBibleBooks.find(b => b.num === item.book)?.id || '',
                        bookTitleAr: allBibleBooks.find(b => b.num === item.book)?.titleAr || '',
                        chapterNum: item.chapter,
                        verseNumber: String(item.verse),
                      }}
                      index={index}
                      isDark={isDark}
                      lang={lang}
                      searchQuery={""} // No highlight in cross-refs for now to keep it clean
                      onPress={() => navigateToVerse(item.book, item.chapter, item.verse)}
                    />
                  )}
                />
              )}
            </View>
          </TouchableOpacity>
        </Modal>


        {/* 🔔 Toast Success (Exact Handwriting Design) */}
        {toastVisible && (
          <ReAnimated.View entering={FadeInUp} exiting={FadeOutUp} style={styles.handwritingToastContainer}>
            <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.handwritingToastInner}>
              <Feather name="check-circle" size={20} color="#FFF" />
              <Text style={styles.handwritingToastText}>{toastMsg}</Text>
            </LinearGradient>
          </ReAnimated.View>
        )}

        {/* ⏳ Global Saving Overlay */}
        {isSavingVerse && (
          <View style={styles.savingOverlay}>
            <View style={[styles.savingBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)' }]}>
              <ActivityIndicator size="large" color="#C8A951" />
              <Text style={[styles.savingText, { color: isDark ? '#FFF' : '#333' }]}>
                {lang === 'ar' ? 'جاري حفظ الملف...' : 'Saving file...'}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (selectedBook) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? "#121212" : "#F8F8F8", paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.header, { paddingTop: 5, paddingBottom: 5 }]}>
          <TouchableOpacity onPress={() => setSelectedBook(null)} style={styles.backBtn}>
            <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={24} color="#C8A951" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            {selectedBook.titleCoptic && (
              <Text style={[styles.headerSub, { color: isDark ? "#C8A951" : "#8B0000" }]}>{toCS(selectedBook.titleCoptic)}</Text>
            )}
            <Text style={[styles.headerTitle, { color: isDark ? "#FFF" : "#8B0000", marginTop: selectedBook.titleCoptic ? -2 : -5 }]}>{lang === 'ar' ? selectedBook.titleAr : selectedBook.id}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        {isLoading ? (
          <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#C8A951" /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.chaptersGrid}>
            {bookData.map((chap, i) => (
              <TouchableOpacity key={i} style={[styles.chapterBox, { backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]} onPress={() => loadChapter(chap)}>
                <Text style={[styles.chapterBoxText, { color: isDark ? "#C8A951" : "#8B0000" }]}>{chap.num}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* 🔔 Toast Success (Exact Handwriting Design) */}
        {toastVisible && (
          <ReAnimated.View entering={FadeInUp} exiting={FadeOutUp} style={styles.handwritingToastContainer}>
            <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.handwritingToastInner}>
              <Feather name="check-circle" size={20} color="#FFF" />
              <Text style={styles.handwritingToastText}>{toastMsg}</Text>
            </LinearGradient>
          </ReAnimated.View>
        )}

        {/* ⏳ Global Saving Overlay */}
        {isSavingVerse && (
          <View style={styles.savingOverlay}>
            <View style={[styles.savingBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)' }]}>
              <ActivityIndicator size="large" color="#C8A951" />
              <Text style={[styles.savingText, { color: isDark ? '#FFF' : '#333' }]}>
                {lang === 'ar' ? 'جاري حفظ الملف...' : 'Saving file...'}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (!remoteSettingsReady) return null;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#121212" : "#F8F8F8", paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={{ paddingTop: 8 }}>
        {remoteControls.bible_search && <View style={[styles.searchContainer, { marginBottom: 10 }]}>
          <Feather name="search" size={18} color="#C8A951" />
          <TextInput
            style={[
              styles.searchInput,
              { color: isDark ? "#FFF" : "#333", textAlign: 'right', fontSize: 14 },
              currentKbLang === 'cb' && { fontFamily: 'CSAvaVeni-Regular', fontSize: 20 }
            ]}
            placeholder={t.bible.search_placeholder}
            placeholderTextColor="#888"
            value={inputText}
            onChangeText={setInputText}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setKbVisible(true);
            }}
          />


          {inputText.length > 0 && (
            <TouchableOpacity onPress={() => { setInputText(''); setSearchQuery(''); }} style={{ marginLeft: 5 }}>
              <Feather name="x" size={16} color="#888" />
            </TouchableOpacity>
          )}
        </View>}

        {/* 🎯 Search Scope Selector */}
        {remoteControls.bible_search && kbVisible && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeContainer}>
            <TouchableOpacity
              style={[styles.scopeChip, searchScope === 'all' && styles.activeScopeChip]}
              onPress={() => { triggerHaptic(); setSearchScope('all'); }}
            >
              <Text style={[styles.scopeText, searchScope === 'all' && styles.activeScopeText]}>
                {remoteSettings.labels.button_bible_scope_all.trim() || (lang === 'ar' ? 'الكل' : 'All')}
              </Text>
            </TouchableOpacity>
            {OLD_TESTAMENT_AVAILABLE && remoteControls.bible_old_testament && (
              <TouchableOpacity
                style={[styles.scopeChip, searchScope === 'old' && styles.activeScopeChip]}
                onPress={() => { triggerHaptic(); setSearchScope('old'); }}
              >
                <Text style={[styles.scopeText, searchScope === 'old' && styles.activeScopeText]}>
                  {remoteSettings.labels.button_bible_scope_old.trim() || (lang === 'ar' ? 'العهد القديم' : 'Old Testament')}
                </Text>
              </TouchableOpacity>
            )}
            {remoteControls.bible_new_testament && <TouchableOpacity
              style={[styles.scopeChip, searchScope === 'new' && styles.activeScopeChip]}
              onPress={() => { triggerHaptic(); setSearchScope('new'); }}
            >
              <Text style={[styles.scopeText, searchScope === 'new' && styles.activeScopeText]}>
                  {remoteSettings.labels.button_bible_scope_new.trim() || (lang === 'ar' ? 'العهد الجديد' : 'New Testament')}
              </Text>
            </TouchableOpacity>}
            {DEUTEROCANON_AVAILABLE && remoteControls.bible_deuterocanonical && (
              <TouchableOpacity
                style={[styles.scopeChip, searchScope === 'deutero' && styles.activeScopeChip]}
                onPress={() => { triggerHaptic(); setSearchScope('deutero'); }}
              >
                <Text style={[styles.scopeText, searchScope === 'deutero' && styles.activeScopeText]}>
                  {remoteSettings.labels.button_bible_scope_deuterocanonical.trim() || (lang === 'ar' ? 'الأسفار القانونية الثانية' : 'Deuterocanon')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.scopeChip, searchScope === 'book' && styles.activeScopeChip]}
              onPress={() => {
                triggerHaptic();
                setShowBookPicker(true);
              }}
            >
              <Text style={[styles.scopeText, searchScope === 'book' && styles.activeScopeText]}>
                {(selectedBook || (searchBookId ? allBibleBooks.find(b => b.num === searchBookId) : null))
                  ? `${remoteSettings.labels.button_bible_scope_book.trim() || t.bible.book_label}: ${getBookTitle((selectedBook || allBibleBooks.find(b => b.num === searchBookId)), lang)}`
                  : remoteSettings.labels.button_bible_scope_book.trim() || t.bible.select_book}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {!kbVisible && searchQuery.length === 0 && (
          <View style={styles.tabsContainer}>
            {remoteControls.bible_old_testament && <TouchableOpacity
              style={[styles.tabBtn, activeTestament === "old" && styles.activeTabBtn]}
              onPress={() => {
                triggerHaptic();
                setActiveTestament("old");
                setIsDeuteroVisible(false);
              }}
            >
              <Text style={[styles.tabText, activeTestament === "old" && styles.activeTabText]}>{remoteSettings.labels.button_bible_scope_old.trim() || t.bible.old_testament}</Text>
            </TouchableOpacity>}
            {remoteControls.bible_new_testament && <TouchableOpacity
              style={[styles.tabBtn, activeTestament === "new" && styles.activeTabBtn]}
              onPress={() => { triggerHaptic(); setActiveTestament("new"); setIsDeuteroVisible(false); }}
            >
              <Text style={[styles.tabText, activeTestament === "new" && styles.activeTabText]}>{remoteSettings.labels.button_bible_scope_new.trim() || t.bible.new_testament}</Text>
            </TouchableOpacity>}
          </View>
        )}
      </View>
      {isLoading ? (
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#C8A951" /></View>
      ) : searchQuery.trim().length > 0 ? (
        <View style={{ flex: 1 }}>
          {isSearchingVerses && (
            <View style={{ padding: 10, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#C8A951" />
            </View>
          )}
          <FlatList
            data={displayedResults}
            keyExtractor={(item, index) => `res_${index}`}
            contentContainerStyle={{ paddingBottom: 40 }}
            initialNumToRender={10}
            maxToRenderPerBatch={5}
            windowSize={3}
            removeClippedSubviews={true}
            updateCellsBatchingPeriod={50}
            ListHeaderComponent={() => (
              <View style={[styles.resultsHeading, { backgroundColor: isDark ? '#211F1B' : '#FFFDF8', borderColor: isDark ? 'rgba(200,169,81,0.2)' : '#EEE8D9' }]}>
                <View style={styles.resultsHeadingIcon}><Feather name="book-open" size={17} color="#8B0000" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#E6C96E' : '#8B0000', textAlign: isRTL ? 'left' : 'right', marginBottom: 0 }]}>{t.bible.search_results}</Text>
                  <Text style={[styles.resultsCount, { color: isDark ? '#AAA49A' : '#817B70', textAlign: isRTL ? 'left' : 'right' }]}>{globalResults.length} {lang === 'ar' ? 'آية مطابقة' : 'matching verses'}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={() => !isSearchingVerses ? (
              <View style={styles.noResultsContainer}>
                <View style={styles.noResultsIconCircle}>
                  <Feather name="search" size={40} color="rgba(139,0,0,0.3)" />
                </View>
                <Text style={styles.noResultsText}>
                  {t.noResults}
                </Text>
              </View>
            ) : null}
            ListFooterComponent={() => (
              visibleResultsCount < globalResults.length ? (
                <TouchableOpacity
                  onPress={() => setVisibleResultsCount(prev => prev + 50)}
                  style={styles.loadMoreBtn}
                >
                  <LinearGradient
                    colors={['#C8A951', '#8B0000']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.loadMoreGradient}
                  >
                    <Text style={styles.loadMoreText}>
                      {t.bible.show_more}
                    </Text>
                    <Feather name="chevron-down" size={18} color="#FFF" />
                  </LinearGradient>
                </TouchableOpacity>
              ) : null
            )}
            renderItem={renderVerseResult}
          />
        </View>
      ) : !kbVisible ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
          {isDeuteroVisible ? (
            <>
              <TouchableOpacity
                style={[styles.deuteroBackBtn, { backgroundColor: isDark ? "#252525" : "#EEE" }]}
                onPress={() => { triggerHaptic(); setIsDeuteroVisible(false); }}
              >
                <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={18} color="#C8A951" />
                <Text style={[styles.deuteroBackText, { color: isDark ? "#CCC" : "#666" }]}>
                  {t.bible.back_to_books}
                </Text>
              </TouchableOpacity>
              {allBibleBooks.filter(b => b.testament === 'deutero' && isBibleBookVisible(b)).map((item, index) => (
                <BookItem key={item.id} item={item} index={index} isDark={isDark} lang={lang} isRTL={isRTL} onPress={loadBook} />
              ))}
            </>
          ) : (
            <>
              {remoteControls[activeTestament === 'old' ? 'bible_old_testament' : 'bible_new_testament'] && allBibleBooks.filter(b => b.testament === activeTestament && isBibleBookVisible(b)).map((item, index) => (
                <BookItem key={item.id} item={item} index={index} isDark={isDark} lang={lang} isRTL={isRTL} onPress={loadBook} />
              ))}
              {activeTestament === 'old' && remoteControls.bible_deuterocanonical && (
                <TouchableOpacity
                  style={styles.deuteroEntryBtn}
                  onPress={() => {
                    triggerHaptic();
                    if (DEUTEROCANON_AVAILABLE) setIsDeuteroVisible(true);
                    else setShowDeuteroNotice(true);
                  }}
                >
                  <LinearGradient
                    colors={['#8B0000', '#C8A951']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.deuteroEntryGradient}
                  >
                    <Text style={styles.deuteroEntryText}>
                      {t.bible.deutero_books}
                    </Text>
                    <Feather name="chevron-left" size={20} color="#FFF" style={{ transform: [{ rotate: isRTL ? '0deg' : '180deg' }] }} />
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="search" size={40} color="rgba(200,169,81,0.2)" />
          <Text style={{ color: '#888', marginTop: 10, fontFamily: 'Inter_500Medium' }}>
            {t.bible.search_hint}
          </Text>
        </View>
      )}

      {/* 🔔 Toast Success (Exact Handwriting Design) */}
      {toastVisible && (
        <ReAnimated.View
          entering={FadeInUp}
          exiting={FadeOutUp}
          style={styles.handwritingToastContainer}
        >
          <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.handwritingToastInner}>
            <Feather name="check-circle" size={20} color="#FFF" />
            <Text style={styles.handwritingToastText}>{toastMsg}</Text>
          </LinearGradient>
        </ReAnimated.View>
      )}

      {/* ⏳ Global Saving Overlay */}
      {isSavingVerse && (
        <View style={styles.savingOverlay}>
          <View style={[styles.savingBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)' }]}>
            <ActivityIndicator size="large" color="#C8A951" />
            <Text style={[styles.savingText, { color: isDark ? '#FFF' : '#333' }]}>
              {t.bible.saving_image}
            </Text>
          </View>
        </View>
      )}
      {/* ⌨️ Custom Bible Keyboard */}
      <CustomKeyboard
        visible={kbVisible}
        onChar={handleChar}
        onBackspace={handleBackspace}
        onClose={() => setKbVisible(false)}
        onLangChange={setCurrentKbLang}
        initialLang={currentKbLang}
      />

      <Modal visible={showDeuteroNotice} transparent animationType="fade" onRequestClose={() => setShowDeuteroNotice(false)}>
        <View style={styles.bibleNoticeOverlay}>
          <View style={[styles.bibleNoticeCard, { backgroundColor: isDark ? '#1A1714' : '#FFFEFA', borderColor: isDark ? 'rgba(200,169,81,0.45)' : '#D8C89B' }]}>
            <LinearGradient
              colors={isDark ? ['#641713', '#351612'] : ['#8B0000', '#5C1711']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bibleNoticeHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            >
              <View style={styles.bibleNoticeIcon}>
                <Feather name="book-open" size={20} color="#F1D98A" />
              </View>
              <Text style={[styles.bibleNoticeTitle, { textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }]}>
                {t.bible.deutero_books}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={lang === 'ar' ? 'إغلاق' : 'Close'}
                onPress={() => setShowDeuteroNotice(false)}
                style={styles.bibleNoticeClose}
              >
                <Feather name="x" size={18} color="#FFF9E8" />
              </TouchableOpacity>
            </LinearGradient>
            <View style={styles.bibleNoticeBody}>
              <View style={[styles.bibleNoticeStatus, { flexDirection: isRTL ? 'row-reverse' : 'row', alignSelf: isRTL ? 'flex-start' : 'flex-end', backgroundColor: isDark ? 'rgba(200,169,81,0.14)' : '#F5EEDB' }]}>
                <Feather name="clock" size={14} color="#A98A3F" />
                <Text style={[styles.bibleNoticeStatusText, { color: isDark ? '#E6C96E' : '#80651F' }]}>
                  {lang === 'ar' ? 'ضمن التحديثات القادمة' : lang === 'fr' ? 'Dans une prochaine mise à jour' : lang === 'de' ? 'In einem zukünftigen Update' : 'Coming in a future update'}
                </Text>
              </View>
              <Text style={[styles.bibleNoticeMessage, { color: isDark ? '#E8E1D4' : '#4A4030', textAlign: lang === 'ar' ? 'right' : 'left', writingDirection: lang === 'ar' ? 'rtl' : 'ltr' }]}>
                {lang === 'ar'
                  ? 'نص الأسفار القانونية الثانية غير متاح حاليًا في النسخة الحالية، سيتم إضافته في التحديثات القادمة للتطبيق.'
                  : lang === 'fr'
                    ? 'Le texte des livres deutérocanoniques n’est pas disponible dans la version actuelle. Il sera ajouté lors d’une prochaine mise à jour de l’application.'
                    : lang === 'de'
                      ? 'Der Text der deuterokanonischen Bücher ist in der aktuellen Version nicht verfügbar. Er wird in einem zukünftigen App-Update hinzugefügt.'
                      : 'The text of the Deuterocanonical books is not available in the current version. It will be added in a future app update.'}
              </Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setShowDeuteroNotice(false)} style={styles.bibleNoticeButton}>
                <Text style={styles.bibleNoticeButtonText}>
                  {lang === 'ar' ? 'حسنًا' : lang === 'fr' ? 'Compris' : lang === 'de' ? 'Verstanden' : 'Got it'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 📖 Search Book Picker Modal */}
      <Modal visible={showBookPicker} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerContent, { backgroundColor: isDark ? "#1E1E1E" : "#FFF" }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: isDark ? "#FFF" : "#8B0000" }]}>
                {t.bible.select_book}
              </Text>
              <TouchableOpacity onPress={() => setShowBookPicker(false)} style={styles.pickerCloseBtn}>
                <Feather name="x" size={20} color={isDark ? "#888" : "#333"} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={allBibleBooks.filter((book) => isBibleBookVisible(book) && (book.testament !== 'deutero' || DEUTEROCANON_AVAILABLE))}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: isDark ? "#333" : "#F0F0F0" }]}
                  onPress={() => {
                    setSearchBookId(item.num);
                    setSearchScope('book');
                    setShowBookPicker(false);
                    if (inputText.trim()) handleGlobalSearch(inputText);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: isDark ? "#CCC" : "#333" }]}>
                    {getBookTitle(item, lang)}
                  </Text>
                  {searchBookId === item.num && <Feather name="check" size={18} color="#C8A951" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  globalResultsSection: { paddingHorizontal: 20, paddingTop: 10 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#C8A951", marginBottom: 10, textAlign: 'right' },
  scopeContainer: {
    paddingHorizontal: 20,
    paddingBottom: 15,
    gap: 8,
  },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeScopeChip: {
    backgroundColor: 'rgba(200,169,81,0.1)',
    borderColor: '#C8A951',
  },
  scopeText: {
    fontSize: 12,
    fontFamily: 'Cairo_600SemiBold',
    color: '#888',
  },
  activeScopeText: {
    color: '#C8A951',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  bibleNoticeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,7,5,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  bibleNoticeCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  bibleNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 17,
    gap: 11,
  },
  bibleNoticeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(241,217,138,0.36)',
  },
  bibleNoticeTitle: {
    flex: 1,
    color: '#FFF9E8',
    fontFamily: 'Cairo_700Bold',
    fontSize: 16,
    textAlign: 'right',
  },
  bibleNoticeClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  bibleNoticeBody: {
    paddingHorizontal: 20,
    paddingTop: 19,
    paddingBottom: 20,
    gap: 17,
  },
  bibleNoticeStatus: {
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  bibleNoticeStatusText: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 12,
  },
  bibleNoticeMessage: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 14,
    lineHeight: 27,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bibleNoticeButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: '#8B0000',
    borderWidth: 1,
    borderColor: '#A98A3F',
  },
  bibleNoticeButtonText: {
    color: '#FFF9E8',
    fontFamily: 'Cairo_700Bold',
    fontSize: 14,
  },
  pickerContent: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 20,
    overflow: 'hidden',
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,169,81,0.2)',
  },
  pickerTitle: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 18,
  },
  pickerCloseBtn: {
    padding: 5,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
  },
  verseResultCard: {
    padding: 15,
    borderRadius: 16,
    marginBottom: 11,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  resultTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  resultsHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 8, marginBottom: 14, padding: 14, borderRadius: 15, borderWidth: 1 },
  resultsHeadingIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(139,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  resultsCount: { fontFamily: 'Cairo_400Regular', fontSize: 12, marginTop: 2 },
  verseResultHeader: { fontFamily: "Cairo_700Bold", fontSize: 14, marginBottom: 0 },
  verseResultText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, writingDirection: 'ltr' },
  verseResultTextSmall: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  dividerSearch: { height: 1, backgroundColor: 'rgba(200,169,81,0.2)', marginVertical: 15 },
  container: { flex: 1 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(200,169,81,0.1)',
    marginHorizontal: 20,
    paddingHorizontal: 15,
    borderRadius: 12,
    height: 45,
    marginBottom: 15,
  },
  searchInput: { flex: 1, marginHorizontal: 8, fontFamily: "Cairo_600SemiBold" },
  loadMoreBtn: { marginHorizontal: 20, marginTop: 10, borderRadius: 12, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, marginBottom: 20 },
  loadMoreGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 10 },
  loadMoreText: { color: '#FFF', fontFamily: "Cairo_700Bold", fontSize: 14 },
  noResultsContainer: { padding: 40, alignItems: 'center', marginTop: 20 },
  noResultsIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(200,169,81,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  noResultsText: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#8B0000", textAlign: 'center' },
  noResultsSubText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#888", textAlign: 'center', marginTop: 8 },
  toastContainer: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    zIndex: 9999,
  },
  toastGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  toastText: { color: '#C8A951', fontFamily: "Cairo_700Bold", fontSize: 14, marginLeft: 10 },
  handwritingToastContainer: { position: 'absolute', top: 100, left: 20, right: 20, zIndex: 9999 },
  handwritingToastInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 15, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  handwritingToastText: { color: '#FFF', fontFamily: 'Cairo_700Bold', fontSize: 14 },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  savingBox: {
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    gap: 15,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  savingText: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 16,
  },
  hiddenPosterContainer: { position: "absolute", top: 5000, left: 0, opacity: 0.01 },
  poster: { width: 600, minHeight: 1000, backgroundColor: "#150505", overflow: 'hidden' },
  posterGradient: { flex: 1, padding: 40, justifyContent: 'space-between', alignItems: 'center' },
  posterFrame: { position: "absolute", top: 20, bottom: 20, left: 20, right: 20, borderWidth: 1.5, borderColor: "#B8934E", borderRadius: 30, opacity: 0.25 },
  posterHeader: { alignItems: 'center', width: '100%' },
  posterLogo: { width: 76, height: 76, marginBottom: 4 },
  copticNameCapture: { width: 360, height: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  posterAppName: { color: "#B8934E", fontSize: 65, fontFamily: "CSAvaVeni-Regular", textAlign: 'center' },
  posterAppSub: { color: "#FFF", fontSize: 16, fontFamily: "Cinzel_700Bold", letterSpacing: 4, marginTop: -5, textAlign: 'center' },
  posterContentArea: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%', paddingVertical: 20 },
  posterBibleRef: { color: "#FFF", fontSize: 44, fontFamily: "Cairo_700Bold", textAlign: 'center' },
  posterLine: { width: 400, height: 1.5, backgroundColor: "#B8934E", opacity: 0.2, marginVertical: 15 },
  posterVersesWrap: { width: '100%', paddingHorizontal: 10 },
  posterTextAr: { color: "#FFF", fontFamily: "Cairo_700Bold", lineHeight: 52 },
  posterTextEn: { color: "#DDD", fontFamily: "Inter_700Bold", lineHeight: 38 },
  posterTextCb: { color: "#FFF", fontFamily: "ava_arsany", lineHeight: 52 },
  posterFooter: { alignItems: 'center', width: '100%', paddingTop: 20 },
  posterQRContainer: { padding: 10, backgroundColor: "#FFF", borderRadius: 15, marginBottom: 15 },
  posterBottomPromo: { color: "#B8934E", fontSize: 15, fontFamily: "Cairo_700Bold", fontWeight: "bold", opacity: 0.8 },
  posterBottomCredit: { color: "#B8934E", fontSize: 14, fontFamily: "Cairo_700Bold", fontWeight: "bold", opacity: 0.7, marginTop: 4 },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 15,
    backgroundColor: 'rgba(200,169,81,0.15)',
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTabBtn: { backgroundColor: '#8B0000' },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: '#8B0000' },
  activeTabText: { color: '#FFF' },
  oldTestamentTabBtn: { backgroundColor: '#F8F1DE', borderWidth: 1, borderColor: '#D9C58A' },
  oldTestamentTabContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' },
  oldTestamentTabText: { color: '#72591E', fontFamily: 'Cairo_700Bold', fontSize: 13 },
  comingSoonBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: '#EDE0B9', borderWidth: 1, borderColor: '#D7C17B' },
  comingSoonBadgeText: { color: '#755B1C', fontFamily: 'Cairo_700Bold', fontSize: 9 },
  booksList: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  bookCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 15,
    borderRadius: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  bookIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 15,
  },
  bookIconText: { fontSize: 18, fontWeight: 'bold', color: '#8B0000' },
  bookTitleCoptic: { fontFamily: "CSAvaVeni-Regular", fontSize: 18, marginBottom: 2 },
  bookTitleAr: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,169,81,0.2)',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  headerSub: { fontFamily: "CSAvaVeni-Regular", fontSize: 14 },
  chaptersGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 15, gap: 12, justifyContent: 'center' },
  chapterBox: {
    width: (width - 60) / 4,
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  chapterBoxText: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  chapterBoxLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 10, marginTop: -2 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  versesList: { padding: 15, gap: 15, paddingBottom: 120 },
  verseContainer: { padding: 15, borderRadius: 15, borderWidth: 1 },
  verseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  verseNumberBadge: { backgroundColor: '#8B0000', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  verseNumberText: { color: '#FFF', fontFamily: "Inter_700Bold", fontSize: 12 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyBtnText: { fontSize: 12, fontFamily: "Cairo_700Bold" },
  verseContent: { marginTop: 5 },
  // Coptic is shaped left-to-right; keep right alignment without applying RTL bidi to combining marks.
  copticText: { fontFamily: "ava_arsany", textAlign: 'right', writingDirection: 'ltr', lineHeight: 32 },
  divider: { height: 1, backgroundColor: 'rgba(200,169,81,0.1)', marginVertical: 10 },
  latinText: { fontFamily: "Inter_700Bold", textAlign: 'right', writingDirection: 'rtl', lineHeight: 22 },
  arabicText: { fontFamily: "Cairo_700Bold", textAlign: 'left', writingDirection: 'ltr', lineHeight: 30, marginTop: 5 },
  tableHeaderRow: { flexDirection: 'row', borderWidth: 1, borderBottomWidth: 2 },
  tableHeaderVerseCell: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tableHeaderLanguageCell: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderLeftWidth: 1, borderTopWidth: 3 },
  tableHeaderText: { fontFamily: 'Cairo_700Bold', fontSize: 12, textAlign: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'stretch' },
  tableVerseCell: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 7, borderRightWidth: 1, borderBottomWidth: 1 },
  tableVerseBadge: { minWidth: 30, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tableVerseNumber: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  tableVerseActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tableTranslationCell: { paddingHorizontal: 10, paddingVertical: 9, minHeight: 64, justifyContent: 'flex-start', borderRightWidth: 1, borderBottomWidth: 1 },
  tableTranslationText: { flexShrink: 1, alignSelf: 'stretch', width: '100%', marginTop: 0 },
  controlsBar: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,169,81,0.15)',
    gap: 8,
  },
  layoutModeRow: { alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  layoutModeGroup: { flex: 1, alignItems: 'center', gap: 4, padding: 3, borderRadius: 11, backgroundColor: 'rgba(200,169,81,0.10)' },
  layoutModeButton: { flex: 1, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, borderRadius: 8 },
  layoutModeButtonActive: { backgroundColor: '#8B0000' },
  layoutModeText: { fontFamily: 'Cairo_600SemiBold', fontSize: 10 },
  langChipsWrap: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 4,
  },
  langChip: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0, // تقسيم متساوي حقيقي بغض النظر عن المحتوى
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  langChipText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 9,
    textAlign: 'center',
  },
  langChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8A951',
    marginLeft: 2,
  },
  controlsRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  diacriticsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  diacriticsBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
  controlGroup: {
    alignItems: 'center',
    gap: 4,
  },
  controlLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: "#888",
    marginBottom: -2,
  },

  fontSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(200,169,81,0.08)',
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  fontBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    minWidth: 20,
    textAlign: 'center',
  },
  deuteroEntryBtn: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#8B0000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  deuteroEntryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  deuteroEntryText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: '#FFF',
  },
  deuteroBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 5,
    alignSelf: 'flex-start',
    gap: 8,
  },
  deuteroBackText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
  },
  transLabel: {
    width: 90, // توحيد العرض ليكونوا "نفس حذاء بعض"
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transLabelText: {
    fontFamily: "Cairo_900Black",
    fontSize: 14,
    textAlign: 'center',
  },
  linkBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    height: 60,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 15,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  controlBtn: { padding: 8 },
  controlText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: '#888' },
  activeControl: { color: '#8B0000' },
  fontSizeRow: { flexDirection: 'row', alignItems: 'center' },
  fontSizeVal: { marginHorizontal: 5, fontFamily: "Cairo_700Bold", fontSize: 13 },
  verseJumpBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,169,81,0.15)',
  },
  verseJumpLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    marginLeft: 15,
    marginRight: 10,
  },
  verseJumpContent: {
    paddingRight: 20,
    gap: 8,
  },
  verseJumpBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200,169,81,0.2)',
  },
  verseJumpText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#C8A951",
  },
  versePickerText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
  },
  bottomSheetContent: {
    width: '100%',
    height: '70%',
    marginTop: 'auto',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    paddingHorizontal: 20,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  sheetHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#DDD',
    borderRadius: 3,
    marginBottom: 15,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 5,
  },
  sheetCloseBtn: {
    padding: 5,
  },
  verseGridContainer: {
    paddingBottom: 80,
    paddingHorizontal: 20, // زيادة الهوامش الجانبية لإبعاد الدوائر عن الحواف
  },
  verseGridRow: {
    justifyContent: 'center',
    gap: 15,
    marginBottom: 15,
  },
  modernVerseBox: {
    width: (width - 130) / 4, // تصغير الحجم لضمان عدم الالتصاق بالحواف
    aspectRatio: 1,
    borderRadius: 100, // Perfectly round
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernVerseText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },

});

export default CopticBibleScreen;
