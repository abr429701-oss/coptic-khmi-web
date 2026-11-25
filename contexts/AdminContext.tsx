import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AdminContextProps {
  isAdminMode: boolean;
  isLoaded: boolean;
  toggleAdminMode: () => void;
  unlockAllLevels: boolean;
  setUnlockAllLevels: (val: boolean) => void;
}

const UNLOCK_ALL_KEY = "@coptic/unlock_all_levels";

const AdminContext = createContext<AdminContextProps | undefined>(undefined);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [unlockAllLevels, setUnlockAllLevelsState] = useState(false);

  useEffect(() => {
    const loadState = async () => {
      try {
        await AsyncStorage.removeItem("@coptic/admin_mode_v1");
        setIsAdminMode(false);
        
        const unlockVal = await AsyncStorage.getItem(UNLOCK_ALL_KEY);
        if (unlockVal === "true") setUnlockAllLevelsState(true);
      } catch (e) {
        console.error("Failed to load admin state", e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadState();
  }, []);

  const toggleAdminMode = async () => {
    const newValue = !isAdminMode;
    setIsAdminMode(newValue);
  };

  const setUnlockAllLevels = async (val: boolean) => {
    setUnlockAllLevelsState(val);
    try {
      await AsyncStorage.setItem(UNLOCK_ALL_KEY, val ? "true" : "false");
    } catch (e) {
      console.error("Failed to save unlock all levels", e);
    }
  };

  return (
    <AdminContext.Provider value={{ isAdminMode, isLoaded, toggleAdminMode, unlockAllLevels, setUnlockAllLevels }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
};
