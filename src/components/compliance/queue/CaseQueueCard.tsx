import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Clock,
  FileText,
  ListChecks,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepperCase } from "@/lib/stepper/types";
import {
  caseSlaState,
  formatRelative,
  type SlaTone,
} from "@/lib/stepper/compliance-sla";
import type { StepperComplianceState } from "@/lib/stepper/compliance";
import { getStepperComplianceState } from "@/server/stepper/compliance";
import { StatusChip, type StatusTone } from "../primitives/StatusChip";

const stateQueryKey = (caseId: string) => ["stepper-compliance-state", caseId] as const;

const DECISION_TONE: Record<"PASS" | "FAIL" | "PENDING", StatusTone> = {
  PASS: "success",
  FAIL: "danger",
  PENDING: "warn",
};
const DECISION_LABEL: Record<"PASS" | "FAIL" | "PENDING", string> = {
  PASS: "Suggested pass",
  FAIL: "Suggested reject",
  PENDING: "Conditional pass",
};
const BAND_TONE: Record<"Low" | "Medium" | "High", StatusTone> = {
  Low: "success",
  Medium: "warn",
  High: "danger",
};
const SLA_TONE: Record<SlaTone, StatusTone> = {
  neutral: "neutral",
  warn: "warn",
  danger: "danger",
};

/** Tiny screening rollup just like the cockpit hero uses. */
function screeningRollup(state: StepperComplianceState | undefined): {
  label: string;
  tone: StatusTone;
} {
  if (!state || state.namesToScreen.length === 0) {
    return { label: "Not run", tone: "neutral" };
  }
  const completed = state.namesToScreen.filter((n) => n.screeningStatus === "Screening completed");
  if (completed.length === 0) return { label: "Not run", tone: "neutral" };
  const hits = completed.reduce((s, n) => s + (n.matches?.length ?? 0), 0);
  if (completed.length < state.namesToScreen.length) {
    return { label: "Mixed", tone: "warn" };
  }
  return hits > 0
    ? { label: "Hits found", tone: "danger" }
    : { label: "Clear", tone: "success" };
}

/** Total RFI threads not in 'resolved' state. */
function openRfis(state: StepperComplianceState | undefined): number {
  if (!state) return 0;
  return state.furtherInfoRequests.filter((r) => r.status !== "resolved").length;
}

