import { Sparkles, AlertCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrefillValue } from "@/lib/stepper/derive";

interface Props<T extends string | boolean> {
  /** The original prefill from the agent — undefined means the field was never prefilled. */
  source?: PrefillValue<T>;
  /** Current value of the field. If it differs from `source.value`, render as "Overridden". */
  current: T | undefined;
  /** Click handler when the chip is clicked — open the source file preview. */
  onClick?: (docId: string) => void;
  className?: string;
  /** Optional testId suffix for stable selectors in e2e tests. */
  testId?: string;
}

/**
 * Small badge that sits next to a prefilled input. Shows where the value came
 * from, and flips to "Overridden — was …" when the user edits it.
 */
export function PrefillChip<T extends string | boolean>({
  source,
  current,
  onClick,
  className,
  testId,
}: Props<T>) {
  if (!source) return null;
  const same = current === source.value;

  const baseTestId = testId ?? "prefill-chip";

  if (same) {
    return (
      <button
        type="button"
        data-testid={`${baseTestId}-source`}
        data-state="prefilled"
        onClick={() => onClick?.(source.sourceDocId)}
        disabled={!onClick}
        className={cn(
          "inline-flex max-w-full items-center gap-1 truncate rounded-md border border-accent/30 bg-accent/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-accent transition-colors",
          onClick && "cursor-pointer hover:bg-accent/10",
          !onClick && "cursor-default",
          className,
        )}
      >
        <Sparkles className="size-2.5 shrink-0" />
        <span className="truncate">From {source.sourceFileName}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid={`${baseTestId}-overridden`}
      data-state="overridden"
      onClick={() => onClick?.(source.sourceDocId)}
      disabled={!onClick}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md border border-[color:var(--attention)]/30 bg-[color:var(--attention)]/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--attention)] transition-colors",
        onClick && "cursor-pointer hover:bg-[color:var(--attention)]/10",
        !onClick && "cursor-default",
        className,
      )}
    >
      <AlertCircle className="size-2.5 shrink-0" />
      <span className="truncate">
        Overridden — was &quot;{typeof source.value === "boolean" ? (source.value ? "Yes" : "No") : String(source.value)}&quot;
      </span>
    </button>
  );
}

/**
 * Gap callout — render next to a required field the agent couldn't extract.
 * Different colour from validation errors so it reads as "agent needs your
 * input" rather than "you made a mistake".
 */
export function AgentGapCallout({ message, className }: { message: string; className?: string }) {
  return (
    <div
      data-testid="agent-gap-callout"
      className={cn(
        "mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-surface px-2 py-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <FileText className="size-3 shrink-0" />
      {message}
    </div>
  );
}
