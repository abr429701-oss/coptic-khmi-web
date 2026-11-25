// Desktop: Bible JSON files are served from /bible/<folder>/<file>.json (see public/bible), loaded on demand.
import manifest from '../../utils/bibleManifest.json';
export const BIBLE_MANIFEST: Record<string, Record<string, string>> = manifest as any;
export async function loadBibleBook(lang: string, bookId: number): Promise<any> {
  const p = BIBLE_MANIFEST[lang]?.[String(bookId)];
  if (!p) return null;
  const r = await fetch('/bible/' + p.split('/').map(encodeURIComponent).join('/'));
  if (!r.ok) return null;
  return r.json();
}
