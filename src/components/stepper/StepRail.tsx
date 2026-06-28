import { Link, useParams } from "@tanstack/react-router";
import { CheckCircle2, Circle, AlertCircle, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepperCase, StepStatus, StepKey } from "@/lib/stepper/types";
import { STEPS } from "@/lib/stepper/types";

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "complete") return <CheckCircle2 className="size-4 text-accent" />;
  if (status === "attention") return <AlertCircle className="size-4 text-[color:var(--attention)]" />;
  if (status === "in_progress") return <Loader2 className="size-4 text-primary" />;
  if (status === "locked") return <Lock className="size-3.5 text-muted-foreground/50" />;
  return <Circle className="size-4 text-muted-foreground/50" />;
}

export function StepRail({ caseData }: { caseData: StepperCase }) {
  const params = useParams({ strict: false }) as { step?: string };
  const activeStep = (params.step ?? caseData.currentStep) as StepKey;

  return (
    <nav className="scroll-elegant flex h-full flex-col overflow-y-auto px-3 py-5">
      <div className="px-3 pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Onboarding steps
      </div>
      <ol className="space-y-1">
        {STEPS.map((step, idx) => {
          const state = caseData.steps[step.key];
          const locked = state.status === "locked";
          const active = activeStep === step.key;
          const content = (
            <div className="flex w-full items-start gap-3">
              <div className="mt-0.5 grid size-6 place-items-center rounded-full bg-secondary text-xs font-medium tabular-nums text-muted-foreground">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("flex items-center gap-2 text-sm leading-tight", active && "font-semibold text-foreground")}>
                  <span className="truncate">{step.title}</span>
                  <StatusIcon status={state.status} />
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{step.summary}</div>
              </div>
            </div>
          );
          if (locked) {
            return (
              <li key={step.key}>
                <div
                  data-testid={`step-rail-item-${step.key}`}
                  data-status={state.status}
                  aria-disabled
                  className="block w-full cursor-not-allowed rounded-md px-3 py-2.5 opacity-50"
                >
                  {content}
                </div>
              </li>
            );
          }
          return (
            <li key={step.key}>
              <Link
                to="/v2/onboarding/$step"
                params={{ step: step.key }}
                data-testid={`step-rail-item-${step.key}`}
                data-status={state.status}
                className={cn(
                  "block w-full rounded-md px-3 py-2.5 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-surface",
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
