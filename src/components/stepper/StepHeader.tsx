import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StepHeader({
  step,
  title,
  description,
  rightSlot,
  meta,
  className,
}: {
  step: number;
  title: string;
  description: ReactNode;
  rightSlot?: ReactNode;
  /** Optional row of small key/value chips shown under the description. */
  meta?: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b pb-6",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
          Step {step} of 7
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-primary sm:text-[40px] sm:leading-[1.1]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
          {description}
        </p>
        {meta && meta.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {meta.map((m) => (
              <span
                key={m.label}
                className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-2 py-1 text-[11px] text-muted-foreground"
              >
                <span className="uppercase tracking-wider">{m.label}</span>
                <span className="text-foreground">{m.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  );
}
