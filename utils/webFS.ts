// Web replacement for expo-file-system/legacy: in-memory files, downloadable via the sharing shim.
import store, { uriToName } from "./webFSStore";
export const documentDirectory = "webfs://docs/";
export const cacheDirectory = "webfs://cache/";
export enum EncodingType { UTF8 = "utf8", Base64 = "base64" }
export async function getInfoAsync(uri: string) { return { exists: store.has(uri), uri }; }
export async function makeDirectoryAsync(_uri: string, _o?: any) {}
export async function deleteAsync(uri: string, _o?: any) { store.delete(uri); }
export async function readDirectoryAsync(_uri: string): Promise<string[]> { return []; }
export async function copyAsync({ from, to }: { from: string; to: string }) { const f = store.get(from); if (f) store.set(to, { ...f }); }
export async function moveAsync({ from, to }: { from: string; to: string }) { const f = store.get(from); if (f) { store.set(to, { ...f }); store.delete(from); } }
export async function readAsStringAsync(uri: string, o?: { encoding?: string }) {
  const f = store.get(uri);
  if (!f) throw new Error("file not found: " + uriToName(uri));
  return f.data;
}
export async function writeAsStringAsync(uri: string, content: string, o?: { encoding?: string }) {
  store.set(uri, { data: content, encoding: o?.encoding || "utf8" });
}
export async function getContentUriAsync(uri: string) { return uri; }
export async function downloadAsync(url: string, fileUri: string, _o?: any) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("download failed " + r.status);
  const blob = await r.blob();
  const data = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
  store.set(fileUri, { data, encoding: "base64" });
  return { uri: fileUri, status: r.status };
}
export function createDownloadResumable(url: string, fileUri: string, _o?: any, cb?: (p: any) => void) {
  return {
    downloadAsync: async () => { const r = await downloadAsync(url, fileUri); return r; },
    pauseAsync: async () => {},
    resumeAsync: async () => { throw new Error("resume not supported on web"); },
  };
}
export const StorageAccessFramework = {};
export default { documentDirectory, cacheDirectory, EncodingType, getInfoAsync, makeDirectoryAsync, deleteAsync, readDirectoryAsync, copyAsync, moveAsync, readAsStringAsync, writeAsStringAsync, getContentUriAsync, downloadAsync, createDownloadResumable, StorageAccessFramework };
