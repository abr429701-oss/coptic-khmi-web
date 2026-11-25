import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FAVORITES_KEY = "@coptic/favorites_v3";

export interface FavoriteItem {
  id: string;
  lang: string;
  query: string;
}

interface FavoritesContextValue {
  favorites: FavoriteItem[];
  toggleFavorite: (id: string, lang: string, query: string) => void;
  isFavorite: (id: string) => boolean;
  removeDeletedIds: (ids: string[]) => void;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  favorites: [],
  toggleFavorite: () => {},
  isFavorite: () => false,
  removeDeletedIds: () => {},
});

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY)
      .then((json) => {
        if (json) {
          setFavorites(JSON.parse(json));
        } else {
          setFavorites([]);
        }
      })
      .catch(() => setFavorites([]));
  }, []);

  const toggleFavorite = useCallback((id: string, lang: string, query: string) => {
    setFavorites((prev) => {
      const exists = prev.some(f => f.id === id);
      const next = exists
        ? prev.filter((x) => x.id !== id)
        : [...prev, { id, lang, query }];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some(f => f.id === id),
    [favorites]
  );

  const removeDeletedIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const deletedSet = new Set(ids);
    setFavorites((prev) => {
      const next = prev.filter((item) => !deletedSet.has(item.id));
      if (next.length !== prev.length) {
        AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite, removeDeletedIds }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}