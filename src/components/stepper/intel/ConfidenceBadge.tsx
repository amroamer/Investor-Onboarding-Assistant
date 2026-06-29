import { Sparkles, CheckCircle2, AlertCircle, HelpCircle, Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = "high" | "medium" | "needs_review" | "missing" | "manual";

interface Props {
  level: ConfidenceLevel;
  /** Optional override label — defaults to the canonical label per level. */
  label?: string;
  className?: string;
  /** When true, render with reduced padding/font for inline use (next to a field). */
  size?: "sm" | "md";
}

const COPY: Record<
  ConfidenceLevel,
  { label: string; tooltip: string; tone: string; icon: typeof Sparkles }
> = {
  high: {
    label: "High confidence",
    tooltip: "We matched the required field, document type and investor identity automatically.",
    tone: "border-accent/30 bg-accent/[0.06] text-accent",
    icon: CheckCircle2,
  },
  medium: {
    label: "Medium confidence",
    tooltip:
      "The document is valid, but at least one field is worth double-checking before continuing.",
    tone: "border-amber-500/30 bg-amber-500/[0.06] text-amber-600",
    icon: Sparkles,
  },
  needs_review: {
    label: "Needs review",
    tooltip: "We couldn't confirm this automatically. Please verify the value before submitting.",
    tone: "border-[color:var(--attention)]/30 bg-[color:var(--attention)]/[0.08] text-[color:var(--attention)]",
    icon: AlertCircle,
  },
  missing: {
    label: "Missing",
    tooltip: "No source document found for this field yet.",
    tone: "border-dashed border-muted-foreground/40 bg-surface text-muted-foreground",
    icon: HelpCircle,
  },
  manual: {
    label: "Manually edited",
    tooltip:
      "You changed this value after the agent prefilled it. Compliance will see both the original and your override.",
    tone: "border-[color:var(--attention)]/30 bg-[color:var(--attention)]/[0.06] text-[color:var(--attention)]",
    icon: Pencil,
  },
};

export function ConfidenceBadge({ level, label, className, size = "sm" }: Props) {
  const meta = COPY[level];
  const Icon = meta.icon;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid={`confidence-badge-${level}`}
            className={cn(
              "inline-flex max-w-full items-center gap-1 truncate rounded-md border font-medium transition-colors",
              size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
              meta.tone,
              className,
            )}
          >
            <Icon className={cn(size === "sm" ? "size-2.5" : "size-3", "shrink-0")} />
            <span className="truncate">{label ?? meta.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-w-xs text-xs">
          {meta.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
