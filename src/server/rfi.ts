import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { loadCaseByCaseId, persistCase } from "./cases";
import { recomputeProgress } from "@/lib/onboarding/engine";
import type {
  OnboardingCase,
  FurtherInfoRequest,
  AuditEvent,
  ConversationMessage,
} from "@/lib/onboarding/types";

const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

function audit(actor: AuditEvent["actor"], type: string, detail: string): AuditEvent {
  return { id: id("au"), at: now(), actor, type, detail };
}

function agentMsg(text: string): ConversationMessage {
  return { id: id("m"), author: "agent", text, at: now() };
}

function rfiCardMsg(items: FurtherInfoRequest[]): ConversationMessage {
  return {
    id: id("m"),
    author: "agent",
    text: "The Compliance team has requested the following additional information:",
    at: now(),
    component: {
      kind: "rfi",
      items: items.map((r) => ({
        id: r.id,
        text: r.text,
        status: r.status,
        investorResponseText: r.investorResponseText,
      })),
    },
  };
}

/* ---------- Pure logic (testable, no server runtime needed) ---------- */

export async function addRfiDraftLogic(caseId: string, text: string): Promise<OnboardingCase> {
  if (!text.trim()) throw new Error("RFI text is required.");
  const { key, case: c } = await loadCaseByCaseId(caseId);
  const newItem: FurtherInfoRequest = {
    id: id("rfi"),
    text: text.trim(),
    selected: true,
    status: "draft",
  };
  const updated: OnboardingCase = {
    ...c,
    complianceOnly: {
      ...c.complianceOnly,
      furtherInfoRequests: [...c.complianceOnly.furtherInfoRequests, newItem],
    },
    audit: [...c.audit, audit("Compliance", "RFI drafted", text.trim())],
    lastSavedAt: now(),
  };
  updated.progressPct = recomputeProgress(updated);
  return await persistCase(key, updated);
}

export async function sendRfisLogic(caseId: string, rfiIds: string[]): Promise<OnboardingCase> {
  if (rfiIds.length === 0) throw new Error("Select at least one RFI to send.");
  const { key, case: c } = await loadCaseByCaseId(caseId);
  const ids = new Set(rfiIds);
  const sentAt = now();
  const transitioned = new Set<string>();

  const updatedRfis = c.complianceOnly.furtherInfoRequests.map((r): FurtherInfoRequest => {
    if (ids.has(r.id) && r.status === "draft") {
      transitioned.add(r.id);
      return { ...r, status: "sent", sentAt, selected: false };
    }
    return r;
  });
  const justSent = updatedRfis.filter((r) => transitioned.has(r.id));
  if (justSent.length === 0) throw new Error("No matching draft RFIs to send.");

  const updated: OnboardingCase = {
    ...c,
    complianceOnly: { ...c.complianceOnly, furtherInfoRequests: updatedRfis },
    conversation: [...c.conversation, rfiCardMsg(justSent)],
    audit: [
      ...c.audit,
      audit(
        "Compliance",
        "RFI sent",
        `Sent ${justSent.length} request${justSent.length === 1 ? "" : "s"} to the investor.`,
      ),
    ],
    lastSavedAt: now(),
  };
  updated.progressPct = recomputeProgress(updated);
  return await persistCase(key, updated);
}

