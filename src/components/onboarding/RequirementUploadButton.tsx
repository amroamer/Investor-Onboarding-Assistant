import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useDocumentUpload } from "@/lib/onboarding/useDocumentUpload";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "full" | "compact";
  /** Optional label override (e.g. "Re-upload" for the attention case). */
  label?: string;
  className?: string;
}

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export function RequirementUploadButton({ variant = "full", label, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useDocumentUpload();

  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    await upload(files);
  };

  if (variant === "compact") {
    return (
      <>
        <Button
          size="icon"
          variant="outline"
          className={cn("size-6", className)}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          title={label ?? "Upload a file for this requirement"}
        >
          {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={onPicked}
        />
      </>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn("h-7 gap-1 text-xs", className)}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        title="Upload a file for this requirement"
      >
        {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
        {uploading ? "Uploading…" : label ?? "Upload"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onPicked}
      />
    </>
  );
}
