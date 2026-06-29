/**
 * Compliance-side server fns for the stepper flow.
 *
 * Owns:
 *   - Lazy load / lazy derive of `stepper_compliance_state`
 *   - Screening sync + run against OpenSanctions
 *   - RFI lifecycle (draft / send / responded / resolved)
 *
 * Mutations always (a) update the persisted compliance row and (b) re-run
 * `deriveComplianceState` so the risk score + red flags stay in sync with
 * the latest screening or RFI activity.
 *
 * Nothing here is shared with the legacy `src/server/screening.ts` or
 * `src/server/rfi.ts` — those operate on the OnboardingCase shape.
 */

import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { stepperComplianceState } from "../db/schema";
import type { StepperComplianceStateRow } from "../db/schema";
import { loadCase, persistCase } from "./cases";
import { deriveComplianceState, buildNamesToScreen } from "@/lib/stepper/compliance-derive";
import {
  searchOpenSanctions,
  schemaForPartyType,
  OPENSANCTIONS_PROVIDER,
  hasOpenSanctionsKey,
} from "../opensanctions";
import {
  type StepperComplianceState,
  type StepperRfi,
  type StepperNameToScreen,
  emptyStepperComplianceState,
} from "@/lib/stepper/compliance";
import type { StepperCase, StepperAuditEvent, ScreeningRecord } from "@/lib/stepper/types";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

/* ─── Row ↔ domain mapping ─────────────────────────────────────────────── */

function rowToState(row: StepperComplianceStateRow): StepperComplianceState {
  return {
    caseId: row.caseId,
    suggestedOutcome: row.suggestedOutcome as StepperComplianceState["suggestedOutcome"],
    riskScore: row.riskScore,
    riskBand: row.riskBand as StepperComplianceState["riskBand"],
    redFlags: (row.redFlags as StepperComplianceState["redFlags"]) ?? [],
    namesToScreen: (row.namesToScreen as StepperComplianceState["namesToScreen"]) ?? [],
    furtherInfoRequests: (row.furtherInfoRequests as StepperComplianceState["furtherInfoRequests"]) ?? [],
    reasoning: (row.reasoning as StepperComplianceState["reasoning"]) ?? [],
    computedAt: row.computedAt,
  };
}

function stateToRow(s: StepperComplianceState): StepperComplianceStateRow {
  return {
    caseId: s.caseId,
    suggestedOutcome: s.suggestedOutcome,
    riskScore: s.riskScore,
    riskBand: s.riskBand,
    redFlags: s.redFlags,
    namesToScreen: s.namesToScreen,
    furtherInfoRequests: s.furtherInfoRequests,
    reasoning: s.reasoning,
    computedAt: s.computedAt,
  };
}

/* ─── Persistence helpers (exported so submitCase can call them) ───────── */

export async function loadComplianceState(caseId: string): Promise<StepperComplianceState | null> {
  const rows = await db
    .select()
    .from(stepperComplianceState)
    .where(eq(stepperComplianceState.caseId, caseId));
  return rows.length === 0 ? null : rowToState(rows[0]);
}

export async function upsertComplianceState(s: StepperComplianceState): Promise<StepperComplianceState> {
  const row = stateToRow(s);
  const [inserted] = await db
    .insert(stepperComplianceState)
    .values(row)
    .onConflictDoUpdate({
      target: stepperComplianceState.caseId,
      set: {
        suggestedOutcome: row.suggestedOutcome,
        riskScore: row.riskScore,
        riskBand: row.riskBand,
        redFlags: row.redFlags,
        namesToScreen: row.namesToScreen,
        furtherInfoRequests: row.furtherInfoRequests,
        reasoning: row.reasoning,
        computedAt: row.computedAt,
      },
    })
    .returning();
  return rowToState(inserted);
}

/**
 * Called from `submitCase` (and lazily from `getStepperComplianceState` when
 * a row is missing). Computes the initial snapshot and persists it.
 */
export async function initialiseComplianceForCase(c: StepperCase): Promise<StepperComplianceState> {
  const state = deriveComplianceState(c);
  return await upsertComplianceState(state);
}

