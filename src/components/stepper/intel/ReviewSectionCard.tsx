import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, AlertCircle, ChevronDown, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepKey } from "@/lib/stepper/types";

interface Props {
  title: string;
  status: "complete" | "attention" | "pending";
  /** Short headline summarising the section. */
  summary?: string;
  /** Numeric metadata shown in the chip strip (facts, evidence, issues). */
  metrics?: Array<{ label: string; value: string | number; attention?: boolean }>;
  /** Step key — clicking "Edit" navigates back to that step. */
  editStep?: StepKey;
  /** Section body — rendered when expanded. */
  children: ReactNode;
  /** Default expanded state. */
  defaultOpen?: boolean;
  testId?: string;
}

export function ReviewSectionCard({
  title,
  status,
  summary,
  metrics = [],
  editStep,
  children,
  defaultOpen = true,
  testId,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      data-testid={testId}
      data-status={status}
      className={cn(
        "overflow-hidden rounded-xl border bg-surface transition-colors",
        status === "attention" && "border-[color:var(--attention)]/30",
      )}
    >
      <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-secondary"
          aria-label={open ? "Collapse section" : "Expand section"}
        >
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <StatusChip status={status} />
          </div>
          {summary && <div className="mt-0.5 text-xs text-muted-foreground">{summary}</div>}
          {metrics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {metrics.map((m) => (
                <span
                  key={m.label}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                    m.attention
                      ? "border-[color:var(--attention)]/30 bg-[color:var(--attention)]/[0.06] text-[color:var(--attention)]"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <span className="text-foreground">{m.value}</span>
                  <span>{m.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {editStep && (
          <Link
            to="/v2/onboarding/$step"
            params={{ step: editStep }}
            data-testid={`${testId ?? "review-section"}-edit`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <Pencil className="size-3" /> Edit
          </Link>
        )}
      </div>
      {open && <div className="border-t bg-background/40 px-4 py-3">{children}</div>}
    </section>
  );
}

function StatusChip({ status }: { status: "complete" | "attention" | "pending" }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/[0.06] px-2 py-0.5 text-[10px] font-medium text-accent">
        <CheckCircle2 className="size-3" /> Complete
      </span>
    );
  }
  if (status === "attention") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--attention)]/30 bg-[color:var(--attention)]/[0.06] px-2 py-0.5 text-[10px] font-medium text-[color:var(--attention)]">
        <AlertCircle className="size-3" /> Needs review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Pending
    </span>
  );
}
