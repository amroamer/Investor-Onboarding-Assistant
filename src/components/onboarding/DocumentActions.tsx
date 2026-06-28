import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Download, FileCode } from "lucide-react";
import { getFile } from "@/server/uploads";
import { MarkdownViewerDialog } from "./MarkdownViewerDialog";
import { DocumentViewerDialog } from "./DocumentViewerDialog";
import type { UploadedDocument } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

interface Props {
  document: UploadedDocument;
  variant?: "full" | "compact";
  className?: string;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function DocumentActions({ document: doc, variant = "full", className }: Props) {
  const [busy, setBusy] = useState(false);
  const [mdOpen, setMdOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const payload = await getFile({ data: { id: doc.id } });
      const blob = base64ToBlob(payload.base64, payload.mimeType);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = payload.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  };

  if (variant === "compact") {
    return (
      <>
        <div className={cn("flex shrink-0 items-center gap-0.5", className)}>
          <Button size="icon" variant="ghost" className="size-6" disabled={busy} onClick={() => setViewOpen(true)} title="View original">
            <Eye className="size-3" />
          </Button>
          <Button size="icon" variant="ghost" className="size-6" disabled={busy} onClick={download} title="Download original">
            <Download className="size-3" />
          </Button>
          <Button size="icon" variant="ghost" className="size-6" disabled={busy} onClick={() => setMdOpen(true)} title="View extracted Markdown">
            <FileCode className="size-3" />
          </Button>
        </div>
        <MarkdownViewerDialog docId={doc.id} fileName={doc.fileName} open={mdOpen} onOpenChange={setMdOpen} />
        <DocumentViewerDialog docId={doc.id} fileName={doc.fileName} open={viewOpen} onOpenChange={setViewOpen} />
      </>
    );
  }

  return (
    <>
      <div className={cn("flex shrink-0 items-center gap-1", className)}>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => setViewOpen(true)} title="Open original in a popup">
          <Eye className="size-3" /> View
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={download} title="Download original">
          <Download className="size-3" /> Download
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => setMdOpen(true)} title="View extracted Markdown">
          <FileCode className="size-3" /> Markdown
        </Button>
      </div>
      <MarkdownViewerDialog docId={doc.id} fileName={doc.fileName} open={mdOpen} onOpenChange={setMdOpen} />
      <DocumentViewerDialog docId={doc.id} fileName={doc.fileName} open={viewOpen} onOpenChange={setViewOpen} />
    </>
  );
}
