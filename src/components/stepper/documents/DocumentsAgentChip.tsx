import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepperCase } from "@/lib/stepper/types";

/**
 * Sticky agent strip at the top of the Documents step. Shows a single line of
 * live status while uploads are processing, plus the X/N matched counter.
 *
 * Lives only inside .doc-step-v2 — does not appear on any other step.
 */
export function DocumentsAgentChip({
  caseData,
  satisfied,
  total,
}: {
  caseData: StepperCase;
  satisfied: number;
  total: number;
}) {
  const inFlight = caseData.uploadedDocuments.some(
    (d) => d.processingPhase !== "ready" && d.processingPhase !== "failed" && d.processingPhase !== "duplicate",
  );

  const status = inFlight
    ? caseData.agentStatus ?? "Reading…"
    : caseData.agentStatus ?? defaultIdleMessage(satisfied, total);

  return (
    <div
      data-testid="documents-agent-chip"
      className={cn(
        "sticky top-0 z-10 -mx-6 flex items-center justify-between gap-3 border-b bg-surface/95 px-6 py-3 backdrop-blur",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground", inFlight && "doc-pulse")}>
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Onboarding agent</div>
          <div
            data-testid="documents-agent-status"
            className={cn("truncate text-sm text-foreground", inFlight && "doc-typing")}
          >
            {status}
          </div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div data-testid="documents-counter" className="text-lg font-semibold tabular-nums text-primary">
          {satisfied} / {total}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">received</div>
      </div>
    </div>
  );
}

function defaultIdleMessage(satisfied: number, total: number): string {
  if (satisfied === 0) return "Drop a document into any slot below — I'll do the rest.";
  if (satisfied < total) return `${total - satisfied} item${total - satisfied === 1 ? "" : "s"} to go. Add the next one when you're ready.`;
  return "Everything's in. Take a quick look, then continue.";
}
