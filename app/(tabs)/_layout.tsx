import React from "react";
import { Tabs } from "expo-router";

/**
 * TabLayout: هذا الملف ينظم التبويبات داخل المجلد (tabs)
 * قمنا بتنظيفه ليكون مكوّناً بسيطاً يتبع هيكلية Expo Router الصحيحة
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // إخفاء شريط التبويبات السفلي إذا كنت تعتمد على الـ DrawerMenu
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: "About",
        }}
      />
    </Tabs>
  );
}
