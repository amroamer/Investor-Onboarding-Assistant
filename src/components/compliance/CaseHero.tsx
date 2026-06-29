import {
  Building2,
  Clock,
  ShieldCheck,
  Calendar,
  FileText,
  History,
  User as UserIcon,
} from "lucide-react";
import { StatusChip, type StatusTone } from "./primitives/StatusChip";
import type { StepperCase } from "@/lib/stepper/types";
import type { StepperComplianceState } from "@/lib/stepper/compliance";
import { caseSlaState, formatRelative } from "@/lib/stepper/compliance-sla";

const DECISION_TONE: Record<"PASS" | "FAIL" | "PENDING", StatusTone> = {
  PASS: "success",
  FAIL: "danger",
  PENDING: "warn",
};

const DECISION_LABEL: Record<"PASS" | "FAIL" | "PENDING", string> = {
  PASS: "Conditional pass",
  FAIL: "Suggested reject",
  PENDING: "Conditional pass",
};

const BAND_TONE: Record<"Low" | "Medium" | "High", StatusTone> = {
  Low: "success",
  Medium: "warn",
  High: "danger",
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Top hero strip for the compliance cockpit. Renders the investor identity,
 * legal form, jurisdiction, submission timestamp and SLA, plus the AI
 * recommendation summary in a single dense band so the reviewer never has to
 * scroll back to recall what case they're looking at.
 */
export function CaseHero({
  caseData,
  state,
  openFlagCount,
  screeningStatus,
}: {
  caseData: StepperCase;
  state: StepperComplianceState;
  openFlagCount: number;
  screeningStatus: "Not run" | "Running" | "Clear" | "Hits found" | "Mixed";
}) {
  const decisionTone = DECISION_TONE[state.suggestedOutcome];
  const bandTone = BAND_TONE[state.riskBand];
  const submitted = caseData.submittedAt ? new Date(caseData.submittedAt) : null;
  const sla = caseSlaState(caseData);
  const slaToneMap: Record<typeof sla.tone, StatusTone> = {
    neutral: "neutral",
    warn: "warn",
    danger: "danger",
  };

  return (
    <section
      data-testid="compliance-case-hero"
      className="step-item-in relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary via-primary to-[#0a006e] text-primary-foreground shadow-[0_18px_40px_rgba(5,0,68,0.18)]"
    >
      {/* Decorative dotted pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full opacity-25"
        style={{
          background:
            "radial-gradient(circle at center, rgba(96,240,255,0.45) 0 2px, transparent 2px 14px)",
          backgroundSize: "16px 16px",
        }}
      />
      <div className="relative grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-center">
        {/* Left: identity + inline facts */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ring)]/80">
              Case under review
            </div>
            {caseData.legacyLegalForm && (
              <span
                title={`Persisted legal form "${caseData.legacyLegalForm}" was remapped to "${caseData.profile?.legalForm}" on read.`}
                className="inline-flex max-w-[180px] items-center gap-1 rounded-full border border-[color:var(--ring)]/25 bg-[color:var(--ring)]/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--ring)]"
                data-testid="legacy-form-chip"
              >
                <History className="size-2.5 shrink-0" />
                <span className="truncate">Legacy: {truncate(caseData.legacyLegalForm, 24)}</span>
              </span>
            )}
          </div>
          <h1
            className="mt-0.5 truncate text-[22px] font-semibold tracking-tight"
            data-testid="hero-investor-name"
          >
            {caseData.profile?.investorName || `Case ${caseData.caseId}`}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-primary-foreground/75">
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3" />
              {caseData.profile?.legalForm ?? "—"}
            </span>
            <span className="opacity-40">·</span>
            <span className="inline-flex items-center gap-1">
              <UserIcon className="size-3" />
              {caseData.profile?.jurisdiction || "Jurisdiction —"}
            </span>
            <span className="opacity-40">·</span>
            <span className="font-medium tabular-nums">{caseData.caseId}</span>
          </div>

          {/* Compact metric chip row */}
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
            <HeroChip
              icon={<Calendar className="size-3" />}
              label="Submitted"
              value={submitted ? submitted.toLocaleString() : "Not submitted"}
              hint={submitted ? formatRelative(submitted.toISOString()) : undefined}
            />
            <span className="self-center text-primary-foreground/20">|</span>
            <HeroChip
              icon={<Clock className="size-3" />}
              label="SLA"
              value={sla.dueAt ? sla.dueAt.toLocaleDateString() : "—"}
              hint={sla.dueAt ? sla.label : undefined}
              tone={slaToneMap[sla.tone]}
            />
            <span className="self-center text-primary-foreground/20">|</span>
            <HeroChip
              icon={<ShieldCheck className="size-3" />}
              label="Open"
              value={`${openFlagCount} ${openFlagCount === 1 ? "flag" : "flags"}`}
              hint={`Screening · ${screeningStatus}`}
              tone={openFlagCount > 0 ? "warn" : "success"}
            />
          </dl>
        </div>

        {/* Right: compact AI recommendation card */}
        <div className="rounded-xl border border-[color:var(--ring)]/15 bg-white/[0.06] px-4 py-3 backdrop-blur">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ring)]/80">
              AI recommendation
            </span>
            <StatusChip size="xs" tone={decisionTone}>
              {DECISION_LABEL[state.suggestedOutcome]}
            </StatusChip>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <ScoreTile label="Risk" value={`${state.riskScore}`} hint={`/100 · ${state.riskBand}`} tone={bandTone} />
            <ScoreTile label="Conf." value={`${deriveConfidence(state)}%`} hint="advisory" />
            <ScoreTile
              label="Open"
              value={`${openFlagCount}`}
              hint={openFlagCount === 1 ? "issue" : "issues"}
              tone={openFlagCount > 0 ? "warn" : "success"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroChip({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: StatusTone;
}) {
  const hintColor: Record<StatusTone, string> = {
    success: "text-[color:var(--success)]",
    warn: "text-[color:var(--warn)]",
    danger: "text-[#fda4af]",
    attention: "text-[color:var(--attention)]",
    info: "text-[color:var(--ring)]/80",
    neutral: "text-primary-foreground/55",
  };
  return (
    <div className="inline-flex items-baseline gap-2">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/65">
        <span className="text-[color:var(--ring)]">{icon}</span>
        {label}
      </span>
      <span className="text-[12px] font-medium text-primary-foreground">{value}</span>
      {hint && (
        <span className={`text-[10px] uppercase tracking-[0.06em] ${hintColor[tone]}`}>
          {hint}
        </span>
      )}
    </div>
  );
}

function ScoreTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatusTone;
}) {
  const valueColor: Record<StatusTone, string> = {
    success: "text-[color:var(--success)]",
    warn: "text-[#fbbf24]",
    danger: "text-[#fda4af]",
    attention: "text-[color:var(--attention)]",
    info: "text-[color:var(--ring)]",
    neutral: "text-primary-foreground",
  };
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-primary-foreground/65">
        {label}
      </div>
      <div className={`mt-0.5 text-[20px] font-semibold tabular-nums leading-none ${valueColor[tone]}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-primary-foreground/55">
          {hint}
        </div>
      )}
    </div>
  );
}

function deriveConfidence(state: StepperComplianceState): number {
  // Sanctions hit ⇒ very high confidence (we're sure something is wrong).
  if (state.suggestedOutcome === "FAIL") return 96;
  // PENDING typically means a single moderate-severity flag — moderate confidence.
  if (state.suggestedOutcome === "PENDING") return 84;
  // Clean PASS — high confidence; reduce slightly per flag.
  const penalty = Math.min(20, state.redFlags.length * 4);
  return 92 - penalty;
}
