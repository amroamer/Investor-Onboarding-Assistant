import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useStepperStore, useStepperCase } from "@/lib/stepper/store";

export const Route = createFileRoute("/v2/onboarding/")({
  component: Redirect,
});

function Redirect() {
  const { activeCaseId } = useStepperStore();
  const { caseData } = useStepperCase(activeCaseId);
  const step = caseData?.currentStep ?? "profile";
  return <Navigate to="/v2/onboarding/$step" params={{ step }} replace />;
}
