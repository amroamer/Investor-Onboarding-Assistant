import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveCase, type CaseKey } from "./store";
import { streamAgentEventClient } from "@/lib/agent/stream-client";
import type { AgentEvent } from "@/lib/agent/types";
import type { ConversationMessage, OnboardingCase } from "./types";

export type Dispatch = (event: AgentEvent, sourceMessageId?: string) => Promise<void>;

export interface DispatchState {
  dispatch: Dispatch;
  isBusy: boolean;
  inFlight: ConversationMessage[];
}

const DispatchContext = createContext<DispatchState | null>(null);

export function DispatchProvider({ children }: { children: ReactNode }) {
  const { caseData } = useActiveCase();
  const queryClient = useQueryClient();
  const [isBusy, setIsBusy] = useState(false);
  const [inFlightByCase, setInFlightByCase] = useState<Record<string, ConversationMessage[]>>({});
  const caseId = caseData.caseId;
  const inFlight = inFlightByCase[caseId] ?? [];

  const dispatch = useCallback<Dispatch>(
    async (event, sourceMessageId) => {
      setInFlightByCase((prev) => ({ ...prev, [caseId]: [] }));
      setIsBusy(true);
      try {
        const updated = await streamAgentEventClient(
          { caseId, event, sourceMessageId },
          (chunk) => {
            if (chunk.kind === "message_complete") {
              setInFlightByCase((prev) => ({
                ...prev,
                [caseId]: [...(prev[caseId] ?? []), chunk.message],
              }));
            }
          },
        );
        queryClient.setQueryData<Record<CaseKey, OnboardingCase>>(["cases"], (prev) => {
          if (!prev) return prev;
          const k = (Object.keys(prev) as CaseKey[]).find((kk) => prev[kk].caseId === caseId);
          if (!k) return prev;
          return { ...prev, [k]: updated };
        });
      } finally {
        setIsBusy(false);
        setInFlightByCase((prev) => ({ ...prev, [caseId]: [] }));
      }
    },
    [caseId, queryClient],
  );

  return (
    <DispatchContext.Provider value={{ dispatch, isBusy, inFlight }}>
      {children}
    </DispatchContext.Provider>
  );
}

export function useDispatch(): DispatchState {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useDispatch must be used within <DispatchProvider>");
  return ctx;
}
