import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

type BadgeState = "hidden" | "preparing" | "ready";

/**
 * Web-only pill that tells the user when the app shell is saved on the device,
 * so closing and reopening the app works without internet (dictionary included,
 * since the bundled snapshot ships inside the saved shell).
 */
export default function OfflineReadyBadge() {
  const [state, setState] = useState<BadgeState>("hidden");

  useEffect(() => {
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      setState(navigator.serviceWorker.controller ? "ready" : "preparing");
    };
    update();
    navigator.serviceWorker.addEventListener("controllerchange", update);
    navigator.serviceWorker.ready.then(update).catch(() => undefined);
    const t = setTimeout(update, 4000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      navigator.serviceWorker.removeEventListener("controllerchange", update);
    };
  }, []);

  if (state === "hidden") return null;
  const ready = state === "ready";
  return (
    <View style={[styles.pill, ready ? styles.ready : styles.preparing]}>
      <Feather name={ready ? "check-circle" : "download-cloud"} size={13} color={ready ? "#7CFC9A" : "#F5C96B"} />
      <Text style={[styles.text, { color: ready ? "#7CFC9A" : "#F5C96B" }]}>
        {ready ? "جاهزة للعمل بدون إنترنت" : "جاري تجهيز النسخة للعمل بدون إنترنت…"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "center",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  ready: { borderWidth: 1, borderColor: "rgba(124,252,154,0.35)" },
  preparing: { borderWidth: 1, borderColor: "rgba(245,201,107,0.35)" },
  text: { fontSize: 12, fontFamily: "cairoNormal" },
});
