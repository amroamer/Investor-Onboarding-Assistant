import { Link } from "@tanstack/react-router";
import { Lock, RotateCcw } from "lucide-react";
import { MgxLogo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { StepRail } from "./StepRail";
import type { ReactNode } from "react";
import type { StepperCase } from "@/lib/stepper/types";
import { computeProgressPct } from "@/lib/stepper/types";
import { useStepperStore } from "@/lib/stepper/store";
import { useNavigate } from "@tanstack/react-router";

export function StepperShell({ caseData, children }: { caseData: StepperCase; children: ReactNode }) {
  const pct = computeProgressPct(caseData);
  const { resetCase, setCase } = useStepperStore();
  const navigate = useNavigate();

  const onReset = async () => {
    const fresh = await resetCase(caseData.caseId);
    setCase(fresh);
    navigate({ to: "/v2/onboarding/$step", params: { step: "profile" } });
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link
            to="/"
            aria-label="Go to landing"
            className="flex items-center gap-2 rounded text-primary outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MgxLogo className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Case <span className="tabular-nums text-foreground">{caseData.caseId}</span></span>
            <span className="hidden sm:inline">·</span>
            <Lock className="size-3.5" /> Secure prototype
            <Button data-testid="stepper-reset" variant="ghost" size="sm" onClick={onReset} className="ml-2">
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          </div>
        </div>
        <div className="h-1 bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} data-testid="stepper-progress-bar" />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="border-r bg-surface-muted">
          <StepRail caseData={caseData} />
        </aside>
        <main className="scroll-elegant min-h-0 overflow-y-auto bg-background">
          <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
