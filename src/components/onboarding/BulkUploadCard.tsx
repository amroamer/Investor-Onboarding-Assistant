import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { useDocumentUpload } from "@/lib/onboarding/useDocumentUpload";
import { cn } from "@/lib/utils";

interface Props {
  /** Optional source message id (used by the conversation upload card). */
  sourceMessageId?: string;
  /** When true the card is shown in a "completed" muted state. */
  resolved?: boolean;
  title?: string;
  description?: string;
  className?: string;
  /**
   * `card` — full bordered card with leading icon avatar (chat surface).
   * `dropzone` — flat dashed dropzone for use inside another card.
   */
  variant?: "card" | "dropzone";
}

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export function BulkUploadCard({
  sourceMessageId,
  resolved = false,
  title = "Upload documents",
  description = "PDF or image (PNG, JPEG). Drag-and-drop or select multiple files — the agent will classify each one and slot it into the matching requirement.",
  className,
  variant = "card",
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, error, clearError } = useDocumentUpload();

  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return;
    const existing = new Set(files.map((f) => `${f.name}|${f.size}`));
    const merged = [...files];
    for (const f of picked) {
      if (!existing.has(`${f.name}|${f.size}`)) merged.push(f);
    }
    setFiles(merged);
    clearError();
  };

  const removeFile = (key: string) => {
    setFiles((prev) => prev.filter((f) => `${f.name}|${f.size}` !== key));
  };

  const submit = async () => {
    if (uploading || resolved || files.length === 0) return;
    await upload(files, sourceMessageId);
    setFiles([]);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (resolved || uploading) return;
    e.preventDefault();
    setDragOver(true);
  };
  const onDrop = (e: React.DragEvent) => {
    if (resolved || uploading) return;
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        addFiles(Array.from(e.target.files ?? []));
        e.target.value = "";
      }}
    />
  );

  const fileList = files.length > 0 && (
    <ul className="mt-3 space-y-1 text-xs">
      {files.map((f) => {
        const key = `${f.name}|${f.size}`;
        return (
          <li
            key={key}
            className="flex items-center gap-2 rounded border bg-surface px-2 py-1"
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-foreground">{f.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatBytes(f.size)}
            </span>
            {!uploading && !resolved && (
              <button
                type="button"
                onClick={() => removeFile(key)}
                className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={`Remove ${f.name}`}
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );

  if (variant === "dropzone") {
    return (
      <div className={cn("space-y-2", className)}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          disabled={resolved || uploading}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed bg-surface px-4 py-5 text-center transition-colors",
            "border-border hover:border-accent hover:bg-secondary/40",
            dragOver && "border-accent bg-accent/5",
            (resolved || uploading) && "cursor-not-allowed opacity-60 hover:border-border hover:bg-surface",
          )}
        >
          <UploadCloud className={cn("size-5 text-muted-foreground", dragOver && "text-accent")} />
          <div className="text-sm font-medium text-foreground">
            {dragOver ? "Drop files to upload" : title}
          </div>
          <div className="text-xs text-muted-foreground">
            {description}
          </div>
        </button>
        {hiddenInput}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {fileList}
        {files.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted-foreground">
              {files.length} file{files.length === 1 ? "" : "s"} ready
            </span>
            <Button size="sm" disabled={resolved || uploading} onClick={submit}>
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}{" "}
              {resolved
                ? "Uploaded"
                : uploading
                  ? "Processing…"
                  : `Submit upload${files.length > 1 ? ` (${files.length})` : ""}`}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface p-4 transition-colors",
        dragOver && !resolved && "border-accent bg-accent/5",
        resolved && "opacity-60",
        className,
      )}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-primary">
          <Upload className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{title}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          {hiddenInput}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={resolved || uploading}
              onClick={() => inputRef.current?.click()}
            >
              <FileText className="size-3.5" /> Choose files
            </Button>
            <Button
              size="sm"
              disabled={resolved || uploading || files.length === 0}
              onClick={submit}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}{" "}
              {resolved
                ? "Uploaded"
                : uploading
                  ? "Processing…"
                  : `Submit upload${files.length > 1 ? ` (${files.length})` : ""}`}
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          {fileList}
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
