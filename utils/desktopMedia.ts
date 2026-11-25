// Desktop replacement for expo-media-library: "save to library" saves the file to the Downloads folder.
import { shareAsync } from "./desktopSharing";
export async function requestPermissionsAsync() { return { status: "granted", granted: true, canAskAgain: true, expires: "never" }; }
export async function getPermissionsAsync() { return { status: "granted", granted: true, canAskAgain: true, expires: "never" }; }
export async function saveToLibraryAsync(uri: string) { await shareAsync(uri); }
export async function createAssetAsync(uri: string) { await shareAsync(uri); return { uri } as any; }
export async function createAlbumAsync() { return {} as any; }
export async function addAssetsToAlbumAsync() { return true; }
export async function getAlbumAsync() { return null; }
