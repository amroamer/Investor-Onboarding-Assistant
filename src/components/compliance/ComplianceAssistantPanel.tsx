import type { ReactNode } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Activity,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusChip, type StatusTone } from "./primitives/StatusChip";

export type AssistantTab = "overview" | "documents" | "flags" | "names" | "rfi" | "audit";

export interface AssistantReason {
  label: string;
  /**
   * Drives which decision-basis bucket this reason lands in:
   *   - `ok`   → "Positive signals"
   *   - `warn` → "Open issues"
   *   - `info` → "Missing / required"
   */
  tone?: "ok" | "warn" | "info";
}

export interface AssistantAction {
  label: string;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost";
  disabled?: boolean;
}

export interface AssistantTimelineItem {
  id: string;
  label: ReactNode;
  detail?: ReactNode;
  time?: string;
  warn?: boolean;
}

export interface ComplianceAssistantPanelProps {
  /** Currently focused tab — drives the eyebrow + contextual copy. */
  tab: AssistantTab;
  /** Suggested decision: pass/fail/pending. */
  suggestedDecision: "PASS" | "FAIL" | "PENDING";
  /** 0–100 score. */
  riskScore: number;
  /** Low / Medium / High. */
  riskBand: "Low" | "Medium" | "High";
  /** 0–100 confidence the assistant has in the recommendation. */
  confidence: number;
  /** "Why this recommendation" bullets. */
  reasons: AssistantReason[];
  /** Headline next-best-action — usually a single sentence. */
  nextBestAction: ReactNode;
  /** Buttons for the action row beneath the next-best-action card. */
  actions: AssistantAction[];
  /** What / How / Why explanation for the active tab. */
  explanation: { what: ReactNode; how: ReactNode; why: ReactNode };
  /** Optional activity timeline (decisions, audit). */
  timeline?: AssistantTimelineItem[];
}

const TAB_EYEBROW: Record<AssistantTab, string> = {
  overview: "Decision basis",
  documents: "Evidence library",
  flags: "Triggered rules",
  names: "Screening signal",
  rfi: "Investor follow-up",
  audit: "Traceability",
};

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

/**
 * Right-rail decision-support panel. Built in the same visual register as the
 * onboarding AgentPanel — orb, gradient surface, section dividers — but the
 * content is the compliance officer's tool: decision, reasoning, next best
 * action, contextual W/H/W for the active tab.
 */
