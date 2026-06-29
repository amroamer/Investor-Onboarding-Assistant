import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "success"   // teal/green
  | "warn"      // amber
  | "danger"    // red
  | "attention" // purple (PEP, regulator)
  | "info"      // navy
  | "neutral";  // grey

const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-[color:var(--success)]/10 text-[color:var(--success)] ring-[color:var(--success)]/20",
  warn: "bg-[color:var(--warn)]/10 text-[color:var(--warn)] ring-[color:var(--warn)]/25",
  danger: "bg-destructive/10 text-destructive ring-destructive/20",
  attention: "bg-[color:var(--attention)]/10 text-[color:var(--attention)] ring-[color:var(--attention)]/25",
  info: "bg-primary/10 text-primary ring-primary/15",
  neutral: "bg-secondary text-foreground ring-border",
};

const DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-[color:var(--success)]",
  warn: "bg-[color:var(--warn)]",
  danger: "bg-destructive",
  attention: "bg-[color:var(--attention)]",
  info: "bg-primary",
  neutral: "bg-muted-foreground",
};

/**
 * Compact status pill used across the compliance cockpit. Optional leading
 * dot (defaults on) gives the chip a status-light feel consistent with the
 * onboarding agent panel.
 */
export function StatusChip({
  tone = "neutral",
  children,
  icon,
  dot = true,
  className,
  size = "sm",
  pulse = false,
  testId,
}: {
  tone?: StatusTone;
  children: ReactNode;
  icon?: ReactNode;
  dot?: boolean;
  className?: string;
  size?: "xs" | "sm" | "md";
  pulse?: boolean;
  testId?: string;
}) {
  const sizing =
    size === "xs"
      ? "px-1.5 py-0.5 text-[10px]"
      : size === "md"
        ? "px-2.5 py-1 text-xs"
        : "px-2 py-0.5 text-[11px]";
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap",
        sizing,
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {dot && !icon && (
        <span
          aria-hidden
          className={cn("inline-block size-1.5 rounded-full", DOT_CLASS[tone], pulse && "dot-pulse")}
        />
      )}
      <span>{children}</span>
    </span>
  );
}
