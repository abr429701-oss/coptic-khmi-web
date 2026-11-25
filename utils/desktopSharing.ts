// Desktop replacement for expo-sharing: saves the file to the user's Downloads folder (Electron handles the download).
import { toPlayableUrl } from "./desktopFS";
export async function isAvailableAsync() { return true; }
export async function shareAsync(uri: string, _opts?: any) {
  const url = (toPlayableUrl(uri) || uri) + "&dl=1";
  const name = decodeURIComponent(uri.split("?")[0].split("/").pop() || "file");
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 2000);
}
