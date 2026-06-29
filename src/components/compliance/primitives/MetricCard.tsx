import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/stepper/intel/CountUp";
import { StatusChip, type StatusTone } from "./StatusChip";

/**
 * Dashboard metric card — used by the Overview "case readiness" strip and
 * the screening summary. Animated counter is opt-in via `count`; pass `value`
 * for a static string instead.
 */
export function MetricCard({
  label,
  count,
  value,
  hint,
  tone = "neutral",
  icon,
  chip,
  testId,
  className,
}: {
  label: string;
  /** Numeric value — animated via CountUp. */
  count?: number;
  /** Static string value — overrides `count` when set. */
  value?: ReactNode;
  hint?: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  /** Right-aligned chip — e.g. "1 medium". */
  chip?: { label: string; tone: StatusTone };
  testId?: string;
  className?: string;
}) {
  const accentBorder: Record<StatusTone, string> = {
    success: "before:bg-[color:var(--success)]",
    warn: "before:bg-[color:var(--warn)]",
    danger: "before:bg-destructive",
    attention: "before:bg-[color:var(--attention)]",
    info: "before:bg-primary",
    neutral: "before:bg-border",
  };
  return (
    <div
      data-testid={testId}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-surface px-4 py-3.5 shadow-[0_4px_14px_rgba(12,20,48,0.04)] transition-shadow hover:shadow-[0_8px_22px_rgba(12,20,48,0.08)]",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-l-xl",
        accentBorder[tone],
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {icon && <span className="text-accent">{icon}</span>}
          {label}
        </div>
        {chip && (
          <StatusChip size="xs" tone={chip.tone}>
            {chip.label}
          </StatusChip>
        )}
      </div>
      <div className="mt-1.5 text-[24px] font-semibold tabular-nums leading-none text-primary">
        {value ?? (typeof count === "number" ? <CountUp value={count} /> : "—")}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