function appendAudit(c: StepperCase, type: string, detail: string, actor: StepperAuditEvent["actor"] = "Compliance"): StepperCase {
  return {
    ...c,
    audit: [...c.audit, { id: id("au"), at: now(), actor, type, detail }],
    lastSavedAt: now(),
  };
}

/**
 * Sync the case's `screening` field with the compliance namesToScreen so
 * that running screening on either side (or just for visibility in the
 * compliance workspace) updates both. Keeps the two surfaces consistent
 * without making them share storage.
 */
function syncCaseScreeningFromCompliance(c: StepperCase, names: StepperNameToScreen[]): StepperCase {
  const screening: ScreeningRecord[] = names.map((n) => ({
    name: n.name,
    partyType: n.partyType,
    role: n.role,
    status:
      n.screeningStatus === "Screening completed"
        ? "completed"
        : n.screeningStatus === "Screening failed"
          ? "failed"
          : n.screeningStatus === "Screening in progress"
            ? "in_progress"
            : "pending",
    screenedAt: n.screenedAt,
    matches: (n.matches ?? []).map((m) => ({
      id: m.id,
      caption: m.caption,
      score: m.score,
      topics: m.topics,
      countries: m.countries,
      datasets: m.datasets,
      sourceUrl: m.sourceUrl,
    })),
    error: n.error,
  }));
  return { ...c, screening };
}

/* ─── Pure RFI lifecycle helpers (testable without DB) ─────────────────── */

export function applyAddRfiDraft(state: StepperComplianceState, text: string): StepperComplianceState {
  if (!text.trim()) throw new Error("RFI text is required");
  const draft: StepperRfi = {
    id: id("rfi"),
    text: text.trim(),
    status: "draft",
    selected: true,
  };
  return {
    ...state,
    furtherInfoRequests: [...state.furtherInfoRequests, draft],
    computedAt: now(),
  };
}

export function applySendRfis(state: StepperComplianceState, rfiIds: string[]): StepperComplianceState {
  if (rfiIds.length === 0) throw new Error("Select at least one draft to send");
  const sentAt = now();
  return {
    ...state,
    furtherInfoRequests: state.furtherInfoRequests.map((r) =>
      rfiIds.includes(r.id) && r.status === "draft"
        ? { ...r, status: "sent" as const, sentAt }
        : r,
    ),
    computedAt: now(),
  };
}

export function applyRespondToRfi(state: StepperComplianceState, rfiId: string, responseText: string): StepperComplianceState {
  if (!responseText.trim()) throw new Error("Investor response is required");
  const respondedAt = now();
  return {
    ...state,
    furtherInfoRequests: state.furtherInfoRequests.map((r) =>
      r.id === rfiId && r.status === "sent"
        ? {
            ...r,
            status: "responded" as const,
            respondedAt,
            investorResponseText: responseText.trim(),
          }
        : r,
    ),
    computedAt: now(),
  };
}

export function applyMarkRfiResolved(state: StepperComplianceState, rfiId: string, note?: string): StepperComplianceState {
  const resolvedAt = now();
  return {
    ...state,
    furtherInfoRequests: state.furtherInfoRequests.map((r) =>
      r.id === rfiId
        ? { ...r, status: "resolved" as const, resolvedAt, resolutionNote: note }
        : r,
    ),
    computedAt: now(),
  };
}

/* ─── Server fns ───────────────────────────────────────────────────────── */

export const getStepperComplianceState = createServerFn({ method: "GET" })
  .validator((d: { caseId: string }) => d)
  .handler(async ({ data }): Promise<StepperComplianceState> => {
    // Always re-derive on read so a fix to the derivation rules (weights,
    // missing-doc matching, etc.) takes effect for cases that were submitted
    // under the old code without forcing a resubmit. The existing row, if
    // any, is passed through as `previous` so screening results and the RFI
    // thread are preserved across the re-derive.
    const c = await loadCase(data.caseId);
    const existing = await loadComplianceState(data.caseId);
    const recomputed = deriveComplianceState(c, {
      previous: existing ?? undefined,
    });
    return await upsertComplianceState(recomputed);
  });

