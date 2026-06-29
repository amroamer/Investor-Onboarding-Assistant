import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Lightbulb,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { StepperCase } from "@/lib/stepper/types";
import { caseSlaState } from "@/lib/stepper/compliance-sla";
import type { StepperComplianceState } from "@/lib/stepper/compliance";
import type { QueueKpis } from "./queue-filters";

interface PriorityRow {
  caseData: StepperCase;
  state?: StepperComplianceState;
  reason: string;
  tone: "warn" | "danger" | "info";
}

/**
 * Right-rail panel for the queue index. Lives in the same visual register as
 * the cockpit's ComplianceAssistantPanel — orb, gradient surface, section
 * dividers — but the content is queue triage instead of single-case
 * recommendation.
 */
export function QueueAssistantPanel({
  cases,
  lookup,
  kpis,
}: {
  cases: StepperCase[];
  lookup: (caseId: string) => StepperComplianceState | undefined;
  kpis: QueueKpis;
}) {
  // Build the prioritised list of cases the reviewer should look at first.
  const priorities: PriorityRow[] = [];
  for (const c of cases) {
    if (!c.submittedAt) continue;
    const state = lookup(c.caseId);
    const sla = caseSlaState(c);
    if (state?.suggestedOutcome === "FAIL") {
      priorities.push({
        caseData: c,
        state,
        reason: "Sanctions/critical hit — block recommended.",
        tone: "danger",
      });
      continue;
    }
    if (sla.tone === "danger") {
      priorities.push({
        caseData: c,
        state,
        reason: `SLA breached (${sla.label.toLowerCase()}).`,
        tone: "danger",
      });
      continue;
    }
    if (sla.tone === "warn") {
      priorities.push({
        caseData: c,
        state,
        reason: `SLA in ${sla.label.toLowerCase()}.`,
        tone: "warn",
      });
      continue;
    }
    if (state?.riskBand === "High") {
      priorities.push({
        caseData: c,
        state,
        reason: `High-risk band (score ${state.riskScore}).`,
        tone: "warn",
      });
      continue;
    }
    if (state?.furtherInfoRequests.some((r) => r.status === "responded")) {
      priorities.push({
        caseData: c,
        state,
        reason: "RFI response awaiting review.",
        tone: "info",
      });
    }
  }
  // Stable order: danger first, warn next, info last; within each by risk desc.
  priorities.sort((a, b) => {
    const tonePri: Record<typeof a.tone, number> = { danger: 0, warn: 1, info: 2 };
    const t = tonePri[a.tone] - tonePri[b.tone];
    if (t !== 0) return t;
    return (b.state?.riskScore ?? 0) - (a.state?.riskScore ?? 0);
  });

  const top = priorities[0];
  const queueClean = priorities.length === 0 && kpis.submitted > 0;

  return (
    <div
      data-testid="queue-assistant-panel"
      className="agent-dot-corner relative overflow-hidden rounded-2xl border bg-gradient-to-b from-surface to-[#fbfdff] shadow-[0_12px_34px_rgba(12,20,48,0.06)]"
    >
      <div className="relative z-10 p-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="orb-pulse relative grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-[#0f4460] text-white shadow-[0_2px_6px_rgba(0,0,0,0.12)]">
            <Sparkles className="size-4" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Queue overview
            </div>
            <h2 className="text-lg font-semibold text-primary">AI Compliance Assistant</h2>
            <div className="text-[11px] text-muted-foreground">
              Triage support · advisory only
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <KpiTile label="Submitted" value={`${kpis.submitted}`} tone="info" icon={<CheckCircle2 className="size-3" />} />
          <KpiTile
            label="Overdue SLA"
            value={`${kpis.overdueSla}`}
            tone={kpis.overdueSla > 0 ? "danger" : "neutral"}
            icon={<Clock className="size-3" />}
          />
          <KpiTile
            label="High risk"
            value={`${kpis.highRisk}`}
            tone={kpis.highRisk > 0 ? "warn" : "neutral"}
            icon={<AlertCircle className="size-3" />}
          />
          <KpiTile
            label="RFI in flight"
            value={`${kpis.awaitingRfi}`}
            tone="info"
            icon={<Activity className="size-3" />}
          />
        </div>

        {/* Top priority */}
        <Section title="Top priority" icon={<Lightbulb className="size-3.5" />}>
          {top ? (
            <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-accent">
                Review next
              </div>
              <div className="mt-1 text-[13.5px] font-semibold text-foreground">
                {top.caseData.profile?.investorName ?? top.caseData.caseId}
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {top.caseData.caseId} · {top.caseData.profile?.legalForm ?? "—"}
              </div>
              <div className="mt-2 text-[12px] leading-relaxed text-foreground/85">
                {top.reason}
              </div>
              <div className="mt-3">
                <Button
                  asChild
                  size="sm"
                  data-testid="queue-assistant-open-top"
                >
                  <Link
                    to="/compliance/case/$caseId"
                    params={{ caseId: top.caseData.caseId }}
                  >
                    Open case →
                  </Link>
                </Button>
              </div>
            </div>
          ) : queueClean ? (
            <div className="rounded-xl border border-[color:var(--success)]/30 bg-[color:var(--success)]/[0.05] p-3">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--success)]">
                <CheckCircle2 className="size-3" /> Queue clean
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-foreground/85">
                Every submitted case is within SLA, in a clean risk band, and free of
                sanctions hits. Spot-check the highest-risk case before clearing the queue.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No submitted cases yet — once investors finish the stepper flow, prioritised
              triage will appear here.
            </p>
          )}
        </Section>

        {/* Watch list — next few */}
        {priorities.length > 1 && (
          <Section title="Also worth a look" icon={<ShieldCheck className="size-3.5" />}>
            <ol className="space-y-2.5">
              {priorities.slice(1, 4).map((p) => (
                <li key={p.caseData.caseId} className="step-item-in">
                  <Link
                    to="/compliance/case/$caseId"
                    params={{ caseId: p.caseData.caseId }}
                    className="block rounded-lg border bg-surface px-2.5 py-2 transition-colors hover:bg-secondary"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px] font-semibold text-foreground">
                        {p.caseData.profile?.investorName ?? p.caseData.caseId}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[10px] uppercase tracking-[0.06em]",
                          p.tone === "danger" && "text-destructive",
                          p.tone === "warn" && "text-[color:var(--warn)]",
                          p.tone === "info" && "text-primary",
                        )}
                      >
                        {p.tone === "danger" ? "Block" : p.tone === "warn" ? "Watch" : "Review"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{p.reason}</div>
                  </Link>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* W/H/W */}
        <Section title="What · how · why" icon={<ShieldCheck className="size-3.5" />}>
          <div className="space-y-2.5 text-[12px] leading-relaxed">
            <Whw label="What" body="Surfaces every submitted stepper case in priority order so triage stays explicit." />
            <Whw label="How" body="Cases are ranked by SLA urgency, suggested outcome (FAIL first), then risk band. Each card shows the same evidence anchors the cockpit uses." />
            <Whw label="Why" body="A queue beats a dropdown — reviewers see the workload at a glance and pick what's most at risk, not what's most recent." />
          </div>
        </Section>

        <p className="mt-5 text-[10.5px] leading-snug text-muted-foreground">
          AI triage is advisory. Final decisions on individual cases must be made inside the
          case cockpit by an authorised compliance officer.
        </p>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "info" | "warn" | "danger" | "neutral";
  icon: ReactNode;
}) {
  const valueClass: Record<"info" | "warn" | "danger" | "neutral", string> = {
    info: "text-primary",
    warn: "text-[color:var(--warn)]",
    danger: "text-destructive",
    neutral: "text-foreground/70",
  };
  return (
    <div className="rounded-lg border bg-surface px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className={cn("mt-0.5 text-[18px] font-semibold tabular-nums leading-none", valueClass[tone])}>
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {icon && <span className="text-accent">{icon}</span>}
        {title}
      </div>
      {children}
    </div>
  );
}

function Whw({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
        {label}
      </div>
      <div className="mt-0.5 text-foreground/85">{body}</div>
    </div>
  );
}
