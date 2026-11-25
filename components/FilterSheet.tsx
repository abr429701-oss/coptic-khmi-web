import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang } from "@/contexts/LanguageContext";

export type FilterMode = "all" | "contains" | "starts" | "ends" | "exact";

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  mode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
}

export function FilterSheet({ visible, onClose, mode, onModeChange }: FilterSheetProps) {
  const colors = useThemeColors();
  const { t } = useLang();

  const FILTER_OPTIONS: { label: string; value: FilterMode }[] = [
    { label: t.filter.all, value: "all" },
    { label: t.filter.starts, value: "starts" },
    { label: t.filter.contains, value: "contains" },
    { label: t.filter.ends, value: "ends" },
    { label: t.filter.exact, value: "exact" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.inputBg }]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: colors.separator }]} />

          <Text style={[styles.title, { color: colors.text }]}>{t.filter.title}</Text>

          <View style={styles.options}>
            {FILTER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.optionRow}
                onPress={() => { onModeChange(opt.value); onClose(); }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: mode === opt.value ? "#8B0000" : colors.separator,
                      backgroundColor: mode === opt.value ? "#8B0000" : "transparent",
                    },
                  ]}
                >
                  {mode === opt.value && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.optionLabel, { color: colors.text }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    paddingVertical: 16,
  },
  options: {
    paddingHorizontal: 24,
    gap: 4,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 16,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  optionLabel: {
    fontSize: 17,
    fontFamily: "Inter_400Regular",
  },
});
