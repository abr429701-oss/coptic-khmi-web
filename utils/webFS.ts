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
  if (f) return f.data;
  // Web assets (bundled images etc.) are URLs: fetch and convert.
  const r = await fetch(uri);
  if (!r.ok) throw new Error("file not found: " + uriToName(uri));
  if ((o?.encoding || "utf8") === EncodingType.Base64 || o?.encoding === "base64") {
    const blob = await r.blob();
    return new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }
  return r.text();
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
export const Paths = { cache: cacheDirectory, document: documentDirectory };
function joinUri(parts: any[]): string {
  const segs = parts.map((p) => (typeof p === "string" ? p : p?.uri ?? String(p)));
  return segs.join("/").replace(/([^:])\/+/g, "$1/").replace("webfs:/", "webfs://");
}
export class File {
  uri: string;
  constructor(...parts: any[]) { this.uri = joinUri(parts); }
  get name() { return uriToName(this.uri); }
  get exists() { return store.has(this.uri); }
  write(data: any) {
    if (typeof data === "string") { store.set(this.uri, { data, encoding: "utf8" }); return; }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    store.set(this.uri, { data: btoa(bin), encoding: "base64" });
  }
  async text() { const f = store.get(this.uri); return f ? f.data : ""; }
  async base64() { const f = store.get(this.uri); if (!f) return ""; return f.encoding === "base64" ? f.data : btoa(unescape(encodeURIComponent(f.data))); }
  delete() { store.delete(this.uri); }
}
export class Directory {
  uri: string;
  constructor(...parts: any[]) { this.uri = joinUri(parts); }
  create() {}
  delete() {}
}
export const StorageAccessFramework = {};
export default { documentDirectory, cacheDirectory, EncodingType, getInfoAsync, makeDirectoryAsync, deleteAsync, readDirectoryAsync, copyAsync, moveAsync, readAsStringAsync, writeAsStringAsync, getContentUriAsync, downloadAsync, createDownloadResumable, StorageAccessFramework };
