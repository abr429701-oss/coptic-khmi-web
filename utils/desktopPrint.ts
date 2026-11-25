// Desktop replacement for expo-print: Electron renders the HTML to a PDF in the cache folder.
export async function printToFileAsync(o: { html: string; width?: number; height?: number }) {
  const p = `file:///cache/print_${Date.now()}.pdf`;
  const q = new URLSearchParams({ p, w: String(o.width || 612), h: String(o.height || 792) }).toString();
  const r = await fetch(`/__fs/print?${q}`, { method: "POST", body: o.html });
  if (!r.ok) throw new Error("print failed " + (await r.text()));
  return { uri: p, numberOfPages: 0 };
}
export async function printAsync() {}