export function CaseQueueCard({ caseData }: { caseData: StepperCase }) {
  const { data: state, isLoading } = useQuery({
    queryKey: stateQueryKey(caseData.caseId),
    queryFn: () => getStepperComplianceState({ data: { caseId: caseData.caseId } }),
    // Cards stay relatively cool — the cockpit page polls aggressively; here
    // we just refresh on focus to pick up other-officer activity.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: !!caseData.submittedAt,
  });

  const sla = caseSlaState(caseData);
  const slaTone = SLA_TONE[sla.tone];
  const isSubmitted = !!caseData.submittedAt;

  const accentClass = !isSubmitted
    ? "before:bg-muted-foreground/40"
    : !state
      ? "before:bg-border"
      : state.suggestedOutcome === "FAIL"
        ? "before:bg-destructive"
        : state.suggestedOutcome === "PENDING"
          ? "before:bg-[color:var(--warn)]"
          : "before:bg-[color:var(--success)]";

  const screening = screeningRollup(state);
  const openIssues = state?.redFlags.length ?? 0;
  const docCount = caseData.uploadedDocuments.length;
  const rfis = openRfis(state);

  return (
    <li className="list-none" role="listitem">
      <Link
        to="/compliance/case/$caseId"
        params={{ caseId: caseData.caseId }}
        data-testid="queue-card"
        data-case-id={caseData.caseId}
        className={cn(
          "group relative block overflow-hidden rounded-2xl border bg-surface shadow-[0_4px_14px_rgba(12,20,48,0.04)] transition-shadow hover:shadow-[0_12px_28px_rgba(12,20,48,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-l-2xl",
          accentClass,
        )}
      >
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)_auto] lg:items-center">
          {/* Identity */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="truncate text-[16px] font-semibold text-primary">
                {caseData.profile?.investorName || `Case ${caseData.caseId}`}
              </h3>
              {!isSubmitted && (
                <StatusChip size="xs" tone="neutral" dot={false}>
                  In progress
                </StatusChip>
              )}
              {isSubmitted && state && (
                <StatusChip size="xs" tone={DECISION_TONE[state.suggestedOutcome]}>
                  {DECISION_LABEL[state.suggestedOutcome]}
                </StatusChip>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3" />
                {caseData.profile?.legalForm ?? "—"}
              </span>
              <span className="opacity-40">·</span>
              <span>{caseData.profile?.jurisdiction || "Jurisdiction —"}</span>
              <span className="opacity-40">·</span>
              <span className="font-medium tabular-nums text-foreground/80">
                {caseData.caseId}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {isSubmitted ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <ScrollText className="size-3" />
                    Submitted {formatRelative(caseData.submittedAt!)}
                  </span>
                  <span className="opacity-40">·</span>
                  <StatusChip size="xs" tone={slaTone}>
                    <Clock className="size-2.5" />
                    {sla.label}
                  </StatusChip>
                </>
              ) : (
                <span className="inline-flex items-center gap-1">
                  Saved {formatRelative(caseData.lastSavedAt)}
                </span>
              )}
            </div>
          </div>

          {/* Mini stats row */}
          <div className="grid grid-cols-4 gap-2.5">
            <MiniStat
              icon={<FileText className="size-3" />}
              label="Docs"
              value={`${docCount}`}
              tone="info"
            />
            <MiniStat
              icon={<AlertTriangle className="size-3" />}
              label="Flags"
              value={`${openIssues}`}
              tone={openIssues === 0 ? "success" : "warn"}
            />
            <MiniStat
              icon={<Users className="size-3" />}
              label="Screen"
              value={screening.label}
              tone={screening.tone}
              valueSize="xs"
            />
            <MiniStat
              icon={<ListChecks className="size-3" />}
              label="RFI"
              value={`${rfis}`}
              tone={rfis === 0 ? "neutral" : "info"}
            />
          </div>

          {/* Score + CTA */}
          <div className="flex items-center gap-3 lg:flex-col lg:items-end lg:gap-1.5">
            {isSubmitted && state ? (
              <div className="text-right">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                    Risk
                  </span>
                  <span className="text-[22px] font-semibold tabular-nums text-primary">
                    {state.riskScore}
                  </span>
                </div>
                <StatusChip size="xs" tone={BAND_TONE[state.riskBand]} dot={false}>
                  {state.riskBand}
                </StatusChip>
              </div>
            ) : (
              <div className="text-right text-[11px] text-muted-foreground">
                {isLoading ? "Assessing…" : "Awaiting submission"}
              </div>
            )}
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
              Open <ChevronRight className="size-3.5" />
            </span>
          </div>
        </div>

        {/* Sanctions/PEP banner — only when triggered */}
        {state?.suggestedOutcome === "FAIL" && (
          <div className="border-t bg-destructive/[0.06] px-5 py-2 text-[11.5px] font-medium text-destructive">
            <ShieldCheck className="mr-1 inline size-3" />
            Sanctions or critical hit detected — review before approving.
          </div>
        )}
        {state &&
          state.suggestedOutcome !== "FAIL" &&
          state.redFlags.length > 0 && (
            <div className="border-t bg-[color:var(--warn)]/[0.05] px-5 py-2 text-[11.5px] text-foreground/80">
              <Sparkles className="mr-1 inline size-3 text-[color:var(--warn)]" />
              {state.redFlags[0].description}
              {state.redFlags.length > 1 && (
                <span className="text-muted-foreground"> · +{state.redFlags.length - 1} more</span>
              )}
            </div>
          )}
      </Link>
    </li>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone,
  valueSize = "md",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: StatusTone;
  valueSize?: "xs" | "md";
}) {
  const toneClass: Record<StatusTone, string> = {
    success: "text-[color:var(--success)]",
    warn: "text-[color:var(--warn)]",
    danger: "text-destructive",
    attention: "text-[color:var(--attention)]",
    info: "text-primary",
    neutral: "text-foreground/70",
  };
  return (
    <div className="rounded-lg border bg-surface-muted/40 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate font-semibold tabular-nums leading-none",
          valueSize === "md" ? "text-[15px]" : "text-[11px]",
          toneClass[tone],
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
