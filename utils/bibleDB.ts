import { BIBLE_MANIFEST, loadBibleBook } from '../assets/bible/bibleAssets'; // Desktop: load Bible JSON from /bible on demand
import { getRemoteBibleBook, getRemoteBibleBooks, type BibleOverride } from '../lib/bibleRemote';

export interface BibleVerse {
  lang: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface SearchResult extends BibleVerse {
  langCode: string;
}

const bibleCache: Record<string, Record<number, any[]>> = {};
const searchIndex: Record<string, { b: number, c: number, v: number, n: string, t: string }[]> = {};
const pendingIndexes = new Set<string>(); // نظام حماية لمنع التكرار
const bibleCacheUpdatedAt: Record<string, number> = {};
const searchIndexUpdatedAt: Record<string, number> = {};

// دالة لتنظيف النص من التشكيل حسب اللغة
export function normalizeText(text: string, lang: string): string {
  if (!text) return "";
  if (lang === 'ar') {
    // تحسين جذري: عملية استبدال واحدة لكل الحروف بدلاً من عمليات منفصلة
    const map: Record<string, string> = {
      'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
      'ى': 'ي', 'ة': 'ه'
    };
    return text
      .replace(/[\u064B-\u0652\u0640]/g, "") // إزالة التشكيل والتطويل
      .replace(/[أإآٱىة]/g, (m) => map[m])
      .toLowerCase();
  }
  if (lang === 'cb') {
    // إزالة الجنكم وعلامات التشكيل القبطية
    return text.toLowerCase().replace(/[\u0300-\u036F\u2CBB\u2CBC◌]/g, "").trim();
  }
  if (lang === 'sy') {
    // إزالة التشكيل السرياني
    return text.replace(/[\u0730-\u074A]/g, "").toLowerCase().trim();
  }
  return text.toLowerCase();
}

const stripCopticVerseNumberPrefix = (text: string): string => {
  const value = String(text ?? '');
  const match = value.match(/^\s*\(([^)]{1,24})\)\s*/u);
  if (!match) return value;
  const token = Array.from(match[1]);
  const hasCopticLetter = token.some(character => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (codePoint >= 0x2C80 && codePoint <= 0x2CE4) || (codePoint >= 0x03E2 && codePoint <= 0x03EF);
  });
  return hasCopticLetter && !/\s/u.test(match[1]) ? value.slice(match[0].length) : value;
};

