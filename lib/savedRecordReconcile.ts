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
  const byHeadword = new Map<string, string>();
  for (const e of entries) {
    if (e.coptic && !byHeadword.has(e.coptic)) byHeadword.set(e.coptic, e.id);
    if (e.arabic && !byHeadword.has(e.arabic)) byHeadword.set(e.arabic, e.id);
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
      if (hit) {
        changed = true;
        return { ...rec, id: hit };
      }
    }
    return rec;
  });
  return { next, changed };
}
