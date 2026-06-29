import type { ReactNode } from "react";
import { Lightbulb, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TabNextActionProps {
  /** One-line headline — what should happen next. */
  headline: ReactNode;
  /** Optional short caption underneath the headline. */
  caption?: ReactNode;
  /** Primary CTA label + handler. Omit to render an info-only card. */
  cta?: { label: string; onClick: () => void; disabled?: boolean };
  /** Optional ghost secondary action. */
  secondary?: { label: string; onClick: () => void };
  /** Tone driving the accent. */
  tone?: "accent" | "warn" | "danger" | "success";
}

const TONE_CLASS: Record<NonNullable<TabNextActionProps["tone"]>, string> = {
  accent: "border-accent/30 bg-accent/[0.04] text-accent",
  warn: "border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.05] text-[color:var(--warn)]",
  danger: "border-destructive/30 bg-destructive/[0.05] text-destructive",
  success: "border-[color:var(--success)]/30 bg-[color:var(--success)]/[0.05] text-[color:var(--success)]",
};

/**
 * Compact "Next best action" card that sits above each tab body. Mirrors the
 * Lightbulb-headed card the assistant panel uses, but inline in the main
 * content so the reviewer can act without crossing the page.
 */
export function TabNextActionCard({
  headline,
  caption,
  cta,
  secondary,
  tone = "accent",
}: TabNextActionProps) {
  return (
    <section
      data-testid="tab-next-action"
      className={cn(
        "step-item-in flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
        TONE_CLASS[tone],
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-current/[0.12] text-current">
          <Lightbulb className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]">
            Next best action
          </div>
          <div className="mt-0.5 text-[13.5px] font-semibold text-foreground">{headline}</div>
          {caption && (
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">{caption}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {secondary && (
          <Button size="sm" variant="ghost" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        )}
        {cta && (
          <Button
            size="sm"
            onClick={cta.onClick}
            disabled={cta.disabled}
            data-testid="tab-next-action-cta"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {cta.label} <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </section>
  );
}