async function getBookData(lang: string, bookId: number): Promise<any[]> {
  if (!bibleCache[lang]) bibleCache[lang] = {};
  const cacheKey = `${lang}:${bookId}`;
  if (bibleCache[lang][bookId] && Date.now() - (bibleCacheUpdatedAt[cacheKey] || 0) < 30_000) {
    const cachedData = bibleCache[lang][bookId];
    if (lang === 'cb') {
      for (const verse of cachedData) {
        const text = stripCopticVerseNumberPrefix(String(verse.text ?? ''));
        if (text !== verse.text) { verse.text = text; verse.norm = normalizeText(text, lang); }
      }
    }
    return cachedData;
  }

  try {
    const rawData = await loadBibleBook(lang, bookId);
    const dataArray = rawData ? (Array.isArray(rawData) ? rawData : (rawData.verses || [])) : [];
    const verses = new Map<string, any>();
    for (const verse of dataArray) {
      const text = lang === 'cb' ? stripCopticVerseNumberPrefix(String(verse.text ?? '')) : String(verse.text ?? '');
      verses.set(`${Number(verse.chapter)}:${Number(verse.verse)}`, { ...verse, text, book: bookId, norm: normalizeText(text, lang) });
    }
    const overrides = await getRemoteBibleBook(bookId, lang);
    for (const override of overrides as BibleOverride[]) {
      const chapter = Number(override.chapter), verseNumber = Number(override.verse);
      const key = `${chapter}:${verseNumber}`;
      if (override.language === '*' && Boolean(override.deleted)) { verses.delete(key); continue; }
      if (override.language !== lang) continue;
      if (Boolean(override.deleted)) { verses.delete(key); continue; }
      const text = lang === 'cb' ? stripCopticVerseNumberPrefix(String(override.text ?? '')) : String(override.text ?? '');
      const previous = verses.get(key) || {};
      verses.set(key, { ...previous, chapter, verse: verseNumber, text, book: bookId, norm: normalizeText(text, lang) });
    }
    const processedData = Array.from(verses.values()).sort((a, b) => Number(a.chapter) - Number(b.chapter) || Number(a.verse) - Number(b.verse));
    const wasFresh = Boolean(bibleCache[lang][bookId]);
    bibleCache[lang][bookId] = processedData;
    bibleCacheUpdatedAt[cacheKey] = Date.now();
    if (wasFresh) delete searchIndex[lang];
    return processedData;
  } catch (e) {
    console.error(`Error loading book ${bookId} for ${lang}:`, e);
    return bibleCache[lang][bookId] || [];
  }
}
export async function buildSearchIndex(langs: string[]) {
  for (const lang of langs) {
    if (searchIndex[lang] && Date.now() - (searchIndexUpdatedAt[lang] || 0) < 30_000) continue;
    delete searchIndex[lang];
    
    // الانتظار إذا كان الفهرس قيد البناء بالفعل في عملية أخرى
    while (pendingIndexes.has(lang)) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (searchIndex[lang]) break;
    }
    if (searchIndex[lang]) continue;

    pendingIndexes.add(lang);
    try {
      console.log(`🏗️ Building index for ${lang}...`);
      const flat: any[] = [];
      const localBookIds = Object.keys(BIBLE_MANIFEST[lang] || {}).map(Number);
      const remoteBookIds = (await getRemoteBibleBooks()).map((book) => Number(book.id));
      const bookIds = Array.from(new Set([...localBookIds, ...remoteBookIds])).sort((a, b) => a - b);
      for (let index = 0; index < bookIds.length; index++) {
        const i = bookIds[index];
        const data = await getBookData(lang, i);
        for (const v of data) {
          flat.push({
            b: i,
            c: v.chapter,
            v: v.verse,
            n: v.norm,
            t: v.text
          });
        }
        // تنفس للواجهة: منع التجميد (Yield to UI thread)
        if (index % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      searchIndex[lang] = flat;
      searchIndexUpdatedAt[lang] = Date.now();
      console.log(`✅ Index for ${lang} ready! (${flat.length} verses)`);
    } finally {
      pendingIndexes.delete(lang);
    }
  }
}

export async function initBibleDB(): Promise<void> {
  // تم تفريغ الدالة. بناء الفهرس سيتم بذكاء فقط عند أول ضغطة بحث! (Lazy Indexing)
}

export async function preInitLangs(langs: string[]): Promise<void> {
  // تم الإلغاء لضمان عدم استهلاك أي موارد من المعالج أثناء التصفح العادي.
}

export async function getChapterCount(bookId: number): Promise<{ chapter: number }[]> {
  const chapters = new Set<number>();
  for (const lang of ['ar', 'en', 'gr', 'he', 'cb', 'sy']) {
    const data = await getBookData(lang, bookId);
    for (const verse of data) chapters.add(Number(verse.chapter));
  }
  return Array.from(chapters).sort((a, b) => a - b).map(chapter => ({ chapter }));
}

export async function getMultiLangVerses(bookId: number, chapter: number, langs: string[]): Promise<any[]> {
  const verseMap = new Map<number, any>();

  for (const lang of langs) {
    const data = await getBookData(lang, bookId);
    for (const v of data) {
      if (v.chapter === chapter) {
        if (!verseMap.has(v.verse)) verseMap.set(v.verse, { num: v.verse });
        verseMap.get(v.verse)[lang] = lang === 'cb'
          ? stripCopticVerseNumberPrefix(String(v.text ?? ''))
          : v.text;
      }
    }
  }

  return Array.from(verseMap.values()).sort((a, b) => a.num - b.num);
}

export async function searchVersesFTS(
  query: string,
  langs: string[],
  currentSearchId?: number,
  getLatestId?: () => number,
  searchScope: 'all' | 'old' | 'new' | 'deutero' | 'book' = 'all',
  searchBookId: number | null = null,
  limit: number = 1000,
  matchType: 'all' | 'any' = 'all' // التحكم في مرونة البحث
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  // اكتشاف اللغة
  let targetLang = 'en';
  if (/[\u0600-\u06FF]/.test(cleanQuery)) targetLang = 'ar';
  else if (/[\u0700-\u074F]/.test(cleanQuery)) targetLang = 'sy';
  else if (/[\u2C80-\u2CFF\u03E2-\u03EF]/.test(cleanQuery)) targetLang = 'cb';
  else if (/[\u0370-\u03FF]/.test(cleanQuery)) {
    targetLang = langs.includes('cb') ? 'cb' : 'gr';
  }
  else if (/[\u0590-\u05FF]/.test(cleanQuery)) targetLang = 'he';

  // التأكد من وجود الفهرس
  if (!searchIndex[targetLang]) {
    await buildSearchIndex([targetLang]);
  }

  const data = searchIndex[targetLang];
  if (!data) return [];

  const normQuery = normalizeText(cleanQuery, targetLang);
  const words = normQuery.split(/\s+/).filter(w => w.length > 0);

  console.log(`🚀 Memory Search: "${cleanQuery}" in ${targetLang} (Type: ${matchType})`);

  for (let i = 0; i < data.length; i++) {
    if (i % 5000 === 0) {
      if (currentSearchId !== undefined && getLatestId && getLatestId() !== currentSearchId) {
        return [];
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const v = data[i];

    if (searchScope === 'old' && (v.b < 1 || v.b > 39)) continue;
    if (searchScope === 'new' && (v.b < 40 || v.b > 66)) continue;
    if (searchScope === 'deutero' && (v.b < 67 || v.b > 76)) continue;
    if (searchScope === 'book' && searchBookId !== null && v.b !== searchBookId) continue;
    
    // منطق البحث المرن
    let match = false;
    if (matchType === 'all') {
      match = words.every(w => v.n.includes(w));
    } else {
      // للربط التلقائي: نكتفي بوجود كلمة واحدة من الكلمات المفتاحية الطويلة
      match = words.some(w => v.n.includes(w));
    }

    if (match) {
      allResults.push({
        book: v.b,
        chapter: v.c,
        verse: v.v,
        text: v.t,
        langCode: targetLang,
        lang: targetLang
      });
      if (allResults.length >= limit) break;
    }
  }

  return allResults;
}