export const syncStepperScreeningList = createServerFn({ method: "POST" })
  .validator((d: { caseId: string }) => d)
  .handler(async ({ data }): Promise<StepperComplianceState> => {
    const c = await loadCase(data.caseId);
    const previous = (await loadComplianceState(data.caseId)) ?? emptyStepperComplianceState(c.caseId);
    const names = buildNamesToScreen(c, previous.namesToScreen);
    const recomputed = deriveComplianceState(c, {
      previous: { ...previous, namesToScreen: names },
    });
    const persisted = await upsertComplianceState(recomputed);
    // Mirror the synced list back onto the case so the screening tab keeps
    // showing the same set.
    await persistCase(syncCaseScreeningFromCompliance(c, persisted.namesToScreen));
    return persisted;
  });

export const runStepperScreening = createServerFn({ method: "POST" })
  .validator((d: { caseId: string }) => d)
  .handler(async ({ data }): Promise<StepperComplianceState> => {
    let c = await loadCase(data.caseId);
    const previous = (await loadComplianceState(data.caseId)) ?? emptyStepperComplianceState(c.caseId);
    let names = buildNamesToScreen(c, previous.namesToScreen);

    // Pre-flight: if the OpenSanctions API key isn't configured, fail fast
    // with one clear audit event rather than N×"401 Unauthorized" entries.
    if (!hasOpenSanctionsKey()) {
      const message =
        "OpenSanctions API key not configured. Set OPENSANCTIONS_API_KEY in your .env (see https://www.opensanctions.org/api/) to run screening.";
      c = appendAudit(c, "Screening configuration missing", message, "System");
      await persistCase(c);
      throw new Error(message);
    }

    const screenedAt = now();
    const newAudit: StepperAuditEvent[] = [];

    names = await Promise.all(
      names.map(async (n) => {
        if (n.screeningStatus === "Screening completed" || n.screeningStatus === "Screening in progress") {
          return n;
        }
        try {
          const matches = await searchOpenSanctions(n.name, {
            schema: schemaForPartyType(n.partyType),
            limit: 5,
          });
          newAudit.push({
            id: id("au"),
            at: now(),
            actor: "Compliance",
            type: "Screening completed",
            detail: `${n.name}: ${matches.length} match${matches.length === 1 ? "" : "es"}.`,
          });
          return {
            ...n,
            screeningStatus: "Screening completed" as const,
            provider: OPENSANCTIONS_PROVIDER,
            screenedAt,
            matches,
            error: undefined,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          newAudit.push({
            id: id("au"),
            at: now(),
            actor: "Compliance",
            type: "Screening failed",
            detail: `${n.name}: ${message}`,
          });
          return {
            ...n,
            screeningStatus: "Screening failed" as const,
            provider: OPENSANCTIONS_PROVIDER,
            screenedAt,
            matches: undefined,
            error: message,
          };
        }
      }),
    );

    const recomputed = deriveComplianceState(c, {
      previous: { ...previous, namesToScreen: names },
    });
    const persisted = await upsertComplianceState(recomputed);

    c = syncCaseScreeningFromCompliance(c, persisted.namesToScreen);
    c = { ...c, audit: [...c.audit, ...newAudit], lastSavedAt: now() };
    await persistCase(c);
    return persisted;
  });

/* ─── RFI server fns ───────────────────────────────────────────────────── */

async function loadOrInit(caseId: string): Promise<StepperComplianceState> {
  const existing = await loadComplianceState(caseId);
  if (existing) return existing;
  const c = await loadCase(caseId);
  return await initialiseComplianceForCase(c);
}

export const addStepperRfiDraft = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; text: string }) => d)
  .handler(async ({ data }): Promise<StepperComplianceState> => {
    const state = await loadOrInit(data.caseId);
    const next = applyAddRfiDraft(state, data.text);
    const persisted = await upsertComplianceState(next);
    const c = await loadCase(data.caseId);
    await persistCase(appendAudit(c, "RFI drafted", data.text.trim()));
    return persisted;
  });

