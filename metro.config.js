const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("db", "wasm", "sql");
config.resolver.sourceExts.push("wasm");
// Web implementations of the native-only modules (browser downloads instead of a phone gallery/share sheet).
const prev = config.resolver.resolveRequest;
config.resolver.resolveRequest = (ctx, name, platform) => {
  if (name === "expo-file-system/legacy" || name === "expo-file-system") return { type: "sourceFile", filePath: path.join(__dirname, "utils", "webFS.ts") };
  if (name === "expo-sharing") return { type: "sourceFile", filePath: path.join(__dirname, "utils", "webSharing.ts") };
  if (name === "expo-print") return { type: "sourceFile", filePath: path.join(__dirname, "utils", "webPrint.ts") };
  if (name === "react-native-view-shot") return { type: "sourceFile", filePath: path.join(__dirname, "utils", "webViewShot.ts") };
  if (name === "expo-media-library") return { type: "sourceFile", filePath: path.join(__dirname, "utils", "webMedia.ts") };
  return (prev || ctx.resolveRequest)(ctx, name, platform);
};
module.exports = config;
