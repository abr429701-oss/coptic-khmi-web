import { useState, useEffect } from "react";
import { getLocalAudioBlobUrl } from "./useOfflineStorage";

/**
 * يرجع المسار المحلي للملف الصوتي لو موجود على الجهاز،
 * وإلا يرجع null — ومنها يقدر الـ AudioPlayer يشغّل أوفلاين
 */
export function useOfflineAudio(
  entryId: string,
  audioUrl: string | undefined,
  isCached = false,
  legacyEntryId?: string
): string | null {
  const [localPath, setLocalPath] = useState<string | null>(null);

  useEffect(() => {
    setLocalPath(null);
    if (!audioUrl) return;
    let cancelled = false;
    const loadLocalPath = async () => {
      const ids = [...new Set([entryId, legacyEntryId].filter((id): id is string => !!id))];
      for (const id of ids) {
        try {
          const path = await getLocalAudioBlobUrl(id);
          if (!path) continue;
          if (cancelled) {
            if (path.startsWith("blob:")) URL.revokeObjectURL(path);
            return;
          }
          setLocalPath(path);
          return;
        } catch { }
      }
    };
    void loadLocalPath();
    return () => { cancelled = true; };
  }, [entryId, audioUrl, isCached, legacyEntryId]);

  return localPath;
}
