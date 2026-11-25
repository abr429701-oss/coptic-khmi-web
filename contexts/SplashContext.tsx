import React, { createContext, useContext, useState } from "react";

interface SplashContextType {
  splashDone: boolean;
  markSplashDone: () => void;
}

const SplashContext = createContext<SplashContextType>({
  splashDone: false,
  markSplashDone: () => {},
});

export function SplashProvider({ children }: { children: React.ReactNode }) {
  const [splashDone, setSplashDone] = useState(false);
  const markSplashDone = () => setSplashDone(true);
  return (
    <SplashContext.Provider value={{ splashDone, markSplashDone }}>
      {children}
    </SplashContext.Provider>
  );
}

export function useSplash() {
  return useContext(SplashContext);
}
