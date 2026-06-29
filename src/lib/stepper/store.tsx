import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { StepperCase } from "./types";
import {
  createStepperCase,
  getStepperCase,
  listStepperCases,
  resetStepperCase,
} from "@/server/stepper/cases";

const ACTIVE_KEY = "ioa.stepper.activeCase.v1";
const LIST_QUERY_KEY = ["stepper-cases"] as const;
const caseQueryKey = (id: string) => ["stepper-case", id] as const;

interface StepperStore {
  cases: StepperCase[];
  activeCaseId: string | null;
  setActiveCaseId: (id: string | null) => void;
  startNewCase: () => Promise<StepperCase>;
  resetCase: (id: string) => Promise<StepperCase>;
  setCase: (c: StepperCase) => void;
  /** True while ANY upload mutation is in flight from the client. Drives aggressive polling. */
  isUploading: boolean;
  /** Track that a per-file upload kicked off; pair with endUpload when done/failed. */
  beginUpload: () => void;
  endUpload: () => void;
}

const Ctx = createContext<StepperStore | null>(null);

export function StepperCaseProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const [activeCaseId, setActiveCaseIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_KEY);
  });

  // Client-side in-flight tracker. Set independently of TanStack Query so
  // useStepperCase can force aggressive polling the instant an upload kicks off
  // (before the server has even inserted the in-flight doc row).
  const [uploadingCount, setUploadingCount] = useState(0);
  const beginUpload = useCallback(() => setUploadingCount((n) => n + 1), []);
  const endUpload = useCallback(() => setUploadingCount((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeCaseId) window.localStorage.setItem(ACTIVE_KEY, activeCaseId);
    else window.localStorage.removeItem(ACTIVE_KEY);
  }, [activeCaseId]);

  const { data: cases = [] } = useQuery({
    queryKey: LIST_QUERY_KEY,
    queryFn: () => listStepperCases(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: () => createStepperCase(),
    onSuccess: (saved) => {
      queryClient.setQueryData<StepperCase[]>(LIST_QUERY_KEY, (prev) => [...(prev ?? []), saved]);
      queryClient.setQueryData(caseQueryKey(saved.caseId), saved);
    },
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetStepperCase({ data: { caseId: id } }),
    onSuccess: (saved) => {
      queryClient.setQueryData<StepperCase[]>(LIST_QUERY_KEY, (prev) =>
        (prev ?? []).map((c) => (c.caseId === saved.caseId ? saved : c)),
      );
      queryClient.setQueryData(caseQueryKey(saved.caseId), saved);
    },
  });

  const setActiveCaseId = useCallback((id: string | null) => setActiveCaseIdState(id), []);

  const startNewCase = useCallback(async () => {
    const c = await createMutation.mutateAsync();
    setActiveCaseIdState(c.caseId);
    return c;
  }, [createMutation]);

  const resetCase = useCallback(
    async (id: string) => {
      return await resetMutation.mutateAsync(id);
    },
    [resetMutation],
  );

  const setCase = useCallback(
    (c: StepperCase) => {
      queryClient.setQueryData(caseQueryKey(c.caseId), c);
      queryClient.setQueryData<StepperCase[]>(LIST_QUERY_KEY, (prev) => {
        if (!prev) return [c];
        const idx = prev.findIndex((p) => p.caseId === c.caseId);
        if (idx === -1) return [...prev, c];
        const next = prev.slice();
        next[idx] = c;
        return next;
      });
    },
    [queryClient],
  );

  return (
    <Ctx.Provider value={{ cases, activeCaseId, setActiveCaseId, startNewCase, resetCase, setCase, isUploading: uploadingCount > 0, beginUpload, endUpload }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStepperStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("StepperCaseProvider missing");
  return v;
}

/**
 * Force a refetch of the given case at ~700ms while `active` is true. Used
 * from the Documents step to surface live phase updates the instant an upload
 * begins, even before the server has inserted the first non-terminal doc row.
 */
export function useForcePollCase(caseId: string | null | undefined, active: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!active || !caseId) return;
    const interval = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: caseQueryKey(caseId) });
    }, 700);
    return () => window.clearInterval(interval);
  }, [active, caseId, queryClient]);
}

/**
 * Hook for the compliance queue — same backing query as the provider but with
 * a `refetchOnWindowFocus` so the queue auto-updates when the reviewer comes
 * back to the tab after another case was submitted. Returns the case list and
 * the loading state so the queue can render a skeleton on first paint.
 */
export function useStepperCaseList() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: LIST_QUERY_KEY,
    queryFn: () => listStepperCases(),
    // Stay fresh for 30s, then refetch on focus / mount. Cheap enough at demo
    // scale and avoids hammering the server while the reviewer reads a card.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return { cases: data ?? [], isLoading, isFetching, refetch };
}

export function useStepperCase(caseId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: caseId ? caseQueryKey(caseId) : ["stepper-case", "none"],
    queryFn: () => getStepperCase({ data: { caseId: caseId! } }),
    enabled: !!caseId,
    staleTime: 0,
    // While any upload is still moving through the pipeline, poll so the agent
    // chip + slot phases can animate in near real-time. Pages that need to
    // force-poll *before* the first non-terminal doc lands (e.g. while a bulk
    // upload is being uploaded) trigger queryClient.invalidateQueries directly.
    refetchInterval: (q) => {
      const c = q.state.data as StepperCase | undefined;
      if (!c) return false;
      const nonTerminal = c.uploadedDocuments.some((d) => {
        const p = d.processingPhase;
        return p === "pending" || p === "reading" || p === "classifying" || p === "matching";
      });
      return nonTerminal ? 700 : false;
    },
  });

  const setCase = useCallback(
    (c: StepperCase) => {
      queryClient.setQueryData(caseQueryKey(c.caseId), c);
      queryClient.setQueryData<StepperCase[]>(["stepper-cases"], (prev) => {
        if (!prev) return [c];
        const idx = prev.findIndex((p) => p.caseId === c.caseId);
        if (idx === -1) return [...prev, c];
        const next = prev.slice();
        next[idx] = c;
        return next;
      });
    },
    [queryClient],
  );

  return { caseData: data, setCase };
}
