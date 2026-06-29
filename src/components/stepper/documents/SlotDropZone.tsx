import { useId, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single-file drop zone that lives inside a requirement card.
 * Auto-submits on file pick / drop — no separate "Submit" click.
 *
 * Click pattern: the visible surface is a `<div>` that calls
 * `inputRef.current?.click()` on click. The hidden `<input>` is positioned
 * absolutely (not `display: none`) so the file picker reliably opens across
 * Chromium / WebKit / Firefox. Click propagation is stopped on the input so
 * the native click event the browser dispatches after `.click()` doesn't
 * re-fire the parent's onClick.
 */
export function SlotDropZone({
  testId,
  helper,
  onFile,
  disabled,
}: {
  testId: string;
  helper?: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);

  const acceptFile = (file?: File) => {
    if (!file || disabled) return;
    onFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    // Ignore clicks that already came from the input (avoids the recursive
    // re-trigger when the browser bubbles the native click back through React).
    if (e.target === inputRef.current) return;
    inputRef.current?.click();
  };

  return (
    <div
      data-testid={testId}
      onClick={onClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex cursor-pointer items-center justify-center gap-3 rounded-md border-2 border-dashed bg-background px-4 py-6 text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragOver
          ? "border-accent bg-accent/5"
          : "border-border hover:border-accent/60 hover:bg-accent/5",
        disabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-background",
      )}
    >
      <Upload className="size-4 text-muted-foreground transition-transform" />
      <div className="text-center">
        <div className="text-sm font-medium text-foreground">Drop a file or click to upload</div>
        {helper && <div className="mt-0.5 text-xs text-muted-foreground">{helper}</div>}
      </div>
      {/*
        The hidden file input. Position it absolutely (NOT `display: none`) so
        click() reliably opens the picker across all browsers, and stop the
        native click from re-firing the parent's onClick.
      */}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        disabled={disabled ?? false}
        data-testid={`${testId}-input`}
        className="pointer-events-none absolute size-0 opacity-0"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const f = e.target.files?.[0];
          acceptFile(f ?? undefined);
          // Reset so picking the same file twice still triggers onChange.
          e.target.value = "";
        }}
      />
    </div>
  );
}
