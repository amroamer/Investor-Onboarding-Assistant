import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useStepperStore, useStepperCase } from "@/lib/stepper/store";
import { ProfileStep } from "@/components/stepper/ProfileStep";
import { DocumentsStep } from "@/components/stepper/DocumentsStep";
import { OwnershipStep } from "@/components/stepper/OwnershipStep";
import { SowSofStep } from "@/components/stepper/SowSofStep";
import { DeclarationsStep } from "@/components/stepper/DeclarationsStep";
import { ReviewStep } from "@/components/stepper/ReviewStep";
import { SubmittedStep } from "@/components/stepper/SubmittedStep";
import type { StepKey } from "@/lib/stepper/types";

export const Route = createFileRoute("/v2/onboarding/$step")({
  component: StepRoute,
});

function StepRoute() {
  const { step } = Route.useParams();
  const { activeCaseId } = useStepperStore();
  const { caseData } = useStepperCase(activeCaseId);

  if (!caseData) return <div className="text-sm text-muted-foreground">Loading case…</div>;

  const stepKey = step as StepKey;
  const stepState = caseData.steps[stepKey];
  if (!stepState) return <Navigate to="/v2/onboarding/$step" params={{ step: "profile" }} replace />;
  if (stepState.status === "locked") {
    return <Navigate to="/v2/onboarding/$step" params={{ step: caseData.currentStep }} replace />;
  }

  switch (stepKey) {
    case "profile": return <ProfileStep caseData={caseData} />;
    case "documents": return <DocumentsStep caseData={caseData} />;
    case "ownership": return <OwnershipStep caseData={caseData} />;
    case "sow-sof": return <SowSofStep caseData={caseData} />;
    case "declarations": return <DeclarationsStep caseData={caseData} />;
    case "review": return <ReviewStep caseData={caseData} />;
    case "submitted": return <SubmittedStep caseData={caseData} />;
  }
}
