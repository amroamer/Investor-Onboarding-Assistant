import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveCase, type CaseKey } from "./store";
import { useDispatch } from "./dispatch";
import { uploadDocuments } from "@/server/uploads";
import type { OnboardingCase } from "./types";

export interface UseDocumentUpload {
  upload: (files: File[], sourceMessageId?: string) => Promise<void>;
  uploading: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Shared upload flow used by the general upload card and per-requirement
 * upload buttons. Posts to `uploadDocuments`, splices the returned case into
 * the TanStack Query cache, then dispatches `documents_uploaded` so the agent
 * emits its standard summary message.
 */
export function useDocumentUpload(): UseDocumentUpload {
  const { caseData } = useActiveCase();
  const { dispatch } = useDispatch();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caseId = caseData.caseId;

  const upload = useCallback(
    async (files: File[], sourceMessageId?: string) => {
      if (uploading) return;
      if (files.length === 0) {
        setError("Please choose at least one file to upload.");
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.set("caseId", caseId);
        for (const f of files) fd.append("files", f);
        const updated = (await uploadDocuments({ data: fd })) as OnboardingCase;
        queryClient.setQueryData<Record<CaseKey, OnboardingCase>>(["cases"], (prev) => {
          if (!prev) return prev;
          const k = (Object.keys(prev) as CaseKey[]).find((kk) => prev[kk].caseId === caseId);
          if (!k) return prev;
          return { ...prev, [k]: updated };
        });
        const classifications = updated.uploadedDocuments.map((d) => ({
          fileName: d.fileName,
          classifiedAs: d.classifiedAs,
        }));
        await dispatch({ kind: "documents_uploaded", classifications }, sourceMessageId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [caseId, dispatch, queryClient, uploading],
  );

  const clearError = useCallback(() => setError(null), []);

  return { upload, uploading, error, clearError };
}
