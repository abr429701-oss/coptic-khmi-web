import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import { CLOUDFLARE_API_BASE, type CloudflareAdminSession } from "@/lib/cloudflare";
import { invalidateRemoteBibleCache } from "@/lib/bibleRemote";

interface Props { session: CloudflareAdminSession | null; }
const LANGUAGES = ["ar", "en", "gr", "he", "cb", "sy"] as const;
type HistoryRow = { id: string; kind: string; createdAt: number; undoneAt: number | null; count: number };

export function CloudflareBibleAdminPanel({ session }: Props) {
  const [book, setBook] = useState("40");
  const [chapter, setChapter] = useState("1");
  const [verse, setVerse] = useState("1");
  const [language, setLanguage] = useState<string>("ar");
  const [text, setText] = useState("");
  const [bulkJson, setBulkJson] = useState("");
  const [deleteScope, setDeleteScope] = useState<"book" | "testament" | "group">("book");
  const [deleteTestament, setDeleteTestament] = useState("new");
  const [deleteBookIds, setDeleteBookIds] = useState("");
  const [bookTitleAr, setBookTitleAr] = useState("");
  const [bookTitleEn, setBookTitleEn] = useState("");
  const [bookTestament, setBookTestament] = useState("new");
  const [bookOrder, setBookOrder] = useState("77");
  const [bookHidden, setBookHidden] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const request = useCallback(async (path: string, method = "GET", body?: unknown) => {
    if (!session || Date.now() >= session.expiresAt) throw new Error("انتهت جلسة المشرف؛ سجّل الدخول مجددًا.");
    const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
      method,
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), Authorization: `Bearer ${session.token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `فشل طلب Cloudflare (${response.status})`);
    return data;
  }, [session]);

  const loadHistory = useCallback(async () => {
    if (!session) return;
    setLoadingHistory(true);
    try {
      const result = await request("/admin/bible/history");
      setHistory(Array.isArray(result.history) ? result.history : []);
    } catch (error) {
      Alert.alert("سجل الكتاب المقدس", error instanceof Error ? error.message : String(error));
    } finally { setLoadingHistory(false); }
  }, [request, session]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const refreshPreview = async () => {
    const b = Number(book), c = Number(chapter);
    if (!Number.isInteger(b) || b < 1 || !Number.isInteger(c) || c < 1) { Alert.alert("مرجع غير صالح", "أدخل رقم سفر وإصحاح صحيحين."); return; }
    setBusy(true);
    try {
      const result = await request(`/v1/bible/chapter?book=${b}&chapter=${c}`);
      const rows = Array.isArray(result.overrides) ? result.overrides : [];
      setPreviewText(rows.length ? rows.map((row: any) => `${row.verse} · ${row.language}${row.deleted ? " [محذوف]" : ""}: ${row.text || ""}`).join("\n") : "لا توجد تغييرات بعيدة في هذا الإصحاح؛ سيستخدم التطبيق النسخة المحلية.");
    } catch (error) { Alert.alert("تعذر المعاينة", error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const applyChange = async (deleted = false) => {
    const b = Number(book), c = Number(chapter), v = Number(verse);
    if (![b, c, v].every((n) => Number.isInteger(n) && n > 0)) { Alert.alert("مرجع غير صالح", "أدخل أرقام سفر وإصحاح وآية صحيحة."); return; }
    if (!deleted && !text.trim()) { Alert.alert("النص مطلوب", "اكتب نص الآية قبل الحفظ."); return; }
    const commit = async () => {
      setBusy(true);
      try {
        const result = await request("/admin/bible/changes", "POST", { changes: [{ book: b, chapter: c, verse: v, language: deleted ? "*" : language, text: deleted ? "" : text, deleted }] });
        invalidateRemoteBibleCache();
        setPreviewText(`تم حفظ التغيير. رقم العملية: ${result.historyId}`);
        void loadHistory();
        if (!deleted) Alert.alert("تم النشر", "حُفظ تعديل الآية في Cloudflare وسيظهر في التطبيق عند تحديث بيانات الكتاب المقدس.");
      } catch (error) { Alert.alert("تعذر الحفظ", error instanceof Error ? error.message : String(error)); }
      finally { setBusy(false); }
    };
    if (deleted) Alert.alert("تأكيد حذف الآية", `سيتم إخفاء الآية ${b}:${c}:${v} في كل الترجمات البعيدة، مع إمكانية التراجع من سجل التعديلات.`, [{ text: "إلغاء", style: "cancel" }, { text: "إخفاء الآية", style: "destructive", onPress: () => void commit() }]);
    else void commit();
  };

  const importChanges = async () => {
    let parsed: any;
    try { parsed = JSON.parse(bulkJson); }
    catch (error) { Alert.alert("JSON غير صالح", error instanceof Error ? error.message : String(error)); return; }
    const changes: any[] = [];
    const addVerse = (row: any, inheritedBook?: number, inheritedChapter?: number, inheritedLanguage?: string) => {
      const bookId = Number(row.book ?? row.bookId ?? inheritedBook ?? book);
      const chapterNo = Number(row.chapter ?? row.chapterNumber ?? inheritedChapter);
      const verseNo = Number(row.verse ?? row.verseNumber ?? row.number);
      const lang = String(row.language ?? row.lang ?? inheritedLanguage ?? language);
      const verseText = row.text ?? row.content ?? row.value;
      if (Number.isInteger(bookId) && bookId > 0 && Number.isInteger(chapterNo) && chapterNo > 0 && Number.isInteger(verseNo) && verseNo > 0 && verseText !== undefined) {
        changes.push({ book: bookId, chapter: chapterNo, verse: verseNo, language: lang, text: String(verseText), deleted: row.deleted === true });
      }
    };
    const walk = (value: any, inheritedBook?: number, inheritedChapter?: number, inheritedLanguage?: string) => {
      if (Array.isArray(value)) { value.forEach((item) => walk(item, inheritedBook, inheritedChapter, inheritedLanguage)); return; }
      if (!value || typeof value !== "object") return;
      const bookId = Number(value.book ?? value.bookId ?? value.id ?? inheritedBook);
      const chapterNo = Number(value.chapter ?? value.chapterNumber ?? inheritedChapter);
      const lang = String(value.language ?? value.lang ?? inheritedLanguage ?? language);
      if (value.verse !== undefined || value.verseNumber !== undefined || (value.text !== undefined && chapterNo && value.number !== undefined)) {
        addVerse(value, inheritedBook, inheritedChapter, inheritedLanguage); return;
      }
      if (Array.isArray(value.verses)) {
        value.verses.forEach((verseRow: any, index: number) => {
          if (typeof verseRow === "string") addVerse({ chapter: chapterNo, verse: index + 1, text: verseRow, language: lang }, bookId, chapterNo, lang);
          else addVerse(verseRow, bookId, chapterNo, lang);
        });
      }
      if (value.chapters && typeof value.chapters === "object") {
        if (Array.isArray(value.chapters)) value.chapters.forEach((chapterRow: any, index: number) => {
          if (Array.isArray(chapterRow)) chapterRow.forEach((verseRow: any, verseIndex: number) => typeof verseRow === "string" ? addVerse({ chapter: index + 1, verse: verseIndex + 1, text: verseRow, language: lang }, bookId, index + 1, lang) : addVerse({ ...verseRow, chapter: verseRow.chapter ?? index + 1 }, bookId, index + 1, lang));
          else walk({ ...chapterRow, chapter: chapterRow.chapter ?? index + 1 }, bookId, undefined, lang);
        });
        else Object.entries(value.chapters).forEach(([chapterKey, chapterValue]) => walk({ ...(Array.isArray(chapterValue) ? { verses: chapterValue } : chapterValue as any), chapter: Number(chapterKey) || (chapterValue as any)?.chapter }, bookId, undefined, lang));
      }
      if (Array.isArray(value.books)) value.books.forEach((child: any) => walk(child, undefined, undefined, lang));
      if (Array.isArray(value.changes)) value.changes.forEach((child: any) => walk(child, bookId || inheritedBook, chapterNo || inheritedChapter, lang));
      if (!value.verses && !value.chapters && !value.books && !value.changes && Array.isArray(value.data)) walk(value.data, bookId || inheritedBook, chapterNo || inheritedChapter, lang);
    };
    walk(parsed);
    if (!changes.length) { Alert.alert("لم أعثر على آيات", "يدعم الاستيراد مصفوفة الآيات المعتادة [{chapter,verse,text}] للسفر المحدد، أو سجلات تتضمن book، أو كائنًا يضم books/chapters/verses."); return; }
    if (changes.some((row) => ![...LANGUAGES, "*"].includes(row.language) || (!row.deleted && !row.text.trim()))) {
      Alert.alert("بيانات غير مكتملة", "تحقق من النصوص واللغات. اللغات: ar, en, gr, he, cb, sy."); return;
    }
    const unique = new Set(changes.map((row) => `${row.book}:${row.chapter}:${row.verse}:${row.language}`));
    if (unique.size !== changes.length) { Alert.alert("سجلات مكررة", "يحتوي الملف على رقم سفر/إصحاح/آية/لغة مكرر. أزل التكرار قبل الاستيراد."); return; }
    Alert.alert("تأكيد استيراد المحتوى", `تم تحليل ${changes.length} آية من الملف. أي سجل بلا book سيُسند إلى السفر ${book} والترجمة ${language}. تُرسل الدفعات حتى 250 سجلًا، ولكل دفعة سجل تراجع مستقل.`, [
      { text: "إلغاء", style: "cancel" },
      { text: "استيراد", onPress: () => void (async () => {
        setBusy(true); let sent = 0;
        try {
          for (let offset = 0; offset < changes.length; offset += 250) {
            const result = await request("/admin/bible/changes", "POST", { changes: changes.slice(offset, offset + 250) }); sent += result.changed || 0;
          }
          invalidateRemoteBibleCache(); setPreviewText(`اكتمل استيراد ${sent} آية.`); setBulkJson(""); await loadHistory();
          Alert.alert("اكتمل الاستيراد", `تم نشر ${sent} آية. سُجلت كل دفعة منفصلة لإتاحة التراجع.`);
        } catch (error) { Alert.alert("استيراد جزئي", `تم حفظ ${sent} آية قبل الخطأ. ${error instanceof Error ? error.message : String(error)} يمكنك التراجع عن الدفعات المحفوظة من السجل.`); await loadHistory(); }
        finally { setBusy(false); }
      })() },
    ]);
  };

  const hideRemoteBooks = async () => {
    const typedIds = deleteBookIds.split(/[\s,،;]+/).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0 && value <= 999);
    const commit = async () => {
      setBusy(true); let hidden = 0; let versesHidden = 0;
      try {
        const result = await request("/v1/bible/books");
        const books = Array.isArray(result.books) ? result.books : [];
        let targets = books.filter((item: any) => !item.deleted && !item.hidden);
        if (deleteScope === "book") targets = targets.filter((item: any) => Number(item.id) === Number(book));
        else if (deleteScope === "testament") targets = targets.filter((item: any) => item.testament === deleteTestament);
        else targets = targets.filter((item: any) => typedIds.includes(Number(item.id)));
        if (!targets.length) { Alert.alert("لا توجد بيانات بعيدة", "لم أجد أسفارًا بعيدة ظاهرة ضمن هذا النطاق. لا تمس العملية النسخة المحلية أو الملفات الأصلية."); return; }
        for (const item of targets) {
          const remote = await request(`/v1/bible/book?book=${Number(item.id)}`);
          const overrides = (Array.isArray(remote.overrides) ? remote.overrides : []).filter((row: any) => !row.deleted);
          for (let offset = 0; offset < overrides.length; offset += 250) {
            const changes = overrides.slice(offset, offset + 250).map((row: any) => ({ book: Number(item.id), chapter: Number(row.chapter), verse: Number(row.verse), language: String(row.language || "*"), text: "", deleted: true }));
            await request("/admin/bible/changes", "POST", { changes });
            versesHidden += changes.length;
          }
          await request("/admin/bible/book", "POST", { book: { id: Number(item.id), order: Number(item.order) || Number(item.id), testament: item.testament || "custom", titleAr: item.titleAr || "", titleEn: item.titleEn || "", titleFr: item.titleFr || "", titleDe: item.titleDe || "", titleCoptic: item.titleCoptic || "", hidden: true }, deleted: true }); hidden++;
        }
        invalidateRemoteBibleCache(); await loadHistory(); setPreviewText(`أُخفيت بيانات ${hidden} سفرًا و${versesHidden} تعديل آية بعيد. لكل دفعة سجل تراجع مستقل.`);
        Alert.alert("تم الإخفاء", `أُخفيت بيانات ${hidden} سفرًا و${versesHidden} تعديل آية بعيد في Cloudflare. هذا حذف منطقي قابل للتراجع، ولا يحذف ملفات JSON الأصلية أو النسخة المحلية. يمكنك التراجع عن دفعات الآيات ثم بيانات السفر من السجل.`);
      } catch (error) { Alert.alert("تعذر إكمال الإخفاء", `تم إخفاء ${hidden} سفرًا و${versesHidden} آية قبل الخطأ. ${error instanceof Error ? error.message : String(error)} راجع السجل للتراجع عن كل دفعة.`); await loadHistory(); }
      finally { setBusy(false); }
    };
    if (deleteScope === "group" && typedIds.length === 0) { Alert.alert("أدخل أرقام الأسفار", "اكتب أرقام الأسفار مفصولة بفواصل، مثل 40,41,42."); return; }
    const label = deleteScope === "book" ? `السفر ${book}` : deleteScope === "testament" ? `العهد ${deleteTestament}` : `الأسفار ${typedIds.join(", ")}`;
    Alert.alert("تأكيد إخفاء المحتوى البعيد", `سيُخفى ${label} من بيانات Cloudflare المتاحة فقط، مع الاحتفاظ بالنسخة المحلية وإتاحة التراجع.`, [{ text: "إلغاء", style: "cancel" }, { text: "إخفاء", style: "destructive", onPress: () => void commit() }]);
  };
  const chooseImportFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/json", ".json"], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      const contents = await readAsStringAsync(picked.assets[0].uri, { encoding: EncodingType.UTF8 });
      setBulkJson(contents);
      Alert.alert("تم تحميل الملف", "راجِع محتواه ثم اضغط تحقق واستيراد JSON.");
    } catch (error) { Alert.alert("تعذر فتح الملف", error instanceof Error ? error.message : String(error)); }
  };

  const deleteChapter = async () => {
    const b = Number(book), c = Number(chapter);
    if (!Number.isInteger(b) || b < 1 || !Number.isInteger(c) || c < 1) { Alert.alert("مرجع غير صالح"); return; }
    Alert.alert("حذف الإصحاح من العرض", `سيُخفى الإصحاح ${b}:${c} بالكامل (الآيات 1–200) في كل الترجمات. يمكن التراجع عن كل دفعة من السجل.`, [
      { text: "إلغاء", style: "cancel" },
      { text: "إخفاء الإصحاح", style: "destructive", onPress: () => void (async () => {
        setBusy(true);
        try {
          for (let first = 1; first <= 200; first += 100) {
            const changes = Array.from({ length: 100 }, (_, index) => ({ book: b, chapter: c, verse: first + index, language: "*", text: "", deleted: true }));
            await request("/admin/bible/changes", "POST", { changes });
          }
          invalidateRemoteBibleCache();
          await loadHistory();
          setPreviewText(`تم إخفاء الإصحاح ${b}:${c}.`);
          Alert.alert("تم إخفاء الإصحاح", "حُفظت التغييرات مع إمكانية التراجع.");
        } catch (error) { Alert.alert("تعذر إخفاء الإصحاح", error instanceof Error ? error.message : String(error)); await loadHistory(); }
        finally { setBusy(false); }
      })() },
    ]);
  };

  const saveBook = async () => {
    const id = Number(book), order = Number(bookOrder);
    if (!Number.isInteger(id) || id < 1 || id > 999 || !Number.isInteger(order) || order < 1) { Alert.alert("رقم السفر أو الترتيب غير صالح"); return; }
    if (!bookTitleAr.trim() && !bookTitleEn.trim()) { Alert.alert("أدخل اسم السفر بالعربية أو الإنجليزية"); return; }
    setBusy(true);
    try {
      const result = await request("/admin/bible/book", "POST", { book: { id, order, testament: bookTestament, titleAr: bookTitleAr, titleEn: bookTitleEn, titleFr: "", titleDe: "", titleCoptic: "", hidden: bookHidden } });
      invalidateRemoteBibleCache();
      setPreviewText(`تم حفظ بيانات السفر رقم ${result.book.id}. سيظهر اسمه أو حالة إخفائه بعد تحديث الفهرس لدى التطبيق.`);
      void loadHistory();
      Alert.alert("تم حفظ السفر", "تم نشر بيانات السفر وظهوره/إخفاؤه. أضف آياته بعد ذلك عبر محرر الآية أو استيراد JSON.");
    } catch (error) { Alert.alert("تعذر حفظ السفر", error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const undo = async (id: string) => Alert.alert("تراجع عن العملية", "ستُعاد القيم السابقة لهذه العملية. هل تريد المتابعة؟", [
    { text: "إلغاء", style: "cancel" },
    { text: "تراجع", style: "destructive", onPress: () => void (async () => {
      setBusy(true);
      try { await request("/admin/bible/undo", "POST", { id }); invalidateRemoteBibleCache(); await loadHistory(); setPreviewText("تم التراجع عن العملية."); }
      catch (error) { Alert.alert("تعذر التراجع", error instanceof Error ? error.message : String(error)); }
      finally { setBusy(false); }
    })() },
  ]);

  return <View style={styles.card}>
    <View style={styles.header}><Feather name="book-open" size={19} color="#C8A951" /><View style={{ flex: 1 }}><Text style={styles.title}>إدارة محتوى الكتاب المقدس</Text><Text style={styles.hint}>التغييرات البعيدة تُدمج فوق النص المحلي، وتبقى النسخة المحلية متاحة دون اتصال.</Text></View></View>
    {!session && <Text style={styles.warning}>سجّل الدخول إلى Cloudflare لإدارة النصوص.</Text>}

    <View style={styles.group}>
      <Text style={styles.groupTitle}>تعديل أو إضافة أو إخفاء آية</Text>
      <View style={styles.row}>
        <Field label="رقم السفر" value={book} onChangeText={setBook} keyboardType="number-pad" />
        <Field label="الإصحاح" value={chapter} onChangeText={setChapter} keyboardType="number-pad" />
        <Field label="الآية" value={verse} onChangeText={setVerse} keyboardType="number-pad" />
      </View>
      <Text style={styles.label}>الترجمة المستهدفة</Text>
      <View style={styles.row}>{LANGUAGES.map((item) => <TouchableOpacity key={item} onPress={() => setLanguage(item)} style={[styles.chip, language === item && styles.chipSelected]}><Text style={styles.chipText}>{item.toUpperCase()}</Text></TouchableOpacity>)}</View>
      <TextInput value={text} onChangeText={setText} placeholder="نص الآية في الترجمة المختارة" placeholderTextColor="#64748B" multiline style={[styles.input, styles.multiline]} textAlignVertical="top" />
      <View style={styles.row}>
        <Action label="حفظ/تعديل الآية" icon="save" disabled={!session || busy} onPress={() => void applyChange(false)} />
        <Action label="إخفاء الآية بكل الترجمات" icon="eye-off" danger disabled={!session || busy} onPress={() => void applyChange(true)} />
      </View>
      <Action label="معاينة تغييرات هذا الإصحاح" icon="search" disabled={!session || busy} onPress={() => void refreshPreview()} />
      <Action label="إخفاء الإصحاح كاملًا" icon="trash-2" danger disabled={!session || busy} onPress={() => void deleteChapter()} />
    </View>

    <View style={styles.group}>
      <Text style={styles.groupTitle}>إضافة سفر أو تعديل اسمه وترتيبه وظهوره</Text>
      <Text style={styles.hint}>استخدم رقمًا غير مستخدم (حتى 999) للسفر الجديد. أدخل الآيات بعد حفظ الفهرس. تختار العهد بـ old أو new أو deutero.</Text>
      <View style={styles.row}><Field label="رقم السفر" value={book} onChangeText={setBook} keyboardType="number-pad" /><Field label="ترتيب الظهور" value={bookOrder} onChangeText={setBookOrder} keyboardType="number-pad" /></View>
      <Field label="اسم السفر بالعربية" value={bookTitleAr} onChangeText={setBookTitleAr} />
      <Field label="اسم السفر بالإنجليزية" value={bookTitleEn} onChangeText={setBookTitleEn} />
      <Text style={styles.label}>العهد</Text><View style={styles.row}>{["old", "new", "deutero", "custom"].map((item) => <TouchableOpacity key={item} onPress={() => setBookTestament(item)} style={[styles.chip, bookTestament === item && styles.chipSelected]}><Text style={styles.chipText}>{item}</Text></TouchableOpacity>)}</View>
      <View style={styles.row}><Text style={styles.label}>إخفاء السفر من القائمة</Text><Switch value={bookHidden} onValueChange={setBookHidden} trackColor={{ false: "#334155", true: "#927A35" }} thumbColor={bookHidden ? "#E7C65B" : "#CBD5E1"} /></View>
      <Action label="حفظ بيانات السفر" icon="book" disabled={!session || busy} onPress={() => void saveBook()} />
      <Action label="حذف السفر من الفهرس (قابل للتراجع)" icon="trash" danger disabled={!session || busy || (!bookTitleAr.trim() && !bookTitleEn.trim())} onPress={() => Alert.alert("حذف السفر", "سيُزال السفر من قائمة المستخدمين دون مسح الآيات نهائيًا. يمكن استعادته من سجل التعديلات.", [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: () => void (async () => { setBusy(true); try { await request("/admin/bible/book", "POST", { book: { id: Number(book), order: Number(bookOrder) || Number(book), testament: bookTestament, titleAr: bookTitleAr, titleEn: bookTitleEn, hidden: true }, deleted: true }); invalidateRemoteBibleCache(); await loadHistory(); setPreviewText("تم حذف السفر من الفهرس ويمكن استعادته بالتراجع."); } catch (error) { Alert.alert("تعذر حذف السفر", error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } })() }])} />
    </View>

    <View style={styles.group}>
      <Text style={styles.groupTitle}>استيراد آيات/إصحاحات/أسفار على دفعات</Text>
      <Text style={styles.hint}>يمكن اختيار ملف السفر الموجود بصيغة [{"{chapter, verse, text}"}] بعد تحديد رقم السفر والترجمة أعلاه، أو JSON يتضمن book/chapters/verses أو قائمة books لعدة أسفار. تحفظ الآيات عن بُعد على دفعات قابلة للتراجع. استخدم فقط نصوصًا تملك حق استخدامها.</Text>
      <TextInput value={bulkJson} onChangeText={setBulkJson} placeholder={'[{"book":40,"chapter":1,"verse":1,"language":"ar","text":"..."}]'} placeholderTextColor="#64748B" multiline style={[styles.input, styles.bulk]} textAlignVertical="top" />
      <Action label="اختيار ملف JSON من الجهاز" icon="file-text" disabled={!session || busy} onPress={() => void chooseImportFile()} />
      <Action label="تحقق واستيراد ملف JSON" icon="upload-cloud" disabled={!session || busy || !bulkJson.trim()} onPress={() => void importChanges()} />
      <Text style={[styles.groupTitle, { marginTop: 12 }]}>إخفاء ملف سفر أو مجموعة بيانات بعيدة</Text>
      <Text style={styles.hint}>تُنشأ علامة حذف لكل تعديل آية بعيد نشط في النطاق، ثم تُخفى بيانات الأسفار من الفهرس؛ لا تُحذف أصول JSON أو النسخة المحلية. كل دفعة وسفر قابلان للتراجع من السجل.</Text>
      <View style={styles.row}>{(["book", "testament", "group"] as const).map((item) => <TouchableOpacity key={item} onPress={() => setDeleteScope(item)} style={[styles.chip, deleteScope === item && styles.chipSelected]}><Text style={styles.chipText}>{item === "book" ? "سفر" : item === "testament" ? "عهد" : "مجموعة أرقام"}</Text></TouchableOpacity>)}</View>
      {deleteScope === "testament" && <View style={styles.row}>{["old", "new", "deutero", "custom"].map((item) => <TouchableOpacity key={item} onPress={() => setDeleteTestament(item)} style={[styles.chip, deleteTestament === item && styles.chipSelected]}><Text style={styles.chipText}>{item}</Text></TouchableOpacity>)}</View>}
      {deleteScope === "group" && <Field label="أرقام الأسفار مفصولة بفواصل" value={deleteBookIds} onChangeText={setDeleteBookIds} />}
      <Action label="إخفاء النطاق المحدد من Cloudflare" icon="trash-2" danger disabled={!session || busy} onPress={() => void hideRemoteBooks()} />
    </View>

    {!!previewText && <View style={styles.preview}><Text style={styles.groupTitle}>المعاينة / نتيجة العملية</Text><ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}><Text selectable style={styles.previewText}>{previewText}</Text></ScrollView></View>}

    <View style={styles.group}>
      <View style={styles.row}><Text style={styles.groupTitle}>آخر 50 عملية</Text><TouchableOpacity onPress={() => void loadHistory()} disabled={loadingHistory}><Feather name="refresh-cw" size={16} color="#C8A951" /></TouchableOpacity></View>
      {loadingHistory && <ActivityIndicator color="#C8A951" />}
      {!loadingHistory && history.length === 0 && <Text style={styles.hint}>لا يوجد سجل تعديلات بعد.</Text>}
      {history.map((row) => <View key={row.id} style={styles.historyRow}>
        <View style={{ flex: 1 }}><Text style={styles.historyText}>{row.kind === "book" ? "بيانات سفر" : "آيات"} · {row.count} عنصر</Text><Text style={styles.hint}>{new Date(row.createdAt).toLocaleString("ar-EG")}{row.undoneAt ? " · تم التراجع" : ""}</Text></View>
        {!row.undoneAt && <TouchableOpacity onPress={() => void undo(row.id)} disabled={!session || busy} style={styles.undoButton}><Feather name="rotate-ccw" size={14} color="#F87171" /><Text style={styles.undoText}>تراجع</Text></TouchableOpacity>}
      </View>)}
    </View>
    {busy && <View style={styles.busy}><ActivityIndicator color="#C8A951" /><Text style={styles.hint}>جارٍ الاتصال بـCloudflare…</Text></View>}
  </View>;
}

function Field({ label, value, onChangeText, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: "number-pad" | "default" }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType || "default"} placeholderTextColor="#64748B" style={styles.input} /></View>;
}
function Action({ label, icon, onPress, disabled, danger = false }: { label: string; icon: React.ComponentProps<typeof Feather>["name"]; onPress: () => void; disabled: boolean; danger?: boolean }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.action, danger && styles.danger, disabled && { opacity: 0.45 }]}><Feather name={icon} size={15} color={danger ? "#F87171" : "#C8A951"} /><Text style={[styles.actionText, danger && { color: "#F87171" }]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  card: { marginTop: 14, padding: 16, borderRadius: 22, backgroundColor: "#1E293B", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 }, title: { color: "#FFF", fontSize: 15, fontFamily: "Cairo_700Bold", textAlign: "right" },
  group: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: "#0F172A", borderWidth: 1, borderColor: "rgba(148,163,184,0.1)" },
  groupTitle: { color: "#C8A951", fontSize: 13, fontFamily: "Cairo_700Bold", textAlign: "right", marginBottom: 7 }, hint: { color: "#94A3B8", fontSize: 10, textAlign: "right", lineHeight: 16, fontFamily: "Cairo_400Regular" },
  warning: { color: "#FBBF24", textAlign: "right", fontFamily: "Cairo_600SemiBold" }, row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 7 },
  field: { flex: 1, minWidth: 88, marginTop: 7 }, label: { color: "#CBD5E1", fontSize: 10, fontFamily: "Cairo_600SemiBold", textAlign: "right", marginBottom: 4 },
  input: { flex: 1, minHeight: 40, color: "#FFF", backgroundColor: "#1E293B", borderWidth: 1, borderColor: "#334155", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, textAlign: "right", fontSize: 12 }, multiline: { minHeight: 82, marginTop: 10, textAlignVertical: "top" }, bulk: { minHeight: 140, marginTop: 10, textAlign: "left", fontFamily: "monospace" },
  chip: { minWidth: 43, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: "#334155", alignItems: "center" }, chipSelected: { borderColor: "#C8A951", backgroundColor: "rgba(200,169,81,0.15)" }, chipText: { color: "#E2E8F0", fontSize: 10, fontWeight: "700" },
  action: { minHeight: 40, flexGrow: 1, paddingHorizontal: 10, marginTop: 8, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, borderRadius: 9, borderWidth: 1, borderColor: "#475569" }, danger: { borderColor: "rgba(248,113,113,0.45)" }, actionText: { color: "#C8A951", textAlign: "center", fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  preview: { marginTop: 12, backgroundColor: "#0B1220", padding: 10, borderRadius: 10 }, previewText: { color: "#E2E8F0", fontSize: 10, lineHeight: 17, textAlign: "right" },
  historyRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: "#1E293B" }, historyText: { color: "#E2E8F0", fontSize: 11, textAlign: "right", fontFamily: "Cairo_600SemiBold" }, undoButton: { flexDirection: "row", alignItems: "center", gap: 4, padding: 7 }, undoText: { color: "#F87171", fontSize: 10, fontFamily: "Cairo_600SemiBold" }, busy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 10 },
});
