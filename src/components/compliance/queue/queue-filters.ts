/**
 * Pure sort + filter helpers for the compliance queue. Extracted so they can
 * be unit-tested without React or TanStack Query in the way.
 *
 * Inputs are always `StepperCase` arrays plus an optional `state` lookup. The
 * `state` lookup is `caseId → StepperComplianceState | undefined` — the
 * `undefined` case covers "not yet loaded" and is treated as the most
 * pessimistic value for sorting (e.g. `riskScore = -1` so unloaded cards
 * land at the bottom of a "highest risk" sort).
 */

import type { StepperCase } from "@/lib/stepper/types";
import type { StepperComplianceState } from "@/lib/stepper/compliance";
import { caseSlaState } from "@/lib/stepper/compliance-sla";

export type QueueSort = "submitted-newest" | "sla-urgent" | "risk-highest" | "flags-most";

export type QueueFilter =
  | "all"
  | "pass"
  | "pending"
  | "fail"
  | "has-rfi"
  | "screening-pending"
  | "high-risk";

export type StateLookup = (caseId: string) => StepperComplianceState | undefined;

export function filterQueue(
  cases: StepperCase[],
  filter: QueueFilter,
  search: string,
  lookup: StateLookup,
  includeInProgress: boolean,
): StepperCase[] {
  const q = search.trim().toLowerCase();
  return cases.filter((c) => {
    if (!includeInProgress && !c.submittedAt) return false;
    if (q) {
      const name = (c.profile?.investorName ?? "").toLowerCase();
      if (!name.includes(q) && !c.caseId.toLowerCase().includes(q)) return false;
    }
    if (filter === "all") return true;
    const state = lookup(c.caseId);
    if (!state) {
      // We don't know the outcome yet — filters that depend on state can't
      // match. Treat "screening-pending" as match-by-default so loading rows
      // don't temporarily disappear.
      return filter === "screening-pending";
    }
    switch (filter) {
      case "pass":
        return state.suggestedOutcome === "PASS";
      case "pending":
        return state.suggestedOutcome === "PENDING";
      case "fail":
        return state.suggestedOutcome === "FAIL";
      case "has-rfi":
        return state.furtherInfoRequests.some((r) => r.status !== "resolved");
      case "screening-pending":
        return (
          state.namesToScreen.length === 0 ||
          state.namesToScreen.some((n) => n.screeningStatus !== "Screening completed")
        );
      case "high-risk":
        return state.riskBand === "High";
    }
  });
}

export function sortQueue(
  cases: StepperCase[],
  sort: QueueSort,
  lookup: StateLookup,
): StepperCase[] {
  const out = [...cases];
  switch (sort) {
    case "submitted-newest":
      out.sort((a, b) => {
        const ad = new Date(a.submittedAt ?? a.lastSavedAt).getTime();
        const bd = new Date(b.submittedAt ?? b.lastSavedAt).getTime();
        return bd - ad;
      });
      break;
    case "sla-urgent":
      out.sort((a, b) => {
        const ah = caseSlaState(a).hoursLeft;
        const bh = caseSlaState(b).hoursLeft;
        // Unsubmitted cases (null hoursLeft) sink to the bottom.
        if (ah == null && bh == null) return 0;
        if (ah == null) return 1;
        if (bh == null) return -1;
        return ah - bh;
      });
      break;
    case "risk-highest":
      out.sort((a, b) => {
        const ar = lookup(a.caseId)?.riskScore ?? -1;
        const br = lookup(b.caseId)?.riskScore ?? -1;
        return br - ar;
      });
      break;
    case "flags-most":
      out.sort((a, b) => {
        const ac = lookup(a.caseId)?.redFlags.length ?? -1;
        const bc = lookup(b.caseId)?.redFlags.length ?? -1;
        return bc - ac;
      });
      break;
  }
  return out;
}

export interface QueueKpis {
  total: number;
  submitted: number;
  awaitingScreening: number;
  awaitingRfi: number;
  overdueSla: number;
  highRisk: number;
  failOutcome: number;
}

export function computeQueueKpis(cases: StepperCase[], lookup: StateLookup): QueueKpis {
  let submitted = 0;
  let awaitingScreening = 0;
  let awaitingRfi = 0;
  let overdueSla = 0;
  let highRisk = 0;
  let failOutcome = 0;
  for (const c of cases) {
    if (c.submittedAt) submitted += 1;
    const sla = caseSlaState(c);
    if (sla.tone === "danger") overdueSla += 1;
    const state = lookup(c.caseId);
    if (!state) continue;
    if (state.riskBand === "High") highRisk += 1;
    if (state.suggestedOutcome === "FAIL") failOutcome += 1;
    if (state.furtherInfoRequests.some((r) => r.status === "sent" || r.status === "responded")) {
      awaitingRfi += 1;
    }
    if (
      state.namesToScreen.length === 0 ||
      state.namesToScreen.some((n) => n.screeningStatus !== "Screening completed")
    ) {
      awaitingScreening += 1;
    }
  }
  return {
    total: cases.length,
    submitted,
    awaitingScreening,
    awaitingRfi,
    overdueSla,
    highRisk,
    failOutcome,
  };
}
