import { Link, useParams } from "@tanstack/react-router";
import { CheckCircle2, Circle, Loader2, AlertCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS, type StepperCase, type StepKey, type StepStatus } from "@/lib/stepper/types";

function statusIcon(s: StepStatus) {
  if (s === "complete") return <CheckCircle2 className="size-3" />;
  if (s === "attention") return <AlertCircle className="size-3" />;
  if (s === "in_progress") return <Loader2 className="size-3 animate-spin" />;
  if (s === "locked") return <Lock className="size-2.5" />;
  return <Circle className="size-3" />;
}

/**
 * Horizontal step strip for mobile and tablet. Hidden on lg+ (replaced by the
 * left rail). Scrolls horizontally if it overflows.
 */
export function MobileProgress({ caseData }: { caseData: StepperCase }) {
  const params = useParams({ strict: false }) as { step?: string };
  const active = (params.step ?? caseData.currentStep) as StepKey;
  const idx = STEPS.findIndex((s) => s.key === active);
  const current = STEPS[idx];

  return (
    <div
      data-testid="mobile-progress"
      className="sticky top-0 z-10 border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80 lg:hidden"
    >
      <div className="px-4 py-2.5 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Step {idx + 1} of {STEPS.length}
            </div>
            <div className="truncate text-sm font-semibold text-foreground">{current?.title}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1">
            {STEPS.map((s) => {
              const state = caseData.steps[s.key];
              const isActive = s.key === active;
              const isLocked = state.status === "locked";
              const pill = (
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border text-[10px] font-medium tabular-nums transition-colors",
                    isActive && "border-primary bg-primary text-primary-foreground",
                    !isActive &&
                      state.status === "complete" &&
                      "border-accent/50 bg-accent/10 text-accent",
                    !isActive &&
                      state.status === "attention" &&
                      "border-[color:var(--attention)]/50 bg-[color:var(--attention)]/10 text-[color:var(--attention)]",
                    !isActive &&
                      state.status !== "complete" &&
                      state.status !== "attention" &&
                      "border-border bg-surface text-muted-foreground",
                  )}
                  aria-label={`${s.title} — ${state.status}`}
                >
                  {state.status === "available" || state.status === "in_progress"
                    ? STEPS.indexOf(s) + 1
                    : statusIcon(state.status)}
                </span>
              );
              if (isLocked) {
                return (
                  <span key={s.key} data-testid={`mobile-step-${s.key}`} className="opacity-50">
                    {pill}
                  </span>
                );
              }
              return (
                <Link
                  key={s.key}
                  to="/v2/onboarding/$step"
                  params={{ step: s.key }}
                  data-testid={`mobile-step-${s.key}`}
                  className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {pill}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
