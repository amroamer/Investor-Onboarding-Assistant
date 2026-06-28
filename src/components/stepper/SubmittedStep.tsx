import { CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StepHeader } from "./StepHeader";
import type { StepperCase } from "@/lib/stepper/types";

export function SubmittedStep({ caseData }: { caseData: StepperCase }) {
  return (
    <div>
      <StepHeader step={7} title="Submitted" description="Your case has been sent to MGX Compliance. You'll hear back by email if any further information is needed." />

      <div data-testid="submitted-receipt" className="mt-8 rounded-lg border bg-surface p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-accent" />
        <div className="mt-3 text-lg font-medium">Case submitted</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Reference <span className="tabular-nums text-foreground">{caseData.caseId}</span>
        </div>
        {caseData.submittedAt && (
          <div className="mt-1 text-xs text-muted-foreground">
            Submitted {new Date(caseData.submittedAt).toLocaleString()}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-lg border bg-surface p-5">
        <div className="text-sm font-medium">What happens next</div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Compliance will review the case, including sanctions and PEP screening.</li>
          <li>If anything is missing, the team will follow up by email — usually within 3 business days.</li>
          <li>You'll receive a confirmation once the case is accepted.</li>
        </ul>
      </div>

      <div className="mt-8 flex justify-between">
        <Button asChild variant="outline"><Link to="/">Back to landing</Link></Button>
        <Button asChild><Link to="/compliance">View compliance workspace</Link></Button>
      </div>
    </div>
  );
}
