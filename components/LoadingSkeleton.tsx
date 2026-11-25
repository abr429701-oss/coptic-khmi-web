import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";

function SkeletonItem() {
  const colors = useThemeColors();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });

  return (
    <Animated.View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity }]}
    >
      <View style={styles.content}>
        <View style={styles.textArea}>
          <View style={[styles.line, styles.lineLong, { backgroundColor: colors.separator }]} />
          <View style={[styles.line, styles.lineMedium, { backgroundColor: colors.separator }]} />
          <View style={[styles.line, styles.lineShort, { backgroundColor: colors.separator }]} />
        </View>
        <View style={[styles.audioPlaceholder, { backgroundColor: colors.separator }]} />
      </View>
    </Animated.View>
  );
}

export function LoadingSkeleton() {
  return (
    <View style={styles.container}>
      {[...Array(8)].map((_, i) => (
        <SkeletonItem key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  content: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  textArea: {
    flex: 1,
    gap: 8,
  },
  line: {
    borderRadius: 6,
    height: 14,
  },
  lineLong: {
    width: "70%",
    height: 18,
  },
  lineMedium: {
    width: "50%",
  },
  lineShort: {
    width: "35%",
  },
  audioPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: 12,
  },
});
