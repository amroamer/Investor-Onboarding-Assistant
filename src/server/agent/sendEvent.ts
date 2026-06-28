import { createServerFn } from "@tanstack/react-start";
import type { OnboardingCase } from "@/lib/onboarding/types";
import type { Agent, AgentEvent } from "@/lib/agent/types";
import { loadCaseByCaseId, persistCase } from "../cases";
import { agent as ruleBasedAgent } from "./rule-based";
import { LLMAgent } from "./llm";
import { recomputeProgress } from "@/lib/onboarding/engine";
import { applyResolution } from "./resolve";

let cachedAgent: Agent | null = null;
export function selectedAgent(): Agent {
  if (cachedAgent) return cachedAgent;
  const flavor = (process.env.AGENT_TYPE ?? "rule").toLowerCase();
  cachedAgent = flavor === "llm" ? new LLMAgent() : ruleBasedAgent;
  return cachedAgent;
}

interface SendArgs {
  caseId: string;
  event: AgentEvent;
  /** Message ID whose interactive component should be marked resolved before the agent runs. */
  sourceMessageId?: string;
}

export const sendAgentEvent = createServerFn({ method: "POST" })
  .validator((d: SendArgs) => d as SendArgs)
  .handler(async (ctx): Promise<OnboardingCase> => {
    const { caseId, event, sourceMessageId } = ctx.data as SendArgs;
    const { key, case: loaded } = await loadCaseByCaseId(caseId);
    let c = loaded;

    if (sourceMessageId) {
      c = applyResolution(c, sourceMessageId, event);
    }

    const resp = await selectedAgent().respond(c, event);
    const patched: OnboardingCase = {
      ...c,
      ...(resp.patch ?? {}),
      conversation: [...c.conversation, ...resp.messages],
      audit: [...c.audit, ...(resp.audit ?? [])],
      lastSavedAt: new Date().toISOString(),
    };
    patched.progressPct = recomputeProgress(patched);
    return await persistCase(key, patched);
  });
