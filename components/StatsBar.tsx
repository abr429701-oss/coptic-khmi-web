import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";

interface StatsBarProps {
  total: number;
  filtered: number;
  searchQuery: string;
}

export function StatsBar({ total, filtered, searchQuery }: StatsBarProps) {
  const colors = useThemeColors();

  const label = searchQuery
    ? `${filtered} نتيجة من أصل ${total} كلمة`
    : `${total} كلمة قبطية`;

  return (
    <View style={[styles.container, { borderBottomColor: colors.separator }]}>
      <View style={[styles.dot, { backgroundColor: colors.gold }]} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  text: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
});
