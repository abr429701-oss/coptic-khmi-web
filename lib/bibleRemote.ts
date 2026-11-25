import { CLOUDFLARE_API_BASE } from "@/lib/cloudflare";

export type BibleLanguage = "ar" | "en" | "gr" | "he" | "cb" | "sy";
export interface BibleOverride {
  book: number;
  chapter: number;
  verse: number;
  language: string;
  text: string;
  deleted: boolean | number;
  updatedAt?: number;
}
export interface RemoteBibleBook {
  id: number;
  order: number;
  testament: "old" | "new" | "deutero" | "custom";
  titleAr: string;
  titleEn: string;
  titleFr: string;
  titleDe: string;
  titleCoptic: string;
  hidden: boolean;
  deleted?: boolean;
  updatedAt?: number;
}
const TTL = 30_000;
const bookCache = new Map<string, { at: number; value: BibleOverride[] }>();
let booksCache: { at: number; value: RemoteBibleBook[] } | undefined;

async function readJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function getRemoteBibleBook(book: number, language?: string): Promise<BibleOverride[]> {
  const cacheKey = `${book}:${language || "all"}`;
  const cached = bookCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  const data = await readJson<{ overrides?: BibleOverride[] }>(`${CLOUDFLARE_API_BASE}/v1/bible/book?book=${book}${language ? `&language=${encodeURIComponent(language)}` : ""}`);
  if (data && Array.isArray(data.overrides)) {
    bookCache.set(cacheKey, { at: Date.now(), value: data.overrides });
    return data.overrides;
  }
  return cached?.value || [];
}

export async function getRemoteBibleChapter(book: number, chapter: number): Promise<BibleOverride[]> {
  const rows = await getRemoteBibleBook(book);
  return rows.filter((row) => Number(row.chapter) === chapter);
}

export async function getRemoteBibleBooks(force = false): Promise<RemoteBibleBook[]> {
  if (!force && booksCache && Date.now() - booksCache.at < TTL) return booksCache.value;
  const data = await readJson<{ books?: RemoteBibleBook[] }>(`${CLOUDFLARE_API_BASE}/v1/bible/books`);
  if (data && Array.isArray(data.books)) {
    booksCache = { at: Date.now(), value: data.books };
    return data.books;
  }
  return booksCache?.value || [];
}

export function invalidateRemoteBibleCache(): void {
  bookCache.clear();
  booksCache = undefined;
}
