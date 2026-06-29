import { Link, useParams } from "@tanstack/react-router";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepperCase, StepKey } from "@/lib/stepper/types";
import { STEPS } from "@/lib/stepper/types";

export function StepRail({ caseData }: { caseData: StepperCase }) {
  const params = useParams({ strict: false }) as { step?: string };
  const activeStep = (params.step ?? caseData.currentStep) as StepKey;

  return (
    <nav className="scroll-elegant flex h-full flex-col overflow-y-auto px-4 py-7">
      <div className="px-3 pb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Onboarding steps
      </div>
      {/* Timeline rail — the vertical line is drawn by a single absolutely-positioned
          element behind the numbered circles. Each row keeps its own background so
          the active row gets a card-like elevation. */}
      <ol className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-10 left-[31px] top-10 w-px bg-border"
        />
        {STEPS.map((step, idx) => {
          const state = caseData.steps[step.key];
          const locked = state.status === "locked";
          const active = activeStep === step.key;
          const complete = state.status === "complete";

          const numberBubble = (
            <div
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
                complete && "border-accent bg-accent text-accent-foreground",
                active && !complete && "border-primary bg-primary text-primary-foreground",
                !active && !complete && !locked && "border-border bg-surface text-foreground/70",
                locked && "border-border bg-surface text-muted-foreground/50",
              )}
            >
              {complete ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : locked ? (
                <Lock className="size-3" />
              ) : (
                idx + 1
              )}
            </div>
          );

          const content = (
            <div className="flex items-start gap-3">
              {numberBubble}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm leading-tight",
                      active && "font-semibold text-foreground",
                      !active && complete && "font-medium text-foreground",
                      !active && !complete && "text-foreground/85",
                      locked && "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                  {complete && (
                    <Check
                      className="size-3.5 shrink-0 text-accent"
                      strokeWidth={3}
                    />
                  )}
                  {locked && <Lock className="size-3 shrink-0 text-muted-foreground/60" />}
                </div>
                <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                  {step.summary}
                </div>
              </div>
            </div>
          );

          if (locked) {
            return (
              <li key={step.key} className="mb-1.5">
                <div
                  data-testid={`step-rail-item-${step.key}`}
                  data-status={state.status}
                  aria-disabled
                  className="block w-full cursor-not-allowed rounded-xl px-3 py-3 opacity-60"
                >
                  {content}
                </div>
              </li>
            );
          }

          return (
            <li key={step.key} className="mb-1.5">
              <Link
                to="/v2/onboarding/$step"
                params={{ step: step.key }}
                data-testid={`step-rail-item-${step.key}`}
                data-status={state.status}
                className={cn(
                  "block w-full rounded-xl px-3 py-3 outline-none transition-all",
                  active &&
                    "border border-border bg-surface shadow-[0_8px_22px_rgba(12,20,48,0.07)]",
                  !active && "border border-transparent hover:bg-surface/70",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {content}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
