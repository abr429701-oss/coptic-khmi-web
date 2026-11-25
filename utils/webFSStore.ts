// Shared in-memory file store for the web shims (survives within the page session).
export interface WebFile { data: string; encoding: string }
const store = new Map<string, WebFile>();
export default store;
export function uriToName(uri: string): string {
  const clean = String(uri).replace(/[?#].*$/, "");
  return decodeURIComponent(clean.split("/").pop() || "file");
}
