import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFileMarkdown, type MarkdownPayload } from "@/server/uploads";

interface Props {
  docId: string | null;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarkdownViewerDialog({ docId, fileName, open, onOpenChange }: Props) {
  const [payload, setPayload] = useState<MarkdownPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !docId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);
    getFileMarkdown({ data: { id: docId } })
      .then((p) => { if (!cancelled) setPayload(p); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load markdown"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, docId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-3 p-0">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-sm font-medium">
            {payload?.fileName || fileName} — extracted Markdown
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="text-sm text-destructive">{error}</div>}
          {payload && !loading && !error && (
            <>
              {payload.status === "failed" ? (
                <div className="text-sm text-destructive">Extraction failed: {payload.error ?? "Unknown error"}</div>
              ) : payload.markdown == null ? (
                <div className="text-sm text-muted-foreground">No Markdown available (status: {payload.status}).</div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground" data-testid="md-content">
                  {payload.markdown}
                </pre>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
