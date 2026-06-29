import { CheckCircle2 } from "lucide-react";
import type { StepperUploadedDocument } from "@/lib/stepper/types";

/**
 * Renders in place of the bulk-upload strip once every requirement is satisfied.
 * Pure status — the Continue action lives in the canonical StepFooter so users
 * don't see three different "Continue" affordances on the same screen.
 */
export function DocumentsCompleteBanner({
  total,
  docs,
}: {
  total: number;
  docs: StepperUploadedDocument[];
}) {
  const high = docs.filter((d) => d.classificationConfidence === "high").length;
  const medium = docs.filter((d) => d.classificationConfidence === "medium").length;
  const low = docs.filter((d) => d.classificationConfidence === "low").length;
  const needsEye = medium + low;

  /**
   * Scroll to the first non-high-confidence document on the page so the user
   * can verify the values that were flagged for double-check. Falls back to a
   * no-op if no such doc exists (defensive — needsEye should be > 0 to render).
   */
  const onScrollToReview = () => {
    const flagged = docs.find(
      (d) => d.classificationConfidence === "medium" || d.classificationConfidence === "low",
    );
    if (!flagged) return;
    const reqKey = flagged.matchedRequirementKeys[0];
    if (!reqKey) return;
    const el = document.querySelector(`[data-testid='slot-${reqKey}']`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Brief outline pulse to draw the eye.
    if (el instanceof HTMLElement) {
      el.classList.add("doc-attention-pulse");
      window.setTimeout(() => el.classList.remove("doc-attention-pulse"), 1800);
    }
  };

  return (
    <div
      data-testid="documents-complete-banner"
      className="mt-6 overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-br from-accent/[0.08] via-accent/[0.02] to-transparent"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
          <CheckCircle2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            All {total} documents received and validated
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {high > 0 && <span>{high} high confidence</span>}
            {high > 0 && needsEye > 0 && <span> · </span>}
            {needsEye > 0 && (
              <button
                type="button"
                data-testid="documents-complete-needs-review"
                onClick={onScrollToReview}
                className="rounded text-[color:var(--attention)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[color:var(--attention)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {needsEye} to double-check before continuing →
              </button>
            )}
            {high === total && <span> · ready to continue</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
