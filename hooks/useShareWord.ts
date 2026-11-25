import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { captureRef } from "react-native-view-shot";
import type { DictionaryEntry } from "@/hooks/useDictionary";
import { downloadAndSaveAudio, getAudioLocalPath } from "@/hooks/useOfflineStorage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translateTerm, type Lang } from "@/contexts/LanguageContext";

export interface SaveFileNameOptions {
  lang: Lang;
  displayMeaning?: string;
}

// ─── اسم الفولدر الثابت ───────────────────────────────────────────────────────
const FOLDER_NAME = "ⲭⲏⲙⲓ Coptic Dictionary";

// ─── مفتاح حفظ URI الفولدر في AsyncStorage ───────────────────────────────────
const SAF_EXPORT_URI_KEY = "@khmi/export_folder_uri_v1";

// ─── نوع النتيجة ──────────────────────────────────────────────────────────────
export type SaveResult =
  | { ok: true; type: "image" | "audio"; fileName: string }
  | { ok: false; reason: "no_audio" | "no_ref" | "capture_failed" | "save_failed" | "audio_unavailable" | "no_local_file" };

// ─── مساعدات ──────────────────────────────────────────────────────────────────

function generateFileName(entry: DictionaryEntry, options?: SaveFileNameOptions): string {
  const lang = options?.lang || "ar";

  let meaning = options?.displayMeaning || "";
  if (!meaning) {
    switch (lang) {
      case "en": meaning = entry.english || entry.arabic || ""; break;
      case "fr": meaning = entry.french || entry.arabic || ""; break;
      case "de": meaning = entry.german || entry.arabic || ""; break;
      default: meaning = entry.arabic || ""; break;
    }
  }
  // أخذ المعنى الأول فقط بناءً على طلب المستخدم
  meaning = meaning.split(/[,،\n]/)[0].trim();

  const parts: string[] = [];

  // الكلمة القبطية أو التي بحث بها
  if (entry.coptic) {
    parts.push(entry.coptic);
  }

  // نتيجة البحث فقط من المعنى
  if (meaning) {
    parts.push(meaning);
  }

  // النوع
  if (entry.gender) {
    parts.push(translateTerm(entry.gender, lang));
  } else if (entry.wordType) {
    parts.push(translateTerm(entry.wordType, lang));
  }

  // الأصل
  if (entry.origin) {
    parts.push(translateTerm(entry.origin, lang));
  }

  // اسم Ebram merzik في النهاية
  parts.push("Ebram Merzik");

  // تنظيف الاسم من الحروف غير المسموحة في أسماء الملفات وجعل المسافات للأسفل
  const cleanParts = parts.filter(Boolean).map(p =>
    p.replace(/[<>:"/\\|?*]/g, "").trim().replace(/\s+/g, "_")
  );

  return cleanParts.join("_").slice(0, 150) || "khmi_word_Ebram_Merzik";
}

// ─── التحقق من صلاحية SAF URI (قد تنتهي صلاحيته بعد restart) ────────────────
async function isSafUriValid(uri: string): Promise<boolean> {
  try {
    await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

// ─── الحصول على URI الفولدر — يسأل المستخدم مرة واحدة فقط ───────────────────
async function getOrCreateExportFolder(): Promise<string | null> {
  // 1) جرب المحفوظ أولاً
  try {
    const saved = await AsyncStorage.getItem(SAF_EXPORT_URI_KEY);
    if (saved && await isSafUriValid(saved)) {
      return saved;
    }
    // انتهت صلاحيته — احذفه
    if (saved) await AsyncStorage.removeItem(SAF_EXPORT_URI_KEY);
  } catch { }

  // 2) اطلب من المستخدم اختيار مجلد (يظهر dialog مرة واحدة)
  try {
    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) return null;

    const parentUri = result.directoryUri;

    // 3) ابحث عن فولدر بنفس الاسم موجود مسبقاً
    try {
      const children = await FileSystem.StorageAccessFramework.readDirectoryAsync(parentUri);
      // SAF URIs بتحتوي على اسم الفولدر encode فيها
      const existing = children.find((uri) =>
        decodeURIComponent(uri).includes(FOLDER_NAME.replace(/ /g, "%20")) ||
        decodeURIComponent(uri).endsWith(FOLDER_NAME)
      );
      if (existing) {
        await AsyncStorage.setItem(SAF_EXPORT_URI_KEY, existing);
        return existing;
      }
    } catch { }

    // 4) أنشئ الفولدر بالاسم المطلوب
    const folderUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(
      parentUri,
      FOLDER_NAME
    );

    await AsyncStorage.setItem(SAF_EXPORT_URI_KEY, folderUri);
    return folderUri;
  } catch {
    return null;
  }
}

// ─── كتابة ملف في فولدر SAF من base64 ───────────────────────────────────────
async function writeFileToSafFolder(
  folderUri: string,
  fileName: string,
  base64Data: string,
  mimeType: string
): Promise<boolean> {
  try {
    // احذف الملف القديم بنفس الاسم إن وجد (تجنب التكرار)
    try {
      const children = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
      const existing = children.find((uri) => decodeURIComponent(uri).includes(fileName));
      if (existing) {
        await FileSystem.deleteAsync(existing, { idempotent: true });
      }
    } catch { }

    // أنشئ الملف الجديد
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      folderUri,
      fileName,
      mimeType
    );

    // اكتب المحتوى
    await FileSystem.writeAsStringAsync(fileUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return true;
  } catch {
    return false;
  }
}

// ─── Fallback: MediaLibrary لو SAF فشل ───────────────────────────────────────
async function saveViaMediaLibrary(
  tempPath: string,
  type: "image" | "audio"
): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") return false;
    const asset = await MediaLibrary.createAssetAsync(tempPath);
    if (type === "audio") {
      try {
        const albums = await MediaLibrary.getAlbumsAsync();
        const album = albums.find((a) => a.title === FOLDER_NAME);
        if (!album) {
          await MediaLibrary.createAlbumAsync(FOLDER_NAME, asset, false);
        } else {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        }
      } catch { }
    }
    return true;
  } catch {
    return false;
  }
}

// ─── تحميل الصوت — بالكامل offline ──────────────────────────────────────────
export async function downloadAudio(
  entry: DictionaryEntry,
  options?: SaveFileNameOptions
): Promise<SaveResult> {
  if (!entry.audioUrl) return { ok: false, reason: "no_audio" };

  // ── ويب ──────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    try {
      const response = await fetch(entry.audioUrl, { redirect: "follow" });
      if (!response.ok) return { ok: false, reason: "audio_unavailable" };
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${generateFileName(entry, options)}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { ok: true, type: "audio", fileName: a.download };
    } catch {
      return { ok: false, reason: "audio_unavailable" };
    }
  }

  // ── موبايل: استخدم النسخة المحلية إن وجدت، وإلا نزّل هذا الصوت وحده من رابطه ──
  const audioId = entry.audioId || entry.id;
  const localPath = getAudioLocalPath(audioId);
  let localInfo = await FileSystem.getInfoAsync(localPath);

  if (!localInfo.exists || (localInfo as any).size < 1024) {
    if (!await downloadAndSaveAudio(audioId, entry.audioUrl)) {
      return { ok: false, reason: "audio_unavailable" };
    }
    localInfo = await FileSystem.getInfoAsync(localPath);
  }

  if (!localInfo.exists || (localInfo as any).size < 128) {
    return { ok: false, reason: "audio_unavailable" };
  }

  try {
    const fileName = `${generateFileName(entry, options)}.mp3`;

    // اقرأ الملف كـ base64
    const base64Data = await FileSystem.readAsStringAsync(localPath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // احفظ في فولدر Downloads/ⲭⲏⲙⲓ Coptic Dictionary
    const folderUri = await getOrCreateExportFolder();
    if (folderUri) {
      const written = await writeFileToSafFolder(folderUri, fileName, base64Data, "audio/mpeg");
      if (written) return { ok: true, type: "audio", fileName };
    }

    // Fallback: MediaLibrary
    const tmpPath = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(tmpPath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const saved = await saveViaMediaLibrary(tmpPath, "audio");
    return saved
      ? { ok: true, type: "audio", fileName }
      : { ok: false, reason: "save_failed" };

  } catch {
    return { ok: false, reason: "save_failed" };
  }
}

// ─── حفظ البطاقة كصورة — بالكامل offline ────────────────────────────────────
export async function screenshotWordCard(
  entry: DictionaryEntry,
  viewRef?: React.RefObject<any>,
  options?: SaveFileNameOptions
): Promise<SaveResult> {
  // ── ويب ──────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    // Desktop: capture the same card view the phone captures, then download it.
    try {
      if (viewRef?.current) {
        const html2canvas = (await import("html2canvas")).default;
        const root = viewRef.current as HTMLElement;
        // html2canvas breaks Arabic letter joining when letter-spacing is set; neutralise it while capturing.
        const touched: [HTMLElement, string][] = [];
        root.querySelectorAll("*").forEach((n: any) => { touched.push([n, n.style.letterSpacing]); n.style.letterSpacing = "normal"; });
        let canvas: HTMLCanvasElement;
        try { canvas = await html2canvas(root, { backgroundColor: null, scale: 2, useCORS: true }); }
        finally { touched.forEach(([n, v]) => { n.style.letterSpacing = v; }); }
        const dataUri = canvas.toDataURL("image/png");
        if (dataUri) {
          const a = document.createElement("a");
          a.href = dataUri; a.download = `${generateFileName(entry, options)}.png`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          return { ok: true, type: "image", fileName: a.download };
        }
      }
    } catch (e) { console.log("card capture failed, using fallback", e); }
    await generateCardImageWeb(entry, options);
    return { ok: true, type: "image", fileName: `${generateFileName(entry, options)}.png` };
  }

  if (!viewRef?.current) return { ok: false, reason: "no_ref" };

  // التقاط الصورة من الـ view
  let tmpUri: string;
  try {
    tmpUri = await captureRef(viewRef, {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });
  } catch {
    return { ok: false, reason: "capture_failed" };
  }

  if (!tmpUri) return { ok: false, reason: "capture_failed" };

  try {
    const fileName = `${generateFileName(entry, options)}.png`;

    // نقل/نسخ الصورة إلى ملف جديد يحمل الاسم المطلوب قبل حفظه في المعرض
    const newTmpUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.copyAsync({ from: tmpUri, to: newTmpUri });

    // حفظ الصورة في معرض الصور مباشرة (MediaLibrary) باستخدام المسار الجديد بالاسم المخصص
    const saved = await saveViaMediaLibrary(newTmpUri, "image");

    // إذا فشل الحفظ في المعرض، الملاذ الأخير هو المشاركة
    if (saved) {
      return { ok: true, type: "image", fileName };
    } else {
      // Fallback: Sharing it directly if save to gallery fails
      const Sharing = require("expo-sharing");
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newTmpUri, { mimeType: "image/png", dialogTitle: "حفظ البطاقة" });
        return { ok: true, type: "image", fileName };
      }
      return { ok: false, reason: "save_failed" };
    }

  } catch {
    return { ok: false, reason: "capture_failed" };
  }
}

