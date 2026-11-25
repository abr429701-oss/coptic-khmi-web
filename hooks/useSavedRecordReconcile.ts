import { useEffect, useRef } from "react";
import { useDictionary, buildLegacyIdAliasMap } from "@/hooks/useDictionary";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useHistory } from "@/contexts/HistoryContext";

// بعد كل تحميل للقاموس: إعادة ربط المفضلة والسجل بالمعرّفات الجديدة
// (خريطة المعرّفات القديمة ثم مطابقة نص الكلمة بالضبط) دون حذف أي سجل.
export function useSavedRecordReconcile() {
  const { data: entries, dataUpdatedAt, isError } = useDictionary();
  const { reconcile: reconcileFavorites } = useFavorites();
  const { reconcile: reconcileHistory } = useHistory();
  const lastRef = useRef<unknown>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const healthFiredRef = useRef(false);

  useEffect(() => {
    if (!entries || entries.length === 0) return;
    if (lastRef.current !== entries) {
      lastRef.current = entries;
      const alias = buildLegacyIdAliasMap(entries);
      reconcileFavorites(entries, alias);
      reconcileHistory(entries, alias);
    }
    // Health gate: fire only after a genuine successful fetch AFTER mount
    // (dataUpdatedAt moves past mount time). The bundled seed rendering is not
    // proof of a healthy updated build; when in doubt the backup stays.
    if (!healthFiredRef.current && !isError && dataUpdatedAt > mountTimeRef.current) {
      healthFiredRef.current = true;
      const bridge = (globalThis as { khmiUpdate?: { confirmHealthy?: () => void } }).khmiUpdate;
      bridge?.confirmHealthy?.();
    }
  }, [entries, dataUpdatedAt, isError, reconcileFavorites, reconcileHistory]);
}
