import type { ReactNode } from "react";
import { Sparkles, CheckCircle2, AlertCircle, ShieldCheck, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentPhase =
  | "idle"
  | "reading"
  | "mapping"
  | "extracting"
  | "validating"
  | "drafting"
  | "ready"
  | "submitting";

export interface AgentFinding {
  /** Short headline. */
  label: string;
  /** Optional secondary value or details. */
  value?: string;
  /** Visual tone. */
  tone?: "complete" | "warning" | "info";
}

export interface AgentActivity {
  id: string;
  label: ReactNode;
  detail?: ReactNode;
  /** Timestamp string already formatted (e.g. "10:14" or "2 min ago"). */
  time?: string;
  /** When true, the leading dot pulses. */
  running?: boolean;
  /** When true, the leading dot turns amber. */
  warn?: boolean;
}

export interface AgentPanelProps {
  /** Step number — drives the eyebrow label. */
  step: number;
  /** Phase the agent is in — drives orb state and status-card label. */
  phase: AgentPhase;
  /** Plain-English explanation of what the agent is doing right now. */
  phaseExplanation: ReactNode;
  /** 0–100 — drives the progress bar. */
  progressPct: number;
  /** Optional override for the progress caption (defaults to "{pct}% complete"). */
  progressCaption?: ReactNode;
  /** Findings list — bullet-ish "what we learned". */
  findings: AgentFinding[];
  /** Activity timeline — newest last; rendered newest-first. */
  activity: AgentActivity[];
  /** "Why this matters" copy — explains the regulatory rationale. */
  why: ReactNode;
  /** Optional supplemental sections (e.g. case-readiness numbers, what's-next). */
  extraSections?: Array<{ title: string; body: ReactNode }>;
  /** Defaults to "Case intelligence". */
  heading?: string;
  /** Defaults to "AI Compliance Analyst". */
  subheading?: string;
}

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "Ready",
  reading: "Reading documents…",
  mapping: "Mapping evidence…",
  extracting: "Extracting fields…",
  validating: "Validating declarations…",
  drafting: "Drafting package…",
  ready: "Ready for review",
  submitting: "Submitting…",
};

/**
 * Right-rail intelligence panel. Replaces the older tab-based CaseIntelligencePanel
 * for the "feels alive" steps. Composition: header (orb + titles) → status card
 * (phase + progress) → findings → activity timeline → why this matters → extra
 * sections.
 */
export function AgentPanel({
  step,
  phase,
  phaseExplanation,
  progressPct,
  progressCaption,
  findings,
  activity,
  why,
  extraSections = [],
  heading = "Case intelligence",
  subheading = "AI Compliance Analyst",
}: AgentPanelProps) {
  const hasWarn = findings.some((f) => f.tone === "warning");
  const orbTone: "active" | "warn" | "idle" =
    phase === "idle" || phase === "ready"
      ? "idle"
      : hasWarn
        ? "warn"
        : "active";

  return (
    <div
      data-testid="agent-panel"
      data-phase={phase}
      className="agent-dot-corner relative overflow-hidden rounded-2xl border bg-gradient-to-b from-surface to-[#fbfdff] shadow-[0_12px_34px_rgba(12,20,48,0.06)]"
    >
      <div className="relative z-10 p-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <AgentOrb tone={orbTone} />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Step {step} of 7
            </div>
            <h2 className="text-lg font-semibold text-primary">{heading}</h2>
            <div className="text-[11px] text-muted-foreground">{subheading}</div>
          </div>
        </div>

        {/* Status card */}
        <div className="mt-5 rounded-xl border bg-surface p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <strong className="text-sm text-foreground">{PHASE_LABEL[phase]}</strong>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {progressPct}%
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {phaseExplanation}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              data-testid="agent-progress"
              className="h-full rounded-full bg-gradient-to-r from-accent to-[#33c6d0] transition-[width] duration-500"
              style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
            />
          </div>
          {progressCaption && (
            <div className="mt-2 text-[11px] text-muted-foreground">{progressCaption}</div>
          )}
        </div>

        {/* Findings */}
        <Section title="Findings" icon={<CheckCircle2 className="size-3.5" />}>
          {findings.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Findings will appear here as the agent works.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {findings.slice(-6).map((f, i) => (
                <li
                  key={`${f.label}-${i}`}
                  className="step-item-in flex items-start gap-2"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <FindingMark tone={f.tone ?? "complete"} />
                  <div className="min-w-0 text-[12px] leading-snug text-foreground/90">
                    <div className="font-semibold text-foreground">{f.label}</div>
                    {f.value && (
                      <div className="text-muted-foreground">{f.value}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Activity timeline */}
        <Section title="Activity timeline" icon={<Activity className="size-3.5" />}>
          {activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Drop your first document to see the agent's work here.
            </p>
          ) : (
            <ol className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {[...activity].slice(-8).reverse().map((a, i) => (
                <li
                  key={a.id}
                  data-testid={`agent-activity-${a.id}`}
                  className="step-item-in relative pl-5"
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-[6px] size-2 rounded-full",
                      a.warn ? "bg-[color:var(--warn)]" : "bg-accent",
                      a.running && "dot-pulse",
                    )}
                    aria-hidden
                  />
                  {a.time && (
                    <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.time}
                    </div>
                  )}
                  <div className="text-[12px] leading-snug text-foreground/90">
                    <span className="font-medium text-foreground">{a.label}</span>
                    {a.detail && (
                      <>
                        <br />
                        <span className="text-muted-foreground">{a.detail}</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Why this matters */}
        <Section title="Why this matters" icon={<ShieldCheck className="size-3.5" />}>
          <p className="text-[12px] leading-relaxed text-muted-foreground">{why}</p>
        </Section>

        {extraSections.map((s) => (
          <Section key={s.title} title={s.title} icon={<Sparkles className="size-3.5" />}>
            <div className="text-[12px] leading-relaxed text-foreground/90">{s.body}</div>
          </Section>
        ))}
      </div>
    </div>
  );
}

function AgentOrb({ tone }: { tone: "active" | "warn" | "idle" }) {
  return (
    <div
      data-testid="agent-orb"
      data-tone={tone}
      className={cn(
        "relative grid size-10 shrink-0 place-items-center rounded-full text-white shadow-[0_2px_6px_rgba(0,0,0,0.12)]",
        tone === "warn"
          ? "bg-gradient-to-br from-[color:var(--warn)] to-[#b45309]"
          : "bg-gradient-to-br from-accent to-[#0f4460]",
        tone !== "idle" && "orb-pulse",
      )}
    >
      <Sparkles className="size-4" strokeWidth={2.4} />
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

function FindingMark({ tone }: { tone: "complete" | "warning" | "info" }) {
  if (tone === "warning") {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[color:var(--warn)] text-white">
        <AlertCircle className="size-3" strokeWidth={2.5} />
      </span>
    );
  }
  if (tone === "info") {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="size-3" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[color:var(--success)] text-white">
      <CheckCircle2 className="size-3" strokeWidth={2.5} />
    </span>
  );
}
