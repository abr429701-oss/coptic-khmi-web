import React from "react";
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";

interface FilterChipsProps {
  categories: string[];
  selected: string | null;
  onSelect: (cat: string | null) => void;
}

export function FilterChips({ categories, selected, onSelect }: FilterChipsProps) {
  const colors = useThemeColors();

  if (categories.length === 0) return null;

  const allChips = ["الكل", ...categories];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={[styles.scroll, { borderBottomColor: colors.separator }]}
    >
      {allChips.map((cat) => {
        const isSelected = cat === "الكل" ? selected === null : selected === cat;
        return (
          <TouchableOpacity
            key={cat}
            onPress={() => onSelect(cat === "الكل" ? null : cat)}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? colors.primary : colors.tagBg,
                borderColor: isSelected ? colors.primary : colors.border,
              },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, { color: isSelected ? "#fff" : colors.textSecondary }]}>
              {cat}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    borderBottomWidth: 1,
  },
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
