import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStepperStore, useStepperCase } from "@/lib/stepper/store";
import { StepperShell } from "@/components/stepper/StepperShell";

export const Route = createFileRoute("/v2/onboarding")({
  head: () => ({
    meta: [
      { title: "Onboarding (stepper) — MGX" },
      { name: "description", content: "Stepper-based investor onboarding." },
    ],
  }),
  component: V2OnboardingLayout,
});

function V2OnboardingLayout() {
  const { activeCaseId, startNewCase, setActiveCaseId } = useStepperStore();
  const { caseData } = useStepperCase(activeCaseId);

  // Auto-create a new case if none is active.
  useEffect(() => {
    if (!activeCaseId) {
      startNewCase().then((c) => setActiveCaseId(c.caseId)).catch(() => undefined);
    }
  }, [activeCaseId, startNewCase, setActiveCaseId]);

  if (!activeCaseId || !caseData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <StepperShell caseData={caseData}>
      <Outlet />
    </StepperShell>
  );
}
