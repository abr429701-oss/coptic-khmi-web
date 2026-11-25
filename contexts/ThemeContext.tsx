import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "@/hooks/useColorScheme";
import { logActivity } from "@/hooks/useUserTracking";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  mode: "dark",
  setMode: () => { },
  toggle: () => { },
});

const STORAGE_KEY = "coptic_theme_mode_v1";

async function loadMode(): Promise<ThemeMode> {
  try {
    const v =
      Platform.OS === "web"
        ? localStorage.getItem(STORAGE_KEY)
        : await AsyncStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { }
  return "dark";
}

async function saveMode(mode: ThemeMode) {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, mode);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    }
  } catch { }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    loadMode().then(setModeState);
  }, []);

  const isDark =
    mode === "dark" || (mode === "system" && systemScheme === "dark");

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    saveMode(m);
    logActivity("settings_change", undefined, m, undefined, "theme");
  }, []);

  const toggle = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  return (
    <ThemeContext.Provider value={{ isDark, mode, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
