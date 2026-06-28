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
}

const Ctx = createContext<StepperStore | null>(null);

export function StepperCaseProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const [activeCaseId, setActiveCaseIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_KEY);
  });

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
    <Ctx.Provider value={{ cases, activeCaseId, setActiveCaseId, startNewCase, resetCase, setCase }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStepperStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("StepperCaseProvider missing");
  return v;
}

export function useStepperCase(caseId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: caseId ? caseQueryKey(caseId) : ["stepper-case", "none"],
    queryFn: () => getStepperCase({ data: { caseId: caseId! } }),
    enabled: !!caseId,
    staleTime: 0,
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
