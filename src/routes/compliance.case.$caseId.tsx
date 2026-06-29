import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useStepperStore, useStepperCase } from "@/lib/stepper/store";
import { StepperComplianceView } from "@/components/compliance/StepperComplianceView";
import { DocumentViewerProvider } from "@/components/stepper/DocumentViewer";
import { MgxLogo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/compliance/case/$caseId")({
  head: ({ params }) => ({
    meta: [
      { title: `Case ${params.caseId} — MGX Compliance (demo)` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComplianceCasePage,
});

function ComplianceCasePage() {
  const { caseId } = Route.useParams();
  const navigate = useNavigate();
  const { cases } = useStepperStore();
  const { caseData } = useStepperCase(caseId);

  // Build a quick-jump list of *other* cases the reviewer can hop to without
  // returning to the queue.
  const otherCases = cases.filter((c) => c.caseId !== caseId);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b bg-primary px-6 text-primary-foreground">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Go to MGX home"
            className="rounded outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MgxLogo className="h-5 w-auto" />
          </Link>
          <div className="h-5 w-px bg-primary-foreground/20" />
          <nav aria-label="Breadcrumb" className="flex items-center gap-2">
            <Link
              to="/compliance"
              data-testid="case-breadcrumb-queue"
              className="inline-flex items-center gap-1 rounded text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-3.5" /> All cases
            </Link>
            <span className="text-primary-foreground/40">·</span>
            <div>
              <div className="text-sm font-semibold tracking-tight">Compliance workspace</div>
              <div className="text-[11px] text-primary-foreground/70">
                {caseData?.profile?.investorName ?? caseId}
              </div>
            </div>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick switch to another case without returning to the queue. */}
          {otherCases.length > 0 && (
            <select
              value={caseId}
              onChange={(e) =>
                navigate({ to: "/compliance/case/$caseId", params: { caseId: e.target.value } })
              }
              className="rounded-md border border-primary-foreground/20 bg-primary px-2 py-1 text-xs text-primary-foreground"
              data-testid="case-quick-switch"
              aria-label="Jump to another case"
            >
              <option value={caseId}>
                {caseData?.profile?.investorName ?? caseId} (this case)
              </option>
              <optgroup label="Other cases">
                {otherCases.map((c) => (
                  <option key={c.caseId} value={c.caseId}>
                    {c.profile?.investorName || `Case ${c.caseId}`}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/compliance">
              <ArrowLeft className="size-3.5" /> Queue
            </Link>
          </Button>
        </div>
      </header>

      <div className={cn("mx-auto max-w-[1320px] px-4 sm:px-6 py-6 pb-24")}>
        {!caseData ? (
          <div className="rounded-lg border bg-surface p-6 text-sm text-muted-foreground">
            Loading case {caseId}…
          </div>
        ) : (
          <DocumentViewerProvider>
            <StepperComplianceView caseData={caseData} />
          </DocumentViewerProvider>
        )}
      </div>
    </div>
  );
}