export function ComplianceAssistantPanel({
  tab,
  suggestedDecision,
  riskScore,
  riskBand,
  confidence,
  reasons,
  nextBestAction,
  actions,
  explanation,
  timeline,
}: ComplianceAssistantPanelProps) {
  const decisionTone = DECISION_TONE[suggestedDecision];
  const bandTone = BAND_TONE[riskBand];

  return (
    <div
      data-testid="compliance-assistant-panel"
      data-tab={tab}
      className="agent-dot-corner relative overflow-hidden rounded-2xl border bg-gradient-to-b from-surface to-[#fbfdff] shadow-[0_12px_34px_rgba(12,20,48,0.06)]"
    >
      <div className="relative z-10 p-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <AssistantOrb tone={decisionTone === "danger" ? "warn" : "active"} />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {TAB_EYEBROW[tab]}
            </div>
            <h2 className="text-lg font-semibold text-primary">AI Compliance Assistant</h2>
            <div className="text-[11px] text-muted-foreground">Decision support · advisory only</div>
          </div>
        </div>

        {/* Decision card */}
        <div className="mt-5 rounded-xl border bg-surface p-3.5 score-halo">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Suggested decision
            </span>
            <StatusChip size="xs" tone={decisionTone}>
              {DECISION_LABEL[suggestedDecision]}
            </StatusChip>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <KpiTile
              label="Risk score"
              value={
                <span className="flex items-baseline gap-1.5">
                  <span className="tabular-nums">{riskScore}</span>
                  <span className="text-[11px] font-medium text-muted-foreground">/100</span>
                </span>
              }
              chip={{ tone: bandTone, label: riskBand }}
            />
            <KpiTile
              label="Confidence"
              value={
                <span className="tabular-nums">
                  {Math.max(0, Math.min(100, Math.round(confidence)))}%
                </span>
              }
            />
          </div>
        </div>

        {/* Decision basis — grouped into Positive / Open / Missing */}
        <Section title="Decision basis" icon={<CheckCircle2 className="size-3.5" />}>
          {reasons.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Reasoning will appear here as the case data is processed.
            </p>
          ) : (
            <GroupedReasons reasons={reasons} />
          )}
        </Section>

        {/* Next best action */}
        <Section title="Next best action" icon={<Lightbulb className="size-3.5" />}>
          <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
            <div className="text-[12.5px] leading-relaxed text-foreground/90">{nextBestAction}</div>
            {actions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {actions.map((a, i) => (
                  <Button
                    key={`${a.label}-${i}`}
                    size="sm"
                    variant={a.variant === "primary" ? "default" : (a.variant ?? "outline")}
                    disabled={a.disabled}
                    onClick={a.onClick}
                    data-testid={`assistant-action-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {a.label}
                    {a.variant === "primary" && <ArrowRight className="size-3.5" />}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* What / How / Why */}
        <Section title="What · how · why" icon={<ShieldCheck className="size-3.5" />}>
          <div className="space-y-2.5">
            <WhwRow label="What" tone="info">
              {explanation.what}
            </WhwRow>
            <WhwRow label="How" tone="info">
              {explanation.how}
            </WhwRow>
            <WhwRow label="Why" tone="info">
              {explanation.why}
            </WhwRow>
          </div>
        </Section>

        {timeline && timeline.length > 0 && (
          <Section title="Decision timeline" icon={<Activity className="size-3.5" />}>
            <ol className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {timeline.slice(-8).reverse().map((a, i) => (
                <li
                  key={a.id}
                  className="step-item-in relative pl-5"
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-[6px] size-2 rounded-full",
                      a.warn ? "bg-[color:var(--warn)]" : "bg-accent",
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
          </Section>
        )}

        <p className="mt-5 text-[10.5px] leading-snug text-muted-foreground">
          AI recommendation is advisory. The final decision must be made by an authorised
          compliance officer.
        </p>
      </div>
    </div>
  );
}

function AssistantOrb({ tone }: { tone: "active" | "warn" }) {
  return (
    <div
      className={cn(
        "relative grid size-10 shrink-0 place-items-center rounded-full text-white shadow-[0_2px_6px_rgba(0,0,0,0.12)]",
        tone === "warn"
          ? "bg-gradient-to-br from-[color:var(--warn)] to-[#b45309]"
          : "bg-gradient-to-br from-accent to-[#0f4460]",
        "orb-pulse",
      )}
    >
      <Sparkles className="size-4" strokeWidth={2.4} />
    </div>
  );
}

function KpiTile({
  label,
  value,
  chip,
}: {
  label: string;
  value: ReactNode;
  chip?: { tone: StatusTone; label: string };
}) {
  return (
    <div className="rounded-lg border bg-surface px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        {chip && (
          <StatusChip size="xs" tone={chip.tone} dot={false}>
            {chip.label}
          </StatusChip>
        )}
      </div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums leading-none text-primary">
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

/**
 * Bucket reasons into three named sections so the reviewer can scan
 * positives, open issues, and missing/required items in one glance instead
 * of reading a single mixed list.
 */
function GroupedReasons({ reasons }: { reasons: AssistantReason[] }) {
  const positive = reasons.filter((r) => (r.tone ?? "ok") === "ok");
  const open = reasons.filter((r) => r.tone === "warn");
  const missing = reasons.filter((r) => r.tone === "info");

  return (
    <div className="space-y-3">
      {positive.length > 0 && (
        <ReasonGroup
          label="Positive signals"
          tone="ok"
          countTone="text-[color:var(--success)]"
          items={positive}
        />
      )}
      {open.length > 0 && (
        <ReasonGroup
          label="Open issues"
          tone="warn"
          countTone="text-[color:var(--warn)]"
          items={open}
        />
      )}
      {missing.length > 0 && (
        <ReasonGroup
          label="Missing / required"
          tone="info"
          countTone="text-primary"
          items={missing}
        />
      )}
    </div>
  );
}

function ReasonGroup({
  label,
  tone,
  countTone,
  items,
}: {
  label: string;
  tone: "ok" | "warn" | "info";
  countTone: string;
  items: AssistantReason[];
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span>{label}</span>
        <span className={cn("tabular-nums", countTone)}>{items.length}</span>
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, 8).map((r, i) => (
          <li
            key={`${r.label}-${i}`}
            className="step-item-in flex items-start gap-2"
            style={{ animationDelay: `${i * 0.03}s` }}
          >
            <ReasonMark tone={tone} />
            <span className="text-[12.5px] leading-snug text-foreground/90">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReasonMark({ tone }: { tone: "ok" | "warn" | "info" }) {
  if (tone === "warn") {
    return (
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[color:var(--warn)] text-white">
        <AlertCircle className="size-2.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (tone === "info") {
    return (
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="size-2.5" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[color:var(--success)] text-white">
      <CheckCircle2 className="size-2.5" strokeWidth={2.5} />
    </span>
  );
}

function WhwRow({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "info";
  children: ReactNode;
}) {
  void tone;
  return (
    <div className="text-[12px] leading-relaxed">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
        {label}
      </div>
      <div className="mt-0.5 text-foreground/85">{children}</div>
    </div>
  );
}
