import { useState } from "react";
import { CheckCircle2, AlertCircle, Circle, Loader2, ChevronDown, FileText, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { SlotDropZone } from "./SlotDropZone";
import { ExtractedPreview } from "./ExtractedPreview";
import { RequirementInfoPopover } from "./RequirementInfoPopover";
import { ReplaceInline } from "./ReplaceInline";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";
import type { ChecklistItem, StepperUploadedDocument } from "@/lib/stepper/types";
import type { RequirementItem } from "@/lib/stepper/requirements";

interface SlotProps {
  caseId: string;
  requirement: RequirementItem;
  /** Currently-mapped checklist entry, if any. */
  item?: ChecklistItem;
  /** The doc that filled the slot, if matched. */
  doc?: StepperUploadedDocument;
  /** True when a doc is in flight towards this slot. */
  inFlight?: boolean;
  onFile: (file: File) => void;
}

export function RequirementSlot({ caseId, requirement, item, doc, inFlight, onFile }: SlotProps) {
  const { openDocument } = useDocumentViewer();
  const filled = !!item;
  const attention = item?.status === "attention";
  const received = filled && !attention;

  // Once a doc is received cleanly, collapse the card by default so the page
  // stops shouting at the user. Attention slots stay open. The user can expand
  // a received slot manually if they want to inspect the extracted preview.
  const [expanded, setExpanded] = useState(false);
  const showDetail = !received || expanded;

  const onView = (defaultTab: "pdf" | "markdown") => {
    if (doc) openDocument({ docId: doc.id, fileName: doc.fileName, defaultTab });
  };

  let StatusIcon = Circle;
  let statusColor = "text-muted-foreground/40";
  let statusLabel = "Required";
  if (received) {
    StatusIcon = CheckCircle2;
    statusColor = "text-accent";
    statusLabel = "Received";
  } else if (attention) {
    StatusIcon = AlertCircle;
    statusColor = "text-[color:var(--attention)]";
    statusLabel = "Attention";
  } else if (inFlight) {
    StatusIcon = Loader2;
    statusColor = "text-primary";
    statusLabel = "Processing";
  }

  return (
    <li
      id={`slot-${requirement.key}`}
      data-testid={`slot-${requirement.key}`}
      data-status={item?.status ?? (inFlight ? "in_flight" : "required")}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-surface transition-all",
        inFlight && "doc-shimmer",
        attention && "border-[color:var(--attention)]/30",
        received && "border-accent/20",
      )}
    >
      {/* Header row — always visible. Becomes a clickable summary row when received. */}
      <button
        type="button"
        onClick={() => received && setExpanded((v) => !v)}
        disabled={!received}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left",
          received && "cursor-pointer hover:bg-secondary/40",
        )}
      >
        <StatusIcon className={cn("size-5 shrink-0", statusColor, inFlight && "animate-spin")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-foreground">{requirement.name}</div>
            <span className="shrink-0">
              <RequirementInfoPopover item={requirement} requirementKey={requirement.key} />
            </span>
          </div>
          {/* Sub-line: requirement note OR (when received) filename + confidence */}
          {received && doc ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{doc.fileName}</span>
              {doc.extractedFields?._assignedManually === "true" ? (
                <span className="ml-1 shrink-0 text-[10px] uppercase tracking-wider text-accent">
                  · assigned by you
                </span>
              ) : doc.classificationConfidence && (
                <span className="ml-1 shrink-0 text-[10px] uppercase tracking-wider">
                  · {doc.classificationConfidence} confidence
                </span>
              )}
            </div>
          ) : (
            requirement.note && (
              <div className="mt-0.5 text-xs text-muted-foreground">{requirement.note}</div>
            )
          )}
        </div>
        {received ? (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        ) : (
          <span
            className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
            data-testid={`slot-status-${requirement.key}`}
          >
            {statusLabel}
          </span>
        )}
      </button>

      {showDetail && (
        <div className="border-t bg-background/40 px-4 py-3">
          {!filled && !inFlight && (
            <SlotDropZone
              testId={`slot-drop-${requirement.key}`}
              helper={requirement.acceptedFormats?.join(" · ") + " · up to 32 MB"}
              onFile={onFile}
            />
          )}

          {(filled || inFlight) && doc && (
            <div className="space-y-2">
              <ExtractedPreview doc={doc} />
              {attention && item?.issue && (
                <div className="rounded-md border border-[color:var(--attention)]/30 bg-[color:var(--attention)]/5 p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-[color:var(--attention)]" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[color:var(--attention)]">{item.issue}</div>
                      {item.remedy && <div className="mt-0.5 text-muted-foreground">{item.remedy}</div>}
                      <ReplaceInline
                        caseId={caseId}
                        requirementKey={requirement.key}
                        hint={item.suggestedFix?.hint}
                      />
                    </div>
                  </div>
                </div>
              )}
              {(filled || (inFlight && doc.id)) && (
                <div className="flex flex-wrap items-center gap-3 border-t pt-2.5">
                  <button
                    type="button"
                    onClick={() => onView("pdf")}
                    data-testid={`slot-view-${requirement.key}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
                  >
                    <Eye className="size-3.5" /> View original
                  </button>
                  <button
                    type="button"
                    onClick={() => onView("markdown")}
                    data-testid={`slot-view-md-${requirement.key}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
                  >
                    <FileText className="size-3.5" /> View extraction
                  </button>
                  {received && (
                    <span className="ml-auto">
                      <ReplaceInline caseId={caseId} requirementKey={requirement.key} variant="link" />
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
