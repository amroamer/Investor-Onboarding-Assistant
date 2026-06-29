import { Sparkles, AlertCircle, FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";
import type { PrefillValue } from "@/lib/stepper/derive";

interface Props<T extends string | boolean> {
  source?: PrefillValue<T>;
  current: T | undefined;
  /** Click handler — typically opens an evidence popover/drawer for the source doc. */
  onClick?: (docId: string) => void;
  className?: string;
  testId?: string;
  /** Short label describing what the field is, used in the tooltip. */
  whyNeeded?: string;
}

/**
 * Evidence chip — sits next to a prefilled field and shows where the value
 * came from. Hover to see the source/extracted value + why we asked for it.
 */
export function EvidenceChip<T extends string | boolean>({
  source,
  current,
  onClick,
  className,
  testId,
  whyNeeded,
}: Props<T>) {
  const { openDocument } = useDocumentViewer();
  if (!source) return null;
  const same = current === source.value;
  const baseTestId = testId ?? "evidence-chip";
  const sourceValueText =
    typeof source.value === "boolean" ? (source.value ? "Yes" : "No") : String(source.value);
  // Default click handler opens the source document in the viewer dialog.
  const handleClick =
    onClick ??
    ((docId: string) =>
      openDocument({ docId, fileName: source.sourceFileName, defaultTab: "pdf" }));

  if (same) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid={`${baseTestId}-source`}
              data-state="prefilled"
              onClick={() => handleClick(source.sourceDocId)}
              className={cn(
                "inline-flex max-w-full cursor-pointer items-center gap-1 truncate rounded-md border border-accent/30 bg-accent/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/10",
                className,
              )}
            >
              <Sparkles className="size-2.5 shrink-0" />
              <span className="truncate">From {source.sourceFileName}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-1.5 text-accent">
                <FileText className="size-3" />
                <span className="font-medium">{source.sourceFileName}</span>
              </div>
              <div className="text-muted-foreground">
                Extracted value: <span className="text-foreground">{sourceValueText}</span>
              </div>
              {whyNeeded && <div className="border-t pt-1 text-muted-foreground">{whyNeeded}</div>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Overridden state — user edited the prefilled value.
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={`${baseTestId}-overridden`}
            data-state="overridden"
            onClick={() => handleClick(source.sourceDocId)}
            className={cn(
              "inline-flex max-w-full cursor-pointer items-center gap-1 truncate rounded-md border border-[color:var(--attention)]/30 bg-[color:var(--attention)]/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--attention)] transition-colors hover:bg-[color:var(--attention)]/10",
              className,
            )}
          >
            <AlertCircle className="size-2.5 shrink-0" />
            <span className="truncate">Edited — was &quot;{sourceValueText}&quot;</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" className="max-w-xs text-xs">
          You changed this from the agent's extracted value. Compliance will see the original
          alongside your edit.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Gap callout — render next to a required field the agent couldn't extract.
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
