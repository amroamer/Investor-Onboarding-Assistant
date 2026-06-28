import type { OnboardingCase } from "@/lib/onboarding/types";
import type { AgentEvent, StreamChunk } from "./types";
import { streamAgentEvent } from "@/server/agent/streamEvent";
import { toJSONAsync } from "seroval";
import { getDefaultSerovalPlugins } from "@tanstack/start-client-core";

interface StreamArgs {
  caseId: string;
  event: AgentEvent;
  sourceMessageId?: string;
}

const serovalPlugins = getDefaultSerovalPlugins();

/** Match the wire format TanStack Start's auto-generated client RPC stub uses. */
async function serializePayload(args: StreamArgs): Promise<string> {
  const serialized = await Promise.resolve(
    toJSONAsync({ data: args }, { plugins: serovalPlugins }),
  );
  return JSON.stringify(serialized);
}

/**
 * Calls the streaming server fn over fetch + reads the SSE body. Each non-terminal chunk
 * is delivered to `onChunk`. Resolves with the final persisted case once `{kind:"done"}`
 * arrives. Throws if the server emits `{kind:"error"}` or the connection breaks.
 *
 * We don't use EventSource because:
 *   - EventSource is GET-only and we need a POST body for the event payload
 *   - It can't set custom headers (we need TanStack Start's CSRF header)
 */
export async function streamAgentEventClient(
  args: StreamArgs,
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal,
): Promise<OnboardingCase> {
  const body = await serializePayload(args);

  const response = await fetch(streamAgentEvent.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tsr-serverFn": "true",
    },
    body,
    credentials: "same-origin",
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalCase: OnboardingCase | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line (\n\n). Each event has one or more
      // "data: " lines (we only emit one).
      while (true) {
        const idx = buffer.indexOf("\n\n");
        if (idx === -1) break;
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(raw) as StreamChunk;
          } catch {
            continue;
          }
          if (chunk.kind === "done") {
            finalCase = chunk.case;
          } else if (chunk.kind === "error") {
            throw new Error(chunk.message);
          } else {
            onChunk(chunk);
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  if (!finalCase) throw new Error("Agent stream ended without a final case.");
  return finalCase;
}
