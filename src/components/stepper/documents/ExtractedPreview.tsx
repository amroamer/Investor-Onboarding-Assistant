import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";
import type { StepperUploadedDocument } from "@/lib/stepper/types";

/**
 * Inline card under a filled slot. Shows a small thumbnail-style box (file icon
 * + classified-as label) and the extracted-fields one-liner.
 *
 * During non-terminal phases shows a "scan-line" animation over the thumbnail.
 */
export function ExtractedPreview({ doc }: { doc: StepperUploadedDocument }) {
  const { openDocument } = useDocumentViewer();
  const inFlight =
    doc.processingPhase === "pending" ||
    doc.processingPhase === "reading" ||
    doc.processingPhase === "classifying" ||
    doc.processingPhase === "matching";
  const ready = doc.processingPhase === "ready";

  const phaseLabel = (() => {
    switch (doc.processingPhase) {
      case "reading": return "Reading…";
      case "classifying": return "Classifying…";
      case "matching": return "Matching to checklist…";
      case "ready": return doc.classifiedAs;
      case "failed": return "Processing failed";
      case "duplicate": return "Duplicate ignored";
      default: return doc.classifiedAs || "Pending";
    }
  })();

  return (
    <div data-testid={`extracted-preview-${doc.id}`} className="flex items-stretch gap-3 rounded-md border bg-background p-3">
      <button
        type="button"
        onClick={() => ready && openDocument({ docId: doc.id, fileName: doc.fileName, defaultTab: "pdf" })}
        disabled={!ready}
        aria-label={ready ? `Open ${doc.fileName}` : "Document not ready"}
        className={cn(
          "relative grid size-16 shrink-0 place-items-center overflow-hidden rounded border bg-secondary text-muted-foreground transition-colors",
          ready && "cursor-pointer hover:border-accent/40 hover:bg-accent/[0.06] hover:text-accent",
        )}
      >
        <FileText className="size-7" />
        {inFlight && <div className="doc-scan-line" />}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => ready && openDocument({ docId: doc.id, fileName: doc.fileName, defaultTab: "pdf" })}
          disabled={!ready}
          className={cn(
            "block w-full truncate text-left text-sm font-medium text-foreground",
            ready && "cursor-pointer hover:text-accent hover:underline",
          )}
        >
          {doc.fileName}
        </button>
        <div className="mt-0.5 text-xs text-muted-foreground" data-testid={`extracted-phase-${doc.id}`}>
          {phaseLabel}
          {doc.processingPhase === "ready" && doc.extractedFields?._assignedManually === "true" ? (
            <span className="ml-1 text-[10px] uppercase tracking-wider text-accent">· assigned by you</span>
          ) : doc.classificationConfidence && doc.processingPhase === "ready" && (
            <span className="ml-1 text-[10px] uppercase tracking-wider">· {doc.classificationConfidence} confidence</span>
          )}
        </div>
        {doc.thumbnailExcerpt && doc.processingPhase === "ready" && (
          <div className="mt-1.5 text-xs italic text-foreground/80" data-testid={`extracted-summary-${doc.id}`}>
            “{doc.thumbnailExcerpt}”
          </div>
        )}
        {doc.error && doc.processingPhase === "failed" && (
          <div className="mt-1 text-xs text-[color:var(--attention)]">{doc.error}</div>
        )}
      </div>
    </div>
  );
}
