import { Link, useNavigate } from "@tanstack/react-router";
import { Lock, RotateCcw, Menu } from "lucide-react";
import { useState } from "react";
import { MgxLogo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StepRail } from "./StepRail";
import { MobileProgress } from "./MobileProgress";
import type { ReactNode } from "react";
import type { StepperCase } from "@/lib/stepper/types";
import { computeProgressPct } from "@/lib/stepper/types";
import { useStepperStore } from "@/lib/stepper/store";

export function StepperShell({
  caseData,
  children,
}: {
  caseData: StepperCase;
  children: ReactNode;
}) {
  const pct = computeProgressPct(caseData);
  const { resetCase, setCase } = useStepperStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const onReset = async () => {
    const fresh = await resetCase(caseData.caseId);
    setCase(fresh);
    navigate({ to: "/v2/onboarding/$step", params: { step: "profile" } });
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            {/* Mobile / tablet trigger for the step rail */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button
                  data-testid="stepper-rail-mobile-toggle"
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  aria-label="Open onboarding steps"
                >
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetTitle className="sr-only">Onboarding steps</SheetTitle>
                <SheetDescription className="sr-only">
                  Jump between steps in your onboarding case.
                </SheetDescription>
                <div onClick={() => setSidebarOpen(false)}>
                  <StepRail caseData={caseData} />
                </div>
              </SheetContent>
            </Sheet>
            <Link
              to="/"
              aria-label="Go to landing"
              className="flex items-center gap-2 rounded text-primary outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MgxLogo className="h-5 w-auto" />
            </Link>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden md:inline">
              Case <span className="tabular-nums text-foreground">{caseData.caseId}</span>
            </span>
            <span className="hidden md:inline">·</span>
            <span className="hidden sm:inline-flex items-center gap-1">
              <Lock className="size-3.5" /> Secure prototype
            </span>
            <Button
              data-testid="stepper-reset"
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="ml-2"
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          </div>
        </div>
        <div className="h-1 bg-secondary">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
            data-testid="stepper-progress-bar"
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
        <aside className="hidden border-r bg-surface-muted lg:block">
          <StepRail caseData={caseData} />
        </aside>
        <main className="scroll-elegant min-h-0 overflow-y-auto bg-background">
          {/* Mobile/tablet progress strip — visible until the sidebar appears at lg. */}
          <MobileProgress caseData={caseData} />
          <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
