// Desktop replacement for react-native-view-shot, built on html2canvas.
import html2canvas from "html2canvas";
import { writeAsStringAsync, cacheDirectory } from "./desktopFS";
export async function captureRef(ref: any, o: any = {}) {
  const el: HTMLElement = ref && ref.nodeType ? ref : (ref?.current ?? ref);
  const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
  const fmt = o.format === "jpg" || o.format === "jpeg" ? "image/jpeg" : "image/png";
  const data = canvas.toDataURL(fmt, o.quality ?? 0.9);
  if (o.result === "base64") return data.split(",")[1];
  if (o.result === "data-uri") return data;
  const uri = `${cacheDirectory}Coptic-Khmi-${new Date().toISOString().slice(0,19).replace(/[:T]/g, "-")}.${fmt === "image/png" ? "png" : "jpg"}`;
  await writeAsStringAsync(uri, data.split(",")[1], { encoding: "base64" });
  return uri;
}
export default captureRef;
