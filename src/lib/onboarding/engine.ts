import type { ConversationMessage, OnboardingCase, EmbeddedComponent } from "./types";

type RiskOutcome = OnboardingCase["complianceOnly"]["suggestedOutcome"];
type RiskBand = OnboardingCase["complianceOnly"]["riskBand"];

const id = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

/* ---------- Message helpers (shared between client and server) ---------- */

export function agentMsg(text: string, component?: EmbeddedComponent): ConversationMessage {
  return { id: id(), author: "agent", text, at: now(), component };
}

export function investorMsg(text: string): ConversationMessage {
  return { id: id(), author: "investor", text, at: now() };
}

export function systemMsg(text: string): ConversationMessage {
  return { id: id(), author: "system", text, at: now() };
}

/* ---------- Progress recompute ---------- */

/* ---------- Display helpers ---------- */

/**
 * Friendly label for a case picker / header. Falls back to the case id when the
 * investor hasn't confirmed their identity yet (so the chip doesn't render empty).
 */
export function investorDisplayName(c: Pick<OnboardingCase, "investorName" | "caseId">): string {
  if (c.investorName && c.investorName.trim().length > 0) return c.investorName;
  return `Case ${c.caseId}`;
}

/* ---------- Risk recompute ---------- */

export interface RiskAssessment {
  riskScore: number;
  riskBand: RiskBand;
  suggestedOutcome: RiskOutcome;
}

/**
 * Derive a numeric risk score, band and suggested outcome from the live case state.
 * Pure function — runs whenever the case is persisted.
 *
 * Weighting:
 *   - Red flags:      High +25, Medium +10, Low +3
 *   - Open checklist: "Attention required" +5, "Missing" +5
 *   - PEP marks:      any non-"no" +15
 *   - Screening:      any name with ≥1 match +20
 */
export function recomputeRisk(c: OnboardingCase): RiskAssessment {
  let score = 0;
  for (const f of c.complianceOnly.redFlags) {
    if (f.severity === "High") score += 25;
    else if (f.severity === "Medium") score += 10;
    else score += 3;
  }
  for (const item of c.checklist) {
    if (item.status === "Attention required" || item.status === "Missing") score += 5;
  }
  for (const p of c.relatedParties) {
    if (p.pepStatus && p.pepStatus !== "no") score += 15;
  }
  const screeningHits = c.complianceOnly.namesToScreen.filter(
    (n) => n.screeningStatus === "Screening completed" && (n.matches?.length ?? 0) > 0,
  ).length;
  score += screeningHits * 20;

  const riskScore = Math.min(100, score);
  const riskBand: RiskBand = riskScore >= 60 ? "High" : riskScore >= 25 ? "Medium" : "Low";

  const hasHigh = c.complianceOnly.redFlags.some((f) => f.severity === "High");
  const screeningRan = c.complianceOnly.namesToScreen.some(
    (n) => n.screeningStatus === "Screening completed" || n.screeningStatus === "Screening failed",
  );
  const allChecklistOk =
    c.checklist.length > 0 &&
    c.checklist.every(
      (i) =>
        i.status === "Received" ||
        i.status === "Accepted for onboarding review" ||
        i.status === "Replaced" ||
        i.status === "Investor confirmed",
    );

  let suggestedOutcome: RiskOutcome;
  if (hasHigh || screeningHits > 0) {
    suggestedOutcome = "PENDING";
  } else if (riskScore >= 70) {
    suggestedOutcome = "PENDING";
  } else if (c.finalConfirmation && allChecklistOk && screeningRan && riskScore < 25) {
    suggestedOutcome = "PASS";
  } else {
    suggestedOutcome = "PENDING";
  }

  return { riskScore, riskBand, suggestedOutcome };
}

/** Returns a new case with complianceOnly.{riskScore, riskBand, suggestedOutcome} refreshed. */
export function withRecomputedRisk(c: OnboardingCase): OnboardingCase {
  const r = recomputeRisk(c);
  const co = c.complianceOnly;
  if (
    co.riskScore === r.riskScore &&
    co.riskBand === r.riskBand &&
    co.suggestedOutcome === r.suggestedOutcome
  ) {
    return c;
  }
  return { ...c, complianceOnly: { ...co, ...r } };
}

/** Derive progressPct from stageStatus — the only progress source of truth. */
export function recomputeProgress(c: OnboardingCase): number {
  const stageWeights: Record<string, number> = {
    "Investor profile": 10,
    Documents: 25,
    "Ownership and related parties": 15,
    "Source of Wealth and Source of Funds": 15,
    Declarations: 15,
    "Review and confirmation": 10,
    "Submitted to Compliance": 10,
  };
  let total = 0;
  for (const [stage, weight] of Object.entries(stageWeights)) {
    const status = c.stageStatus[stage as keyof typeof c.stageStatus];
    if (status === "Confirmed" || status === "Submitted") total += weight;
    else if (status === "Ready for review") total += weight * 0.8;
    else if (status === "In progress" || status === "Action required") total += weight * 0.4;
  }
  return Math.min(100, Math.round(total));
}
