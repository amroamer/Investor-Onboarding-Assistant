import { useCallback, useEffect, useState } from "react";
import { useActiveCase } from "./store";

export type UploadMode = "one-by-one" | "bulk";

const STORAGE_KEY = "ioa.uploadMode.v1";
const DEFAULT_MODE: UploadMode = "one-by-one";

function readStore(): Record<string, UploadMode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, UploadMode>;
  } catch {
    /* corrupt storage — start over */
  }
  return {};
}

function writeStore(next: Record<string, UploadMode>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota or denied — silent */
  }
}

/**
 * Per-case upload mode (`one-by-one` vs `bulk`), persisted in localStorage so
 * the main RequirementsCard and the sidebar RequirementsChecklist stay in sync
 * within and across reloads. Mode resets per case.
 */
export function useUploadMode(): [UploadMode, (mode: UploadMode) => void] {
  const { caseData } = useActiveCase();
  const caseId = caseData.caseId;

  const [mode, setModeState] = useState<UploadMode>(() => {
    const store = readStore();
    return store[caseId] ?? DEFAULT_MODE;
  });

  // Re-read when the active case changes.
  useEffect(() => {
    const store = readStore();
    setModeState(store[caseId] ?? DEFAULT_MODE);
  }, [caseId]);

  // Sync between tabs/components within the same tab.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const store = readStore();
      setModeState(store[caseId] ?? DEFAULT_MODE);
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ caseId: string; mode: UploadMode }>).detail;
      if (detail?.caseId === caseId) setModeState(detail.mode);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("ioa:uploadMode", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ioa:uploadMode", onCustom as EventListener);
    };
  }, [caseId]);

  const setMode = useCallback(
    (next: UploadMode) => {
      const store = readStore();
      store[caseId] = next;
      writeStore(store);
      setModeState(next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ioa:uploadMode", { detail: { caseId, mode: next } }),
        );
      }
    },
    [caseId],
  );

  return [mode, setMode];
}