export const sendStepperRfis = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; rfiIds: string[] }) => d)
  .handler(async ({ data }): Promise<StepperComplianceState> => {
    const state = await loadOrInit(data.caseId);
    const next = applySendRfis(state, data.rfiIds);
    const persisted = await upsertComplianceState(next);
    const c = await loadCase(data.caseId);
    await persistCase(
      appendAudit(
        c,
        "RFIs sent to investor",
        `${data.rfiIds.length} item${data.rfiIds.length === 1 ? "" : "s"} sent.`,
      ),
    );
    return persisted;
  });

export const respondToStepperRfi = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; rfiId: string; responseText: string }) => d)
  .handler(async ({ data }): Promise<StepperComplianceState> => {
    const state = await loadOrInit(data.caseId);
    const next = applyRespondToRfi(state, data.rfiId, data.responseText);
    const persisted = await upsertComplianceState(next);
    const c = await loadCase(data.caseId);
    await persistCase(
      appendAudit(c, "RFI response received", data.responseText.trim(), "Investor"),
    );
    return persisted;
  });

export const markStepperRfiResolved = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; rfiId: string; note?: string }) => d)
  .handler(async ({ data }): Promise<StepperComplianceState> => {
    const state = await loadOrInit(data.caseId);
    const next = applyMarkRfiResolved(state, data.rfiId, data.note);
    const persisted = await upsertComplianceState(next);
    const c = await loadCase(data.caseId);
    await persistCase(
      appendAudit(c, "RFI resolved", data.note ?? "Marked resolved by compliance officer."),
    );
    return persisted;
  });

/* ─── Reviewer decisions + flag actions ────────────────────────────────── */

/**
 * Record the reviewer's verdict on a case. Appends a real audit event so the
 * decision is visible in the Audit tab and survives reload — no more "(demo)"
 * toasts that vanish on refresh. The returned case has the new audit row
 * already so the client can `setCase(persisted)` and re-render in place.
 */
export const recordReviewerDecision = createServerFn({ method: "POST" })
  .validator(
    (d: {
      caseId: string;
      decision: "approved" | "escalated" | "rejected" | "info_requested";
      note?: string;
    }) => d,
  )
  .handler(async ({ data }): Promise<StepperCase> => {
    const c = await loadCase(data.caseId);
    const label =
      data.decision === "approved"
        ? "Case approved by compliance officer"
        : data.decision === "escalated"
          ? "Case escalated to senior compliance"
          : data.decision === "rejected"
            ? "Case rejected by compliance officer"
            : "Information request initiated";
    const detail = data.note?.trim()
      ? data.note.trim()
      : data.decision === "approved"
        ? "Acceptance email will be queued for the investor."
        : data.decision === "escalated"
          ? "MLRO has been notified; case state is now locked."
          : data.decision === "rejected"
            ? "Rejection notice and reason are stored on file."
            : "Drafted on the Requests tab.";
    return await persistCase(appendAudit(c, label, detail));
  });

/**
 * Record a per-flag action (Mark exception / Resolve). The compliance state
 * row itself isn't mutated — flag status is a function of derived rules. But
 * the action is captured in the audit trail so the reviewer's reasoning
 * survives reload.
 */
export const recordFlagAction = createServerFn({ method: "POST" })
  .validator(
    (d: {
      caseId: string;
      flagRule: string;
      flagDescription: string;
      action: "exception" | "resolved";
      note?: string;
    }) => d,
  )
  .handler(async ({ data }): Promise<StepperCase> => {
    const c = await loadCase(data.caseId);
    const verb =
      data.action === "exception" ? "Flag exception marked" : "Flag resolved";
    const detail = `${data.flagRule} · ${data.flagDescription}${data.note?.trim() ? ` — ${data.note.trim()}` : ""}`;
    return await persistCase(appendAudit(c, verb, detail));
  });