// ─── تحديث رسالة Toast لحالة "no_local_file" ─────────────────────────────────
// ملاحظة: في WordDetailModal أضف هذه الحالة في resultToToast:
//   case "no_local_file":
//     return { success: false, icon: "download-cloud", message: "الملف الصوتي غير محمّل", sub: "حمّل الصوتيات أولاً من قائمة التزامن" };

// ─── صورة الويب — Canvas جودة عالية ─────────────────────────────────────────
async function generateCardImageWeb(entry: DictionaryEntry, options?: SaveFileNameOptions): Promise<void> {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#1A1A1A"); bgGrad.addColorStop(1, "#0D0D0D");
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

  const cardX = 60, cardY = 80, cardW = W - 120, cardH = H - 160;
  ctx.fillStyle = "#1E1E1E"; roundedRect(ctx, cardX, cardY, cardW, cardH, 40); ctx.fill();
  ctx.strokeStyle = "rgba(200,169,81,0.35)"; ctx.lineWidth = 2;
  roundedRect(ctx, cardX, cardY, cardW, cardH, 40); ctx.stroke();

  const barH = 110;
  const barGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
  barGrad.addColorStop(0, "#8B0000"); barGrad.addColorStop(1, "#6B0000");
  ctx.fillStyle = barGrad;
  roundedRect(ctx, cardX, cardY, cardW, barH, { tl: 40, tr: 40, br: 0, bl: 0 });
  ctx.fill();

  ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 38px serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("ⲭⲏⲙⲓ", W / 2, cardY + barH / 2 - 6);
  ctx.fillStyle = "rgba(200,169,81,0.9)"; ctx.font = "16px Arial";
  ctx.fillText("COPTIC DICTIONARY", W / 2, cardY + barH / 2 + 22);

  ctx.strokeStyle = "rgba(200,169,81,0.5)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cardX + 60, cardY + barH + 1);
  ctx.lineTo(cardX + cardW - 60, cardY + barH + 1); ctx.stroke();

  let y = cardY + barH + 80;

  if (entry.coptic) {
    ctx.fillStyle = "#C8A951"; ctx.font = "bold 90px serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(entry.coptic, W / 2, y); y += 70;
    ctx.fillStyle = "rgba(200,169,81,0.4)"; ctx.fillRect(W / 2 - 50, y, 100, 2); y += 30;
  }

  if (entry.arabic) {
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 46px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const arabic = entry.arabic.length > 30 ? entry.arabic.slice(0, 30) + "..." : entry.arabic;
    ctx.fillText(arabic, W / 2, y); y += 60;
  }

  const tags: { label: string; value: string; color: string }[] = [];
  if (entry.wordType) tags.push({ label: "نوع الكلمة", value: entry.wordType, color: "#5B9BD5" });
  if (entry.origin) tags.push({ label: "الأصل", value: entry.origin, color: "#C8A951" });
  if (entry.gender) tags.push({ label: "النوع", value: entry.gender, color: "#CC4444" });

  if (tags.length > 0) {
    y += 10;
    const tagW = 220, tagH = 80, gap = 20;
    const totalW = tags.length * tagW + (tags.length - 1) * gap;
    let tagX = W / 2 - totalW / 2;
    for (const tag of tags) {
      ctx.fillStyle = tag.color + "18"; roundedRect(ctx, tagX, y, tagW, tagH, 16); ctx.fill();
      ctx.strokeStyle = tag.color + "50"; ctx.lineWidth = 1.5;
      roundedRect(ctx, tagX, y, tagW, tagH, 16); ctx.stroke();
      ctx.fillStyle = tag.color; ctx.font = "bold 22px Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(tag.value, tagX + tagW / 2, y + tagH / 2 - 8);
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "14px Arial";
      ctx.fillText(tag.label, tagX + tagW / 2, y + tagH / 2 + 16);
      tagX += tagW + gap;
    }
    y += tagH + 30;
  }

  const footerY = cardY + cardH - 50;
  ctx.strokeStyle = "rgba(200,169,81,0.2)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cardX + 60, footerY);
  ctx.lineTo(cardX + cardW - 60, footerY); ctx.stroke();
  ctx.fillStyle = "rgba(200,169,81,0.35)"; ctx.font = "14px Arial";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("القاموس القبطي • Coptic Dictionary", W / 2, footerY + 26);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${generateFileName(entry, options)}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | { tl: number; tr: number; br: number; bl: number }
) {
  const rad = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
  ctx.beginPath();
  ctx.moveTo(x + rad.tl, y);
  ctx.lineTo(x + w - rad.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad.tr);
  ctx.lineTo(x + w, y + h - rad.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad.br, y + h);
  ctx.lineTo(x + rad.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad.bl);
  ctx.lineTo(x, y + rad.tl);
  ctx.quadraticCurveTo(x, y, x + rad.tl, y);
  ctx.closePath();
}