import { useActiveCase } from "@/lib/onboarding/store";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentActions } from "./DocumentActions";

export function UploadedFilesPanel() {
  const { caseData } = useActiveCase();
  const docs = caseData.uploadedDocuments;

  if (docs.length === 0) {
    return (
      <div className="rounded-lg border bg-surface p-4 text-xs text-muted-foreground" data-testid="files-empty">
        No documents uploaded yet. Use the upload card in the conversation to add files.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="files-panel">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Uploaded documents ({docs.length})
      </div>
      <ul className="space-y-2">
        {docs.map((d) => (
          <li
            key={d.id}
            data-testid="file-row"
            className="rounded-md border bg-surface p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate" data-testid="file-name">{d.fileName}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span data-testid="file-classification" className={cn(
                    "inline-block rounded-sm px-1.5 py-0.5",
                    d.classifiedAs === "Pending" || d.classifiedAs === "Processing failed"
                      ? "bg-[color:var(--attention)] text-[color:var(--attention-foreground)]"
                      : d.classifiedAs === "Uncategorised document"
                      ? "bg-secondary text-foreground"
                      : "bg-accent text-accent-foreground",
                  )}>
                    {d.classifiedAs}
                  </span>{" "}
                  · {d.party}
                </div>
              </div>
              <DocumentActions document={d} variant="compact" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
