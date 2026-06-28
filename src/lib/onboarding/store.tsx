import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OnboardingCase } from "./types";
import { recomputeProgress } from "./engine";
import { listCases, upsertCase, resetCase as resetCaseFn, resetAllCases } from "@/server/cases";

const ACTIVE_KEY = "ioa.activeCase.v1";
const CASES_QUERY_KEY = ["cases"] as const;

export type CaseKey = "new-corporate" | "returning-lp";

type CaseMap = Record<CaseKey, OnboardingCase>;

interface CaseStore {
  cases: CaseMap;
  activeKey: CaseKey;
  setActiveKey: (k: CaseKey) => void;
  update: (k: CaseKey, updater: (c: OnboardingCase) => OnboardingCase) => void;
  reset: (k: CaseKey) => void;
  resetAll: () => void;
}

const Ctx = createContext<CaseStore | null>(null);

export function CaseProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const [activeKey, setActiveKeyState] = useState<CaseKey>(() => {
    if (typeof window === "undefined") return "new-corporate";
    return (window.localStorage.getItem(ACTIVE_KEY) as CaseKey) || "new-corporate";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(ACTIVE_KEY, activeKey); } catch { /* ignore */ }
  }, [activeKey]);

  const { data: cases } = useQuery({
    queryKey: CASES_QUERY_KEY,
    queryFn: () => listCases(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const upsertMutation = useMutation({
    mutationFn: ({ key, c }: { key: CaseKey; c: OnboardingCase }) =>
      upsertCase({ data: { key, case: c } }),
    onSuccess: (saved, vars) => {
      queryClient.setQueryData<CaseMap>(CASES_QUERY_KEY, (prev) =>
        prev ? { ...prev, [vars.key]: saved } : ({ [vars.key]: saved } as CaseMap),
      );
    },
  });

  const resetMutation = useMutation({
    mutationFn: (k: CaseKey) => resetCaseFn({ data: { key: k } }),
    onSuccess: (saved, k) => {
      queryClient.setQueryData<CaseMap>(CASES_QUERY_KEY, (prev) =>
        prev ? { ...prev, [k]: saved } : ({ [k]: saved } as CaseMap),
      );
    },
  });

  const resetAllMutation = useMutation({
    mutationFn: () => resetAllCases(),
    onSuccess: (saved) => {
      queryClient.setQueryData<CaseMap>(CASES_QUERY_KEY, saved);
    },
  });

  const update = useCallback(
    (k: CaseKey, updater: (c: OnboardingCase) => OnboardingCase) => {
      const prev = queryClient.getQueryData<CaseMap>(CASES_QUERY_KEY);
      if (!prev) return;
      const next = updater(prev[k]);
      const withProgress: OnboardingCase = {
        ...next,
        progressPct: recomputeProgress(next),
        lastSavedAt: new Date().toISOString(),
      };
      // Optimistic UI update
      queryClient.setQueryData<CaseMap>(CASES_QUERY_KEY, { ...prev, [k]: withProgress });
      // Persist to DB
      upsertMutation.mutate({ key: k, c: withProgress });
    },
    [queryClient, upsertMutation],
  );

  const setActiveKey = useCallback((k: CaseKey) => setActiveKeyState(k), []);
  const reset = useCallback((k: CaseKey) => resetMutation.mutate(k), [resetMutation]);
  const resetAll = useCallback(() => resetAllMutation.mutate(), [resetAllMutation]);

  if (!cases) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ cases, activeKey, setActiveKey, update, reset, resetAll }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCaseStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("CaseProvider missing");
  return v;
}

export function useActiveCase() {
  const { cases, activeKey, update } = useCaseStore();
  return {
    activeKey,
    caseData: cases[activeKey],
    update: (u: (c: OnboardingCase) => OnboardingCase) => update(activeKey, u),
  };
}
