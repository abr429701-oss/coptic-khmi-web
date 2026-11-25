// Web replacement for expo-media-library: "save to library" becomes a browser download.
import { shareAsync } from "./webSharing";
export async function requestPermissionsAsync() { return { status: "granted", granted: true }; }
export async function getPermissionsAsync() { return { status: "granted", granted: true }; }
export async function saveToLibraryAsync(uri: string) { await shareAsync(uri); }
export async function createAssetAsync(uri: string) { return { uri }; }
export default { requestPermissionsAsync, getPermissionsAsync, saveToLibraryAsync, createAssetAsync };
