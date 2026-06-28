import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StepFooter({
  onBack,
  onNext,
  nextLabel = "Save & continue",
  busy,
  disableNext,
  nextTestId = "step-next",
  backTestId = "step-back",
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  busy?: boolean;
  disableNext?: boolean;
  nextTestId?: string;
  backTestId?: string;
}) {
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
      {onBack ? (
        <Button data-testid={backTestId} variant="outline" onClick={onBack} disabled={busy}>
          <ArrowLeft className="size-4" /> Back
        </Button>
      ) : (
        <span />
      )}
      {onNext && (
        <Button data-testid={nextTestId} onClick={onNext} disabled={busy || disableNext}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {nextLabel}
        </Button>
      )}
    </div>
  );
}
