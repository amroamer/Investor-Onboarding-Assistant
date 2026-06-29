import { CheckCircle2, AlertCircle, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CaseReadiness } from "@/lib/stepper/readiness";

interface Props {
  readiness: CaseReadiness;
  /** When true, render the compact variant suitable for the right intelligence panel. */
  compact?: boolean;
  className?: string;
}

/**
 * Case readiness widget — used both as the Review hero ("Ready for submission")
 * and inside the intelligence panel on every step.
 */
export function ReadinessSummary({ readiness, compact = false, className }: Props) {
  const r = readiness;
  const ready = r.readinessPercentage >= 100 && r.blockingIssues === 0;
  const heading = ready ? "Ready for submission" : "Case readiness";

  if (compact) {
    return (
      <div
        data-testid="readiness-summary-compact"
        className={cn("rounded-xl border bg-surface p-4", className)}
      >
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Readiness
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">{r.readinessPercentage}%</div>
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span
            className={cn(
              "text-3xl font-light tabular-nums",
              ready ? "text-accent" : "text-foreground",
            )}
          >
            {r.readinessPercentage}
          </span>
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              ready ? "bg-accent" : "bg-primary",
            )}
            style={{ width: `${r.readinessPercentage}%` }}
          />
        </div>
        {r.blockingIssues > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-[color:var(--attention)]/10 px-2.5 py-1.5 text-xs text-[color:var(--attention)]">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>
              {r.blockingIssues} blocking issue{r.blockingIssues === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="readiness-summary"
      className={cn(
        "overflow-hidden rounded-2xl border bg-gradient-to-br p-6 shadow-sm",
        ready
          ? "border-accent/30 from-accent/[0.08] via-accent/[0.02] to-transparent"
          : "border-border from-primary/[0.04] via-transparent to-accent/[0.02]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full",
              ready ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {ready ? <CheckCircle2 className="size-6" /> : <Sparkles className="size-6" />}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Case readiness
            </div>
            <div className="text-2xl font-light tracking-tight text-foreground">{heading}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {ready
                ? "All required information is in place. Confirm and submit when you're ready."
                : `${r.readinessPercentage}% complete — finish the remaining steps to submit.`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Overall
          </div>
          <div className="text-3xl font-light tabular-nums text-foreground">
            {r.readinessPercentage}
            <span className="text-base text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          icon={<FileText className="size-4" />}
          label="Documents"
          value={`${r.documentsReceived}/${r.documentsRequired}`}
          ok={r.documentsReceived === r.documentsRequired && r.documentsRequired > 0}
        />
        <Metric
          icon={<Sparkles className="size-4" />}
          label="Facts extracted"
          value={`${r.extractedFacts}`}
        />
        <Metric
          icon={<CheckCircle2 className="size-4" />}
          label="Verified"
          value={`${r.verifiedFacts}`}
          ok={r.verifiedFacts === r.extractedFacts && r.extractedFacts > 0}
        />
        <Metric
          icon={<AlertCircle className="size-4" />}
          label="Needs review"
          value={`${r.needsReviewItems}`}
          attention={r.needsReviewItems > 0}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <StatusChip ok={r.profileComplete} label="Profile" />
        <StatusChip ok={r.documentsComplete} label="Documents" />
        <StatusChip ok={r.ownershipComplete} label="Ownership" />
        <StatusChip
          ok={r.sourceOfWealthComplete && r.sourceOfFundsComplete}
          label="Source of Wealth & Funds"
        />
        <StatusChip ok={r.declarationsComplete} label="Declarations" />
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  ok,
  attention,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok?: boolean;
  attention?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span
          className={cn(
            ok && "text-accent",
            attention && "text-[color:var(--attention)]",
            !ok && !attention && "text-muted-foreground",
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-light tabular-nums",
          ok && "text-accent",
          attention && "text-[color:var(--attention)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        ok
          ? "border-accent/30 bg-accent/[0.06] text-accent"
          : "border-muted-foreground/20 bg-surface text-muted-foreground",
      )}
    >
      {ok ? <CheckCircle2 className="size-3" /> : <span className="size-3 rounded-full border" />}
      {label}
    </span>
  );
}
