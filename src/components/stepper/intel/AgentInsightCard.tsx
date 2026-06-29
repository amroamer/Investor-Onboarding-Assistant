import { Sparkles, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";
import type { ReactNode } from "react";

interface Source {
  docId: string;
  fileName: string;
}

interface Props {
  /** Source documents the agent used to derive its message. */
  sources?: Source[];
  /** Short narrative explaining what was pre-filled or done. */
  message: ReactNode;
  /** Optional secondary line shown below the message. */
  hint?: ReactNode;
  /** When true, render a muted "nothing pre-filled" variant. */
  empty?: boolean;
  /** Click handler when a source chip is clicked. */
  onSourceClick?: (docId: string) => void;
  className?: string;
  /** Override the label above the message. */
  eyebrow?: string;
}

/**
 * Standardised "Onboarding agent did X" card used across steps. Renders the
 * Sparkles avatar + eyebrow + message, optional hint and a row of clickable
 * source-doc chips.
 */
export function AgentInsightCard({
  sources = [],
  message,
  hint,
  empty = false,
  onSourceClick,
  className,
  eyebrow = "Onboarding agent",
}: Props) {
  const { openDocument } = useDocumentViewer();
  // Default click behaviour: open the source document in the viewer dialog.
  const handleSourceClick =
    onSourceClick ??
    ((docId: string) => {
      const match = sources.find((s) => s.docId === docId);
      openDocument({ docId, fileName: match?.fileName, defaultTab: "pdf" });
    });
  return (
    <div
      data-testid="agent-insight-card"
      data-empty={empty}
      className={cn(
        "flex gap-3 rounded-xl border bg-surface px-4 py-3.5",
        empty
          ? "border-dashed border-muted-foreground/30"
          : "border-accent/30 bg-gradient-to-br from-accent/[0.06] via-accent/[0.02] to-transparent",
        className,
      )}
    >
      <div
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full",
          empty ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </div>
        <div className="mt-0.5 text-sm leading-relaxed text-foreground">{message}</div>
        {hint && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</div>}
        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <button
                key={s.docId}
                type="button"
                data-testid={`agent-source-${s.docId}`}
                onClick={() => handleSourceClick(s.docId)}
                className={cn(
                  "inline-flex max-w-[260px] cursor-pointer items-center gap-1 truncate rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground",
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
