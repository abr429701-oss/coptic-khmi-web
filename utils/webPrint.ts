// Web replacement for expo-print: renders HTML to a PDF download-able file via html2canvas + jsPDF.
import store from "./webFSStore";
export async function printToFileAsync({ html }: { html: string; width?: number; height?: number }): Promise<{ uri: string }> {
  const host = document.createElement("div");
  host.style.position = "fixed"; host.style.left = "-10000px"; host.style.top = "0"; host.style.width = "432px";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(host, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: [canvas.width / 2, canvas.height / 2] });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, canvas.width / 2, canvas.height / 2);
    const b64 = pdf.output("datauristring").split(",")[1] || "";
    const uri = "webfs://cache/export-" + Date.now() + ".pdf";
    store.set(uri, { data: b64, encoding: "base64" });
    return { uri };
  } finally {
    document.body.removeChild(host);
  }
}
export async function printAsync(_opts: any) { window.print(); }
export default { printToFileAsync, printAsync };
