// Desktop: Bible JSON files are served from /bible/<folder>/<file>.json (see public/bible), loaded on demand.
import manifest from '../../utils/bibleManifest.json';
export const BIBLE_MANIFEST: Record<string, Record<string, string>> = manifest as any;
export async function loadBibleBook(lang: string, bookId: number): Promise<any> {
  const p = BIBLE_MANIFEST[lang]?.[String(bookId)];
  if (!p) return null;
  // Web is served under a base path (GitHub Pages project site); desktop serves /bible from root.
  const base = (typeof window !== 'undefined' && (window as any).__KHMI_BASE__) || '';
  const r = await fetch(base + '/bible/' + p.split('/').map(encodeURIComponent).join('/'));
  if (!r.ok) return null;
  return r.json();
}
