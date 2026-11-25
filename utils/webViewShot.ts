// Web replacement for react-native-view-shot: html2canvas over the DOM node.
import store from "./webFSStore";
async function capture(node: any): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;
  const root = (node?.current ?? node) as HTMLElement;
  const touched: [HTMLElement, string][] = [];
  root.querySelectorAll("*").forEach((n: any) => { touched.push([n, n.style.letterSpacing]); n.style.letterSpacing = "normal"; });
  try { return await html2canvas(root, { backgroundColor: null, scale: 2, useCORS: true }); }
  finally { touched.forEach(([n, v]) => { n.style.letterSpacing = v; }); }
}
export async function captureRef(ref: any, opts?: { format?: string; quality?: number; result?: string }): Promise<string> {
  const canvas = await capture(ref);
  const mime = opts?.format === "jpg" ? "image/jpeg" : "image/png";
  const dataUri = canvas.toDataURL(mime, opts?.quality ?? 0.9);
  if (opts?.result === "base64") return dataUri.split(",")[1] || "";
  const uri = "webfs://cache/capture-" + Date.now() + "." + (opts?.format === "jpg" ? "jpg" : "png");
  store.set(uri, { data: dataUri.split(",")[1] || "", encoding: "base64" });
  return uri;
}
export function captureScreen(_opts?: any): Promise<string> { return Promise.reject(new Error("captureScreen not supported on web")); }
export default { captureRef, captureScreen };
