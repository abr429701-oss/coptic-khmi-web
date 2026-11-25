import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DictionaryEntry } from "@/hooks/useDictionary";
import { reconcileSavedIds, type ReconcileEntry } from "@/lib/savedRecordReconcile";

const HISTORY_KEY = "@coptic/history_v3";
const MAX_HISTORY = 100;

export type HistoryItem = DictionaryEntry & { _query?: string; _lang?: string; _displayMeaning?: string };

interface HistoryContextValue {
  history: HistoryItem[];
  addToHistory: (entry: HistoryItem) => void;
  clearHistory: () => void;
  removeDeletedIds: (ids: string[]) => void;
  reconcile: (entries: ReconcileEntry[], legacyAlias: Map<string, string>) => void;
}

const HistoryContext = createContext<HistoryContextValue>({
  history: [],
  addToHistory: () => {},
  clearHistory: () => {},
  removeDeletedIds: () => {},
  reconcile: () => {},
});

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((json) => {
        if (json) {
          setHistory(JSON.parse(json));
        } else {
          setHistory([]);
        }
      })
      .catch(() => setHistory([]));
  }, []);

  const save = useCallback((items: HistoryItem[]) => {
    setHistory(items);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(items)).catch(() => {});
  }, []);

  const addToHistory = useCallback((entry: HistoryItem) => {
    setHistory((prev) => {
      const filtered = prev.filter((e) => e.id !== entry.id);
      const next = [entry, ...filtered].slice(0, MAX_HISTORY);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    save([]);
  }, [save]);

  // يُستدعى تلقائياً عند حذف كلمات من الشيت
  const removeDeletedIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const deletedSet = new Set(ids);
    setHistory((prev) => {
      const next = prev.filter((e) => !deletedSet.has(e.id));
      if (next.length !== prev.length) {
        AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  }, []);

  // يعيد ربط المعرّفات المحفوظة بعد إعادة تحميل القاموس دون حذف أي سجل.
  const reconcile = useCallback((entries: ReconcileEntry[], legacyAlias: Map<string, string>) => {
    setHistory((prev) => {
      const { next, changed } = reconcileSavedIds(prev, entries, legacyAlias);
      if (changed) {
        AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  }, []);

  return (
    <HistoryContext.Provider value={{ history, addToHistory, clearHistory, removeDeletedIds, reconcile }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  return useContext(HistoryContext);
}