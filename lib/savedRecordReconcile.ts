// Non-destructive reconciliation of saved favorites/history after dictionary
// reloads. Never deletes a record: unresolved ids stay stored untouched.
export interface SavedIdRecord {
  id: string;
  coptic?: string;
  arabic?: string;
  query?: string;
}

export interface ReconcileEntry {
  id: string;
  coptic?: string;
  arabic?: string;
}

export function reconcileSavedIds<T extends SavedIdRecord>(
  records: T[],
  entries: ReconcileEntry[],
  legacyAlias: Map<string, string>
): { next: T[]; changed: boolean } {
  const current = new Set(entries.map((e) => e.id));
  // A headword shared by multiple entries is ambiguous: null marks "do not
  // re-match" so a saved record is never pointed at the wrong duplicate.
  const byHeadword = new Map<string, string | null>();
  const addHeadword = (text: string | undefined, id: string) => {
    if (!text) return;
    const seen = byHeadword.get(text);
    if (seen === undefined) byHeadword.set(text, id);
    else if (seen !== id) byHeadword.set(text, null);
  };
  for (const e of entries) {
    addHeadword(e.coptic, e.id);
    addHeadword(e.arabic, e.id);
  }
  let changed = false;
  const next = records.map((rec) => {
    if (current.has(rec.id)) return rec;
    const viaAlias = legacyAlias.get(rec.id);
    if (viaAlias && current.has(viaAlias)) {
      changed = true;
      return { ...rec, id: viaAlias };
    }
    // Exact headword re-match only (never a free-text query guess, which could
    // point a saved record at the wrong entry).
    for (const text of [rec.coptic, rec.arabic]) {
      if (!text) continue;
      const hit = byHeadword.get(text);
      if (hit != null && hit !== "") {
        changed = true;
        return { ...rec, id: hit };
      }
    }
    return rec;
  });
  return { next, changed };
}
