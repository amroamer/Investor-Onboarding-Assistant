import { CheckCircle2, MessageSquarePlus, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { StepperComplianceState } from "@/lib/stepper/compliance";

/**
 * Sticky decision action bar. The four reviewer actions live here:
 *   Approve · Request information · Escalate · Reject
 *
 * For the prototype these emit toasts. A real backend would persist a
 * decision row and lock the case. The "Request information" action takes a
 * navigation callback so the host can pivot to the Requests tab.
 */
export function DecisionBar({
  state,
  onRequestInfo,
  onApprove,
  onEscalate,
  onReject,
}: {
  state: StepperComplianceState;
  onRequestInfo: () => void;
  onApprove?: () => void;
  onEscalate?: () => void;
  onReject?: () => void;
}) {
  const handleApprove = () => {
    if (onApprove) return onApprove();
    toast.success("Decision recorded — case approved (demo).", {
      description: "An acceptance email would be queued for the investor.",
    });
  };
  const handleEscalate = () => {
    if (onEscalate) return onEscalate();
    toast("Case escalated to senior compliance (demo).", {
      description: "MLRO would be notified and case state would lock.",
    });
  };
  const handleReject = () => {
    if (onReject) return onReject();
    toast.error("Decision recorded — case rejected (demo).", {
      description: "A rejection notice and reason would be stored on file.",
    });
  };

  const summary =
    state.suggestedOutcome === "FAIL"
      ? "Sanctions hit detected — block recommended."
      : state.suggestedOutcome === "PENDING"
        ? `${state.redFlags.length} open issue${state.redFlags.length === 1 ? "" : "s"} — request information or escalate.`
        : "No blocking signals — safe to approve once review is complete.";

  return (
    <div
      data-testid="decision-bar"
      className="step-item-in sticky bottom-4 z-30 mx-auto mt-6 max-w-[1280px]"
    >
      <div className="overflow-hidden rounded-2xl border bg-surface shadow-[0_18px_44px_rgba(12,20,48,0.16)] ring-1 ring-border/60 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Reviewer decision
            </div>
            <div className="mt-0.5 truncate text-[13px] font-medium text-foreground">{summary}</div>
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
              data-testid="decision-escalate"
              className="border-[color:var(--attention)]/30 text-[color:var(--attention)] hover:bg-[color:var(--attention)]/5"
            >
              <ShieldAlert className="size-3.5" /> Escalate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              data-testid="decision-reject"
              className="border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              <XCircle className="size-3.5" /> Reject
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              data-testid="decision-approve"
              className="bg-[color:var(--success)] text-[color:var(--success-foreground)] hover:bg-[#0a805a]"
            >
              <CheckCircle2 className="size-3.5" /> Approve
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
