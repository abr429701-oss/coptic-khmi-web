import React, { useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Text,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLang } from "@/contexts/LanguageContext";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  placeholder?: string;
  searchDirection?: "coptic" | "arabic" | "none";
}

export function SearchBar({ value, onChangeText, onClear, placeholder, searchDirection }: SearchBarProps) {
  const colors = useThemeColors();
  const { t } = useLang();
  const inputRef = useRef<TextInput>(null);

  const directionLabel =
    searchDirection === "coptic"
      ? t.search.copticDir
      : searchDirection === "arabic"
        ? t.search.arabicDir
        : null;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.inputBg,
            borderColor:
              searchDirection === "coptic"
                ? colors.primary
                : searchDirection === "arabic"
                  ? colors.gold
                  : colors.border,
            borderWidth: searchDirection !== "none" && value ? 1.5 : 1,
          },
        ]}
      >
        <Feather name="search" size={18} color={colors.placeholder} style={styles.icon} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? t.searchPlaceholder}
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          textAlign="right"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={onClear} style={styles.clearBtn} activeOpacity={0.7}>
            <Feather name="x-circle" size={18} color={colors.placeholder} />
          </TouchableOpacity>
        )}
      </View>

      {directionLabel && value.length > 0 && (
        <View
          style={[
            styles.dirBadge,
            {
              backgroundColor:
                searchDirection === "coptic" ? colors.primary : colors.gold,
            },
          ]}
        >
          <Text style={styles.dirText}>{directionLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 10,
    gap: 6,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    writingDirection: "rtl",
  },
  clearBtn: {
    padding: 4,
    marginLeft: 6,
  },
  dirBadge: {
    alignSelf: "flex-end",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dirText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});