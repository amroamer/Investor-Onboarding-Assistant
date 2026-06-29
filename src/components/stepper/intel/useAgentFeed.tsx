/**
 * Hook: derive the AgentPanel inputs (phase, progress, findings, activity)
 * for the current step from real case data.
 *
 * Findings and the "Why this matters" copy are per-step constants supplied
 * by the caller. Activity is always pulled from `caseData.audit`, humanised.
 */

import { useMemo } from "react";
import type { StepperCase } from "@/lib/stepper/types";
import { computeReadiness } from "@/lib/stepper/readiness";
import type { AgentPhase, AgentActivity, AgentFinding } from "./AgentPanel";
import { humaniseAuditEvent, recentDocEvents, formatRelative } from "./auditCopy";

/** Derive the active phase based on what's happening in the case right now. */
export function derivePhase(c: StepperCase, stepKey: string): AgentPhase {
  const docInFlight = c.uploadedDocuments.some(
    (d) =>
      d.processingPhase === "reading" ||
      d.processingPhase === "classifying" ||
      d.processingPhase === "matching" ||
      d.processingPhase === "pending",
  );
  if (docInFlight) return "reading";

  switch (stepKey) {
    case "profile":
      return "idle";
    case "documents":
      return c.uploadedDocuments.length > 0 ? "validating" : "idle";
    case "ownership":
      return "extracting";
    case "sow-sof":
      return "drafting";
    case "declarations":
      return "validating";
    case "review":
      return "ready";
    case "submitted":
      return "ready";
    default:
      return "idle";
  }
}

/** Convert recent audit entries into AgentActivity rows. */
export function buildActivity(c: StepperCase, limit = 8): AgentActivity[] {
  const events = recentDocEvents(c.audit, limit);
  return events.map((e) => {
    const detail = humaniseAuditEvent(e);
    const lower = (e.type + " " + e.detail).toLowerCase();
    const warn = /attention|fail|mismatch|duplicate|warn/.test(lower);
    const running = /reading|classifying|matching/.test(lower);
    return {
      id: e.id,
      label: detail,
      time: formatRelative(e.at),
      warn,
      running,
    };
  });
}

interface UseAgentFeedArgs {
  caseData: StepperCase;
  stepKey: string;
}

export function useAgentFeed({ caseData, stepKey }: UseAgentFeedArgs) {
  const readiness = useMemo(() => computeReadiness(caseData), [caseData]);
  const phase = derivePhase(caseData, stepKey);
  const activity = buildActivity(caseData);

  // Default findings, mostly identity / readiness-derived. Steps can append.
  const findings: AgentFinding[] = useMemo(() => {
    const out: AgentFinding[] = [];
    if (readiness.documentsReceived > 0) {
      out.push({
        label: `${readiness.documentsReceived}/${readiness.documentsRequired} documents received`,
        tone: readiness.documentsReceived === readiness.documentsRequired ? "complete" : "info",
      });
    }
    if (readiness.extractedFacts > 0) {
      out.push({
        label: `${readiness.extractedFacts} facts extracted`,
        value:
          readiness.verifiedFacts > 0
            ? `${readiness.verifiedFacts} verified automatically`
            : undefined,
        tone: "complete",
      });
    }
    if (readiness.mediumConfidenceDocs > 0) {
      out.push({
        label: `${readiness.mediumConfidenceDocs} item to double-check`,
        tone: "warning",
      });
    }
    if (readiness.blockingIssues > 0) {
      out.push({
        label: `${readiness.blockingIssues} blocking issue${readiness.blockingIssues === 1 ? "" : "s"}`,
        tone: "warning",
      });
    }
    return out;
  }, [readiness]);

  const progressPct = useMemo(() => {
    if (stepKey === "documents" && readiness.documentsRequired > 0) {
      return Math.round((readiness.documentsReceived / readiness.documentsRequired) * 100);
    }
    return readiness.readinessPercentage;
  }, [stepKey, readiness]);

  return { phase, activity, findings, progressPct, readiness };
}
