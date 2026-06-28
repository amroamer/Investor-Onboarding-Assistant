import { createServerFn } from "@tanstack/react-start";
import type { OnboardingCase, AuditEvent } from "@/lib/onboarding/types";
import type { AgentEvent, StreamChunk } from "@/lib/agent/types";
import { loadCaseByCaseId, persistCase } from "../cases";
import { selectedAgent } from "./sendEvent";
import { applyResolution } from "./resolve";
import { recomputeProgress } from "@/lib/onboarding/engine";

interface StreamArgs {
  caseId: string;
  event: AgentEvent;
  sourceMessageId?: string;
}

/**
 * Streams the agent's response as Server-Sent Events. Each chunk is a JSON object
 * (`StreamChunk`) on a `data:` line. The terminal event is always either `{kind:"done"}`
 * (with the persisted case) or `{kind:"error"}`.
 *
 * For the rule-based agent this still streams — but everything arrives in one batch
 * since the agent is synchronous. The protocol stays uniform across agent flavours.
 */
export const streamAgentEvent = createServerFn({ method: "POST" })
  .validator((d: StreamArgs) => d as StreamArgs)
  .handler(async (ctx): Promise<Response> => {
    const { caseId, event, sourceMessageId } = ctx.data as StreamArgs;
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        function emit(chunk: StreamChunk) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }

        try {
          const { key, case: loaded } = await loadCaseByCaseId(caseId);
          let c = loaded;
          if (sourceMessageId) c = applyResolution(c, sourceMessageId, event);

          const agent = selectedAgent();
          let response;

          if (agent.streamRespond) {
            response = await agent.streamRespond(c, event, emit);
          } else {
            // Fallback for non-streaming agents (rule-based): run synchronously, then
            // emit all messages/audit/patch as a single batch so the client protocol
            // is the same.
            response = await agent.respond(c, event);
            for (const m of response.messages) emit({ kind: "message_complete", message: m });
            if (response.audit) for (const a of response.audit) emit({ kind: "audit", audit: a });
            if (response.patch) emit({ kind: "patch", patch: response.patch });
          }

          // Apply the response to the case and persist.
          const patched: OnboardingCase = {
            ...c,
            ...(response.patch ?? {}),
            conversation: [...c.conversation, ...response.messages],
            audit: [...c.audit, ...(response.audit ?? [])],
            lastSavedAt: new Date().toISOString(),
          };
          patched.progressPct = recomputeProgress(patched);
          const persisted = await persistCase(key, patched);

          emit({ kind: "done", case: persisted });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ kind: "error", message } satisfies StreamChunk)}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
