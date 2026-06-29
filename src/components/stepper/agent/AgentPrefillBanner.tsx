import { Sparkles, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Source {
  docId: string;
  fileName: string;
}

interface Props {
  /** Source documents the agent used to fill this step. */
  sources: Source[];
  /** Short narrative explaining what was pre-filled. */
  message: string;
  /** Optional secondary line shown below the message. */
  hint?: string;
  /** When true, render a muted "nothing pre-filled" variant. */
  empty?: boolean;
  /** Click handler when a source chip is clicked — open the file preview. */
  onSourceClick?: (docId: string) => void;
  className?: string;
}

export function AgentPrefillBanner({
  sources,
  message,
  hint,
  empty = false,
  onSourceClick,
  className,
}: Props) {
  return (
    <div
      data-testid="agent-prefill-banner"
      data-empty={empty}
      className={cn(
        "mt-6 flex gap-3 rounded-lg border bg-surface px-4 py-3.5",
        empty ? "border-dashed border-muted-foreground/30" : "border-accent/30 bg-accent/[0.04]",
        className,
      )}
    >
      <div
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
          empty ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Onboarding agent
        </div>
        <div className="mt-0.5 text-sm text-foreground">{message}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <button
                key={s.docId}
                type="button"
                data-testid={`agent-source-${s.docId}`}
                onClick={() => onSourceClick?.(s.docId)}
                disabled={!onSourceClick}
                className={cn(
                  "inline-flex max-w-[260px] items-center gap-1 truncate rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors",
                  onSourceClick && "hover:border-accent/50 hover:text-foreground",
                )}
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{s.fileName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
