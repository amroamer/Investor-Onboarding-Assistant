import { useRef, useState } from "react";
import { Repeat, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { replaceRequirement } from "@/server/stepper/uploads";
import { useStepperStore } from "@/lib/stepper/store";

export function ReplaceInline({
  caseId,
  requirementKey,
  hint,
  variant = "button",
}: {
  caseId: string;
  requirementKey: string;
  hint?: string;
  /**
   * `button` — outline pill (used for attention/error states where the user must act).
   * `link`   — small text link (used for cleanly-received slots, demoted to noise).
   */
  variant?: "button" | "link";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCase } = useStepperStore();
  const [busy, setBusy] = useState(false);

  const onPick = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("caseId", caseId);
      fd.append("requirementKey", requirementKey);
      fd.append("files", file);
      const saved = await replaceRequirement({ data: fd });
      setCase(saved);
      toast.success("Document replaced.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const hidden = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
      className="hidden"
      data-testid={`replace-input-${requirementKey}`}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onPick(f);
        e.target.value = "";
      }}
    />
  );

  if (variant === "link") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid={`replace-${requirementKey}`}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
            busy && "opacity-60",
          )}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Repeat className="size-3" />}
          Replace document
        </button>
        {hidden}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        data-testid={`replace-${requirementKey}`}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Repeat className="size-3.5" />}
        Replace
      </Button>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {hidden}
    </div>
  );
}
