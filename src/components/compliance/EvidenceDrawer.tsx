import { useEffect } from "react";
import { X, FileText, Sparkles, ShieldCheck, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";
import { StatusChip, type StatusTone } from "./primitives/StatusChip";

export interface EvidenceSource {
  /** Title shown in the drawer header. */
  title: string;
  /** Filename or short doc descriptor. */
  document: string;
  /** Field the chip was attached to (e.g. "Issue date"). */
  field?: string;
  /** Extracted value to show. */
  extractedValue?: string;
  /** Confidence label — drives a ConfidenceBadge-style chip. */
  confidence?: "low" | "medium" | "high";
  /** Validator outcome. */
  result?: { tone: StatusTone; label: string };
  /** Rule id + short description. */
  rule?: { id: string; description: string };
  /** Plain-English explanation. */
  why?: string;
  /** Section in the case this evidence supports (e.g. "Identity", "Source of Funds"). */
  caseSection?: string;
  /** When set, the drawer footer offers an "Open document" action that pops
   *  the shared DocumentViewer (PDF + extracted markdown). */
  docId?: string;
}

/**
 * Slide-from-right evidence drawer. Closed when `source` is `null`. Reuses
 * the cockpit motion tokens (`drawer-in`) and ties into the same MGX colour
 * system as the onboarding flow.
 */
export function EvidenceDrawer({
  source,
  onClose,
}: {
  source: EvidenceSource | null;
  onClose: () => void;
}) {
  const { openDocument } = useDocumentViewer();

  // Close on ESC for keyboard accessibility.
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source, onClose]);

  if (!source) return null;

  const confidenceTone: StatusTone =
    source.confidence === "high" ? "success" : source.confidence === "medium" ? "warn" : "neutral";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence — ${source.title}`}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close evidence drawer"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/15 backdrop-blur-[2px] transition-opacity"
      />

      <aside
        data-testid="evidence-drawer"
        className={cn(
          "relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden border-l bg-surface shadow-[0_24px_60px_rgba(12,20,48,0.18)]",
          "drawer-in sm:max-w-[420px]",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b bg-gradient-to-br from-[#f5fbfc] to-surface px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-accent">
              Evidence source
            </div>
            <h2 className="mt-1 text-base font-semibold text-primary">{source.title}</h2>
            {source.caseSection && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Supports · {source.caseSection}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="evidence-drawer-close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="scroll-elegant flex-1 overflow-y-auto px-5 py-4">
          <section className="rounded-xl border bg-surface p-3.5">
            <Row icon={<FileText className="size-3.5" />} label="Document">
              <span className="text-foreground">{source.document}</span>
            </Row>
            {source.field && (
              <Row icon={<Sparkles className="size-3.5" />} label="Field">
                <span className="text-foreground">{source.field}</span>
              </Row>
            )}
            {source.extractedValue && (
              <Row icon={<Sparkles className="size-3.5" />} label="Extracted value">
                <span className="font-medium text-foreground">{source.extractedValue}</span>
              </Row>
            )}
            {source.confidence && (
              <Row icon={<CheckCircle2 className="size-3.5" />} label="Confidence">
                <StatusChip size="xs" tone={confidenceTone}>
                  {source.confidence}
                </StatusChip>
              </Row>
            )}
            {source.result && (
              <Row icon={<ShieldCheck className="size-3.5" />} label="Validation result" last>
                <StatusChip size="xs" tone={source.result.tone}>
                  {source.result.label}
                </StatusChip>
              </Row>
            )}
          </section>

          {source.rule && (
            <section className="mt-4 rounded-xl border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] p-3.5">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warn)]">
                <AlertCircle className="size-3" /> Rule applied
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-foreground">
                <span className="font-medium tabular-nums">{source.rule.id}</span> ·{" "}
                {source.rule.description}
              </div>
            </section>
          )}

          {source.why && (
            <section className="mt-4 rounded-xl border bg-surface p-3.5">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <ShieldCheck className="size-3 text-accent" /> Why this matters
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/85">{source.why}</p>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t bg-surface-muted/40 px-5 py-3">
          <div className="text-[11px] text-muted-foreground">
            Sources are stored against the case audit trail.
          </div>
          <div className="flex items-center gap-2">
            {source.docId && (
              <Button
                size="sm"
                onClick={() => {
                  openDocument({
                    docId: source.docId!,
                    fileName: source.document,
                    defaultTab: "pdf",
                  });
                }}
                data-testid="evidence-drawer-open-doc"
              >
                <ExternalLink className="size-3.5" /> Open document
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              data-testid="evidence-drawer-close-footer"
            >
              Close
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[16px_minmax(0,1fr)_minmax(0,1.6fr)] items-baseline gap-2 py-1.5",
        !last && "border-b",
      )}
    >
      <span className="text-accent">{icon}</span>
      <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right text-[12.5px] text-foreground/90">{children}</div>
    </div>
  );
}
