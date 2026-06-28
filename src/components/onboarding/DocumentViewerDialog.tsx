import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { getFile, type FilePayload } from "@/server/uploads";

interface Props {
  docId: string | null;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function DocumentViewerDialog({ docId, fileName, open, onOpenChange }: Props) {
  const [payload, setPayload] = useState<FilePayload | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !docId) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    setPayload(null);
    setBlobUrl(null);
    getFile({ data: { id: docId } })
      .then((p) => {
        if (cancelled) return;
        const blob = base64ToBlob(p.base64, p.mimeType);
        createdUrl = URL.createObjectURL(blob);
        setPayload(p);
        setBlobUrl(createdUrl);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load file");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, docId]);

  const download = () => {
    if (!payload || !blobUrl) return;
    const a = window.document.createElement("a");
    a.href = blobUrl;
    a.download = payload.fileName;
    a.click();
  };

  const isPdf = payload?.mimeType === "application/pdf";
  const isImage = payload?.mimeType.startsWith("image/") ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b px-5 py-3">
          <DialogTitle className="text-sm font-medium">
            {payload?.fileName || fileName}
          </DialogTitle>
          {payload && blobUrl && (
            <Button
              size="sm"
              variant="outline"
              className="mr-6 h-7 gap-1 text-xs"
              onClick={download}
            >
              <Download className="size-3" /> Download
            </Button>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-surface-muted">
          {loading && (
            <div className="p-5 text-sm text-muted-foreground">Loading…</div>
          )}
          {error && (
            <div className="p-5 text-sm text-destructive">{error}</div>
          )}
          {payload && blobUrl && !loading && !error && (
            <>
              {isPdf ? (
                <iframe
                  src={blobUrl}
                  title={payload.fileName}
                  className="h-[80vh] w-full border-0 bg-white"
                />
              ) : isImage ? (
                <div className="flex items-center justify-center p-5">
                  <img
                    src={blobUrl}
                    alt={payload.fileName}
                    className="max-h-[80vh] max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="space-y-3 p-5 text-sm">
                  <p className="text-muted-foreground">
                    Preview isn't available for this file type
                    {" "}
                    ({payload.mimeType}). Download it to view locally.
                  </p>
                  <Button size="sm" variant="outline" onClick={download}>
                    <Download className="size-3.5" /> Download {payload.fileName}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
