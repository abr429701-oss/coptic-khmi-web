// Desktop replacement for expo-file-system (legacy API). Talks to the local server built into the Electron app,
// which stores files in the user's app-data folder. URIs look like file:///docs/<path> and file:///cache/<path>.
export const documentDirectory = "file:///docs/";
export const cacheDirectory = "file:///cache/";
export const bundleDirectory = null;

export enum EncodingType { UTF8 = "utf8", Base64 = "base64" }

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
const call = async (op: string, params: Record<string, string>, init?: RequestInit) => {
  const r = await fetch(`/__fs/${op}?${q(params)}`, init);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r;
};

export const toPlayableUrl = (uri?: string | null): string | undefined => {
  if (!uri) return undefined;
  if (uri.startsWith("file:///docs/") || uri.startsWith("file:///cache/")) return `/__fs/file?${q({ p: uri })}`;
  return uri;
};

export async function getInfoAsync(uri: string, _opts?: any) {
  if (!uri) return { exists: false, uri, isDirectory: false };
  try {
    const j = await (await call("info", { p: uri })).json();
    return { ...j, uri };
  } catch { return { exists: false, uri, isDirectory: false }; }
}
export async function makeDirectoryAsync(uri: string, _o?: any) { await call("mkdir", { p: uri }); }
export async function deleteAsync(uri: string, _o?: any) { await call("delete", { p: uri }); }
export async function readDirectoryAsync(uri: string): Promise<string[]> { return (await call("ls", { p: uri })).json(); }
export async function copyAsync({ from, to }: { from: string; to: string }) { await call("copy", { from, to }); }
export async function moveAsync({ from, to }: { from: string; to: string }) { await call("move", { from, to }); }
export async function readAsStringAsync(uri: string, o?: { encoding?: string }) {
  if (!/^file:\/\/\/(docs|cache)\//.test(uri)) {
    const r = await fetch(uri);
    if (o?.encoding === "base64") {
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }
    return r.text();
  }
  return (await call("read", { p: uri, enc: o?.encoding === "base64" ? "base64" : "utf8" })).text();
}
export async function writeAsStringAsync(uri: string, content: string, o?: { encoding?: string }) {
  await call("write", { p: uri, enc: o?.encoding === "base64" ? "base64" : "utf8" }, { method: "POST", body: content });
}
export async function getContentUriAsync(uri: string) { return uri; }

let dlCounter = 0;
export async function downloadAsync(url: string, fileUri: string, _o?: any) {
  const id = `dl${Date.now()}_${dlCounter++}`;
  const j = await (await call("download", { url, p: fileUri, id }, { method: "POST" })).json();
  return { uri: fileUri, status: j.status || 200, headers: {}, mimeType: null };
}

export class DownloadResumable {
  private id = `dl${Date.now()}_${dlCounter++}`;
  private cancelled = false;
  constructor(private url: string, private fileUri: string, _opts: any, private cb?: (p: any) => void, private resumeData?: string) {}
  async downloadAsync() {
    const timer = this.cb ? setInterval(async () => {
      try {
        const p = await (await fetch(`/__fs/progress?${q({ id: this.id })}`)).json();
        if (!p.done) this.cb!({ totalBytesWritten: p.written, totalBytesExpectedToWrite: p.total });
      } catch {}
    }, 400) : null;
    try {
      const r = await fetch(`/__fs/download?${q({ url: this.url, p: this.fileUri, id: this.id, resume: this.resumeData ? "1" : "0" })}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { if (this.cancelled) return undefined; throw new Error(j.error || "download failed"); }
      return { uri: this.fileUri, status: j.status || 200, headers: {}, mimeType: null };
    } finally { if (timer) clearInterval(timer); }
  }
  async pauseAsync() { this.cancelled = true; await fetch(`/__fs/cancel?${q({ id: this.id })}`); return { url: this.url, fileUri: this.fileUri, options: {}, resumeData: "1" }; }
  async resumeAsync() { this.cancelled = false; return this.downloadAsync(); }
  async cancelAsync() { this.cancelled = true; await fetch(`/__fs/cancel?${q({ id: this.id })}`); }
  savable() { return { url: this.url, fileUri: this.fileUri, options: {}, resumeData: this.resumeData }; }
}
export function createDownloadResumable(url: string, fileUri: string, options?: any, cb?: (p: any) => void, resumeData?: string) {
  return new DownloadResumable(url, fileUri, options, cb, resumeData);
}
export type FileSystemDownloadResult = { uri: string; status: number; headers: any; mimeType: string | null };

export const StorageAccessFramework = {
  getUriForDirectoryInRoot: (_n: string) => "",
  requestDirectoryPermissionsAsync: async () => ({ granted: false }),
  createFileAsync: async () => { throw new Error("not available on desktop"); },
  readDirectoryAsync: async () => [],
  makeDirectoryAsync: async () => "",
};
export default {
  documentDirectory, cacheDirectory, EncodingType, getInfoAsync, makeDirectoryAsync, deleteAsync, readDirectoryAsync,
  copyAsync, moveAsync, readAsStringAsync, writeAsStringAsync, downloadAsync, createDownloadResumable, DownloadResumable,
  StorageAccessFramework, getContentUriAsync,
};
