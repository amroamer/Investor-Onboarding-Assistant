import type { OnboardingCase } from "@/lib/onboarding/types";
import { ShieldCheck } from "lucide-react";

export function ReceiptCard({ caseData }: { caseData: OnboardingCase }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="flex items-center gap-3 border-b bg-secondary px-4 py-3">
        <ShieldCheck className="size-5 text-primary" />
        <div>
          <div className="text-sm font-semibold">Submission received</div>
          <div className="text-xs text-muted-foreground">Case {caseData.caseId} · {new Date(caseData.submittedAt ?? Date.now()).toLocaleString()}</div>
        </div>
      </div>
      <div className="p-4 text-sm text-foreground">
        Your onboarding information has been submitted to the Compliance team for review. Submission does not
        constitute approval. We will contact you if further information is required.
      </div>
    </div>
  );
}
