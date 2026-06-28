import type {
  OnboardingCase,
  ConversationMessage,
  AuditEvent,
  PepStatus,
  RelatedParty,
} from "@/lib/onboarding/types";

/**
 * Events the frontend dispatches to the agent.
 *
 * The shape mirrors what an LLM agent would receive — a structured signal that
 * something happened (user pressed a button, submitted a form card, typed free text,
 * documents were uploaded). The agent is the only thing that decides what happens next.
 */
export type AgentEvent =
  | { kind: "session_start" }
  | { kind: "user_choice"; choiceId: string; label?: string }
  | { kind: "user_text"; text: string }
  | {
      kind: "card_submit_identity";
      legalName: string;
      primaryContact: string;
      jurisdiction: string;
      dob?: string;
      nationality?: string;
    }
  | { kind: "card_submit_ownership" }
  | {
      kind: "related_party_add";
      party: Omit<RelatedParty, "id" | "pepProvisional" | "pepStatus">;
    }
  | {
      kind: "related_party_update";
      partyId: string;
      changes: Partial<Omit<RelatedParty, "id">>;
    }
  | { kind: "related_party_remove"; partyId: string }
  | { kind: "card_submit_sow"; category: string; detail: string }
  | { kind: "card_submit_sof"; category: string; detail: string }
  | { kind: "card_submit_pep"; marks?: Record<string, PepStatus> }
  | { kind: "card_submit_fatca"; tin?: string; section?: string }
  | { kind: "card_submit_review" }
  | { kind: "checklist_provide"; itemId: string }
  | { kind: "checklist_replace"; itemId: string }
  | {
      kind: "documents_uploaded";
      classifications: { fileName: string; classifiedAs: string }[];
    };

/**
 * The agent's structured response.
 *
 * `messages`     — appended verbatim to the case's conversation.
 * `patch`        — shallow merged into the case. Use this for stage status, declarations,
 *                  sourceOfWealth/Funds, checklist changes, etc. Do NOT put `conversation`
 *                  or `audit` here — use the dedicated fields.
 * `audit`        — appended to the audit log.
 *
 * An LLM agent's tool calls map 1:1 to this shape: an `emit_message` tool produces a
 * `messages[]` entry; an `update_case` tool produces a `patch` object; an `add_audit_event`
 * tool produces an `audit[]` entry.
 */
export interface AgentResponse {
  messages: ConversationMessage[];
  patch?: Partial<OnboardingCase>;
  audit?: AuditEvent[];
}

/** A tool an LLM agent would have access to. Documented here for future-proofing. */
export interface AgentToolDef {
  name: string;
  description: string;
  inputSchema: unknown;
}

/**
 * Server-sent chunks emitted by `Agent.streamRespond()` as work progresses.
 *
 * - `message_complete` — a fully-assembled agent or investor message ready to display.
 *   (We do not emit per-token text deltas; for tool-use agents, each `emit_message` tool
 *   call produces one complete message.)
 * - `patch` — a structured case-state change (stage transitions, declarations, etc).
 * - `audit` — an audit log entry.
 * - `done` — terminal event with the final persisted case. No more chunks follow.
 * - `error` — terminal event with an error message.
 */
export type StreamChunk =
  | { kind: "message_complete"; message: ConversationMessage }
  | { kind: "patch"; patch: Partial<OnboardingCase> }
  | { kind: "audit"; audit: AuditEvent }
  | { kind: "done"; case: OnboardingCase }
  | { kind: "error"; message: string };

/**
 * The agent contract. Today there is one rule-based and one LLM-driven implementation.
 *
 * `respond()` is the synchronous-style API: the agent assembles the entire response
 * before returning. `streamRespond()` is the streaming API: the agent calls `onChunk`
 * as work progresses (each tool call becoming a chunk). Streaming is optional — agents
 * that don't implement it get a fallback that buffers `respond()` and emits its result
 * as a single batch of chunks.
 */
export interface Agent {
  respond(c: OnboardingCase, event: AgentEvent): Promise<AgentResponse>;
  streamRespond?(
    c: OnboardingCase,
    event: AgentEvent,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<AgentResponse>;
  /** What an LLM agent would put in its system prompt. Unused by RuleBasedAgent. */
  describeRole?(): string;
  /** Tool schema an LLM agent would expose. Unused by RuleBasedAgent. */
  describeTools?(): AgentToolDef[];
}
