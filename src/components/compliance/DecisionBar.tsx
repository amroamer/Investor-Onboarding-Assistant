import { useMemo } from "react";
import { CheckCircle2, MessageSquarePlus, ShieldAlert, XCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StepperComplianceState } from "@/lib/stepper/compliance";
import type { StepperAuditEvent } from "@/lib/stepper/types";
import { StatusChip } from "./primitives/StatusChip";

type DecisionVerb = "approved" | "escalated" | "rejected";

/**
 * Sticky decision action bar. The four reviewer actions live here:
 *   Approve · Request information · Escalate · Reject
 *
 * The host (StepperComplianceView) supplies real handlers that persist each
 * verdict as a real audit event via `recordReviewerDecision`. The bar inspects
 * the latest decision-typed audit event to:
 *   - show a "Decision recorded" badge with the verdict,
 *   - disable Approve/Escalate/Reject so they can't be double-clicked.
 *
 * Request information is always enabled — additional info can be requested
 * even after an initial decision.
 */
export function DecisionBar({
  state,
  audit,
  onRequestInfo,
  onApprove,
  onEscalate,
  onReject,
}: {
  state: StepperComplianceState;
  /** Pass the case audit list so we can detect any prior decision. */
  audit: StepperAuditEvent[];
  onRequestInfo: () => void;
  onApprove?: () => void;
  onEscalate?: () => void;
  onReject?: () => void;
}) {
  const lastDecision = useMemo(() => detectLastDecision(audit), [audit]);

  const handleApprove = () => {
    if (onApprove) return onApprove();
    toast.success("Approval recorded.");
  };
  const handleEscalate = () => {
    if (onEscalate) return onEscalate();
    toast("Escalation recorded.");
  };
  const handleReject = () => {
    if (onReject) return onReject();
    toast.error("Rejection recorded.");
  };

  const summary = lastDecision
    ? lastDecision.summary
    : state.suggestedOutcome === "FAIL"
      ? "Sanctions hit detected — block recommended."
      : state.suggestedOutcome === "PENDING"
        ? `${state.redFlags.length} open issue${state.redFlags.length === 1 ? "" : "s"} — request information or escalate.`
        : "No blocking signals — safe to approve once review is complete.";

  const locked = !!lastDecision;

  return (
    <div
      data-testid="decision-bar"
      className="step-item-in sticky bottom-4 z-30 mx-auto mt-6 max-w-[1480px]"
    >
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-surface shadow-[0_18px_44px_rgba(12,20,48,0.16)] ring-1 ring-border/60 backdrop-blur",
          locked && "border-[color:var(--success)]/30",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {locked ? <Lock className="size-3" /> : null}
              {locked ? "Decision recorded" : "Reviewer decision"}
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <span className="truncate text-[13px] font-medium text-foreground">{summary}</span>
              {lastDecision && (
                <StatusChip size="xs" tone={lastDecision.tone} dot={false}>
                  {lastDecision.label}
                </StatusChip>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRequestInfo}
              data-testid="decision-request-info"
              className="border-accent/30 text-accent hover:bg-accent/5"
            >
              <MessageSquarePlus className="size-3.5" /> Request information
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleEscalate}
              disabled={locked}
              data-testid="decision-escalate"
              className="border-[color:var(--attention)]/30 text-[color:var(--attention)] hover:bg-[color:var(--attention)]/5"
            >
              <ShieldAlert className="size-3.5" /> Escalate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              disabled={locked}
              data-testid="decision-reject"
              className="border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              <XCircle className="size-3.5" /> Reject
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={locked}
              data-testid="decision-approve"
              className="bg-[color:var(--success)] text-[color:var(--success-foreground)] hover:bg-[#0a805a]"
            >
              <CheckCircle2 className="size-3.5" />
              {locked && lastDecision?.verb === "approved" ? "Approved" : "Approve"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Scan the audit list backwards for the most recent reviewer decision. Lets
 * the bar surface a "Decision recorded · Approved" badge and disable the
 * destructive buttons so the verdict can't be flipped by another click.
 *
 * Detection is by audit event `type` — the strings written by
 * `recordReviewerDecision` on the server.
 */
function detectLastDecision(audit: StepperAuditEvent[]): {
  verb: DecisionVerb;
  label: string;
  summary: string;
  tone: "success" | "warn" | "danger";
  at: string;
} | null {
  for (let i = audit.length - 1; i >= 0; i -= 1) {
    const a = audit[i];
    const t = a.type.toLowerCase();
    if (t === "case approved by compliance officer") {
      return {
        verb: "approved",
        label: "Approved",
        summary: `Approved · ${new Date(a.at).toLocaleString()}`,
        tone: "success",
        at: a.at,
      };
    }
    if (t === "case escalated to senior compliance") {
      return {
        verb: "escalated",
        label: "Escalated",
        summary: `Escalated to senior compliance · ${new Date(a.at).toLocaleString()}`,
        tone: "warn",
        at: a.at,
      };
    }
    if (t === "case rejected by compliance officer") {
      return {
        verb: "rejected",
        label: "Rejected",
        summary: `Rejected · ${new Date(a.at).toLocaleString()}`,
        tone: "danger",
        at: a.at,
      };
    }
  }
  return null;
}
