// Web replacement for expo-sharing: saves the shared file as a browser download.
import store, { uriToName } from "./webFSStore";
function mimeFor(name: string, fallback?: string): string {
  if (fallback) return fallback;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", pdf: "application/pdf", mp3: "audio/mpeg", mp4: "video/mp4",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || "application/octet-stream";
}
export async function isAvailableAsync() { return true; }
export async function shareAsync(uri: string, opts?: { mimeType?: string; UTI?: string }) {
  const f = store.get(uri);
  if (!f) throw new Error("nothing to share");
  const name = uriToName(uri);
  const blob = f.encoding === "base64"
    ? new Blob([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], { type: mimeFor(name, opts?.mimeType) })
    : new Blob([f.data], { type: mimeFor(name, opts?.mimeType) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export default { isAvailableAsync, shareAsync };
