import type { ReactNode } from "react";

export function StepHeader({
  step,
  title,
  description,
  rightSlot,
}: {
  step: number;
  title: string;
  description: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-accent">
          Step {step} of 7
        </div>
        <h1 className="mt-1 text-2xl font-light tracking-tight text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {rightSlot}
    </div>
  );
}
