import Constants from "expo-constants";

// Build-time stamped version (EXPO_PUBLIC_APP_VERSION is inlined by expo export)
// is the source of truth for packaged desktop/web builds, where
// Constants.expoConfig can be null. Native mobile keeps expoConfig.
export const APP_VERSION: string =
  process.env.EXPO_PUBLIC_APP_VERSION ||
  Constants.expoConfig?.version ||
  "0.0.0";