export async function respondToRfiLogic(
  caseId: string,
  rfiId: string,
  responseText: string,
): Promise<OnboardingCase> {
  if (!responseText.trim()) throw new Error("Please write a response.");
  const { key, case: c } = await loadCaseByCaseId(caseId);
  const respondedAt = now();
  const trimmed = responseText.trim();
  let foundText: string | undefined;

  const updatedRfis = c.complianceOnly.furtherInfoRequests.map((r): FurtherInfoRequest => {
    if (r.id !== rfiId) return r;
    if (r.status !== "sent" && r.status !== "responded") return r;
    foundText = r.text;
    return { ...r, status: "responded", respondedAt, investorResponseText: trimmed };
  });
  if (!foundText) throw new Error("RFI not found or not awaiting a response.");

  const conversation = c.conversation.map((m) => {
    if (m.component?.kind !== "rfi") return m;
    const refreshed = m.component.items.map((it) =>
      it.id === rfiId
        ? { ...it, status: "responded" as const, investorResponseText: trimmed }
        : it,
    );
    return { ...m, component: { ...m.component, items: refreshed } };
  });

  const updated: OnboardingCase = {
    ...c,
    complianceOnly: { ...c.complianceOnly, furtherInfoRequests: updatedRfis },
    conversation: [
      ...conversation,
      {
        id: id("m"),
        author: "investor",
        text: `Response to RFI: ${trimmed}`,
        at: respondedAt,
      },
      agentMsg(
        "Thank you. I've passed your response to the Compliance team. They'll be in touch if anything else is needed.",
      ),
    ],
    audit: [...c.audit, audit("Investor", "RFI responded", `Responded to: "${foundText}"`)],
    lastSavedAt: now(),
  };
  updated.progressPct = recomputeProgress(updated);
  return await persistCase(key, updated);
}

export async function markRfiResolvedLogic(
  caseId: string,
  rfiId: string,
  note?: string,
): Promise<OnboardingCase> {
  const { key, case: c } = await loadCaseByCaseId(caseId);
  const resolvedAt = now();
  let foundText: string | undefined;

  const updatedRfis = c.complianceOnly.furtherInfoRequests.map((r): FurtherInfoRequest => {
    if (r.id !== rfiId) return r;
    foundText = r.text;
    return { ...r, status: "resolved", resolvedAt, resolvedNote: note?.trim() || undefined };
  });
  if (!foundText) throw new Error("RFI not found.");

  const conversation = c.conversation.map((m) => {
    if (m.component?.kind !== "rfi") return m;
    const refreshed = m.component.items.map((it) =>
      it.id === rfiId ? { ...it, status: "resolved" as const } : it,
    );
    return { ...m, component: { ...m.component, items: refreshed } };
  });

  const updated: OnboardingCase = {
    ...c,
    complianceOnly: { ...c.complianceOnly, furtherInfoRequests: updatedRfis },
    conversation,
    audit: [
      ...c.audit,
      audit(
        "Compliance",
        "RFI resolved",
        note?.trim() ? `Resolved: "${foundText}" — ${note.trim()}` : `Resolved: "${foundText}"`,
      ),
    ],
    lastSavedAt: now(),
  };
  updated.progressPct = recomputeProgress(updated);
  return await persistCase(key, updated);
}

/* ---------- Server fn wrappers (call the pure logic in the request runtime) ---------- */

export const addRfiDraft = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; text: string }) => d as { caseId: string; text: string })
  .handler(async (ctx) => {
    const { caseId, text } = ctx.data as { caseId: string; text: string };
    return await addRfiDraftLogic(caseId, text);
  });

export const sendRfis = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; rfiIds: string[] }) => d as { caseId: string; rfiIds: string[] })
  .handler(async (ctx) => {
    const { caseId, rfiIds } = ctx.data as { caseId: string; rfiIds: string[] };
    return await sendRfisLogic(caseId, rfiIds);
  });

export const respondToRfi = createServerFn({ method: "POST" })
  .validator(
    (d: { caseId: string; rfiId: string; responseText: string }) =>
      d as { caseId: string; rfiId: string; responseText: string },
  )
  .handler(async (ctx) => {
    const { caseId, rfiId, responseText } = ctx.data as {
      caseId: string;
      rfiId: string;
      responseText: string;
    };
    return await respondToRfiLogic(caseId, rfiId, responseText);
  });

export const markRfiResolved = createServerFn({ method: "POST" })
  .validator(
    (d: { caseId: string; rfiId: string; note?: string }) =>
      d as { caseId: string; rfiId: string; note?: string },
  )
  .handler(async (ctx) => {
    const { caseId, rfiId, note } = ctx.data as { caseId: string; rfiId: string; note?: string };
    return await markRfiResolvedLogic(caseId, rfiId, note);
  });
