import { useEffect, useRef } from "react";
import { useDictionary, buildLegacyIdAliasMap } from "@/hooks/useDictionary";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useHistory } from "@/contexts/HistoryContext";

// بعد كل تحميل للقاموس: إعادة ربط المفضلة والسجل بالمعرّفات الجديدة
// (خريطة المعرّفات القديمة ثم مطابقة نص الكلمة بالضبط) دون حذف أي سجل.
export function useSavedRecordReconcile() {
  const { data: entries } = useDictionary();
  const { reconcile: reconcileFavorites } = useFavorites();
  const { reconcile: reconcileHistory } = useHistory();
  const lastRef = useRef<unknown>(null);

  useEffect(() => {
    if (!entries || entries.length === 0 || lastRef.current === entries) return;
    lastRef.current = entries;
    const alias = buildLegacyIdAliasMap(entries);
    reconcileFavorites(entries, alias);
    reconcileHistory(entries, alias);
    // Electron only: dictionary data rendered = user-visible healthy build.
    const bridge = (globalThis as { khmiUpdate?: { confirmHealthy?: () => void } }).khmiUpdate;
    bridge?.confirmHealthy?.();
  }, [entries, reconcileFavorites, reconcileHistory]);
}
