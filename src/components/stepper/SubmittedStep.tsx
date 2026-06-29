import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Copy,
  Download,
  ArrowRight,
  Clock,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StepHeader } from "./StepHeader";
import { computeReadiness } from "@/lib/stepper/readiness";
import { StepCanvas, AgentPanel, useAgentFeed } from "./intel";
import type { StepperCase } from "@/lib/stepper/types";

export function SubmittedStep({ caseData }: { caseData: StepperCase }) {
  const [copied, setCopied] = useState(false);
  const readiness = useMemo(() => computeReadiness(caseData), [caseData]);
  const feed = useAgentFeed({ caseData, stepKey: "submitted" });

  const submittedAt = caseData.submittedAt ? new Date(caseData.submittedAt) : null;
  const slaTarget = submittedAt
    ? new Date(submittedAt.getTime() + 3 * 24 * 60 * 60 * 1000)
    : null;

  const copyReference = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(caseData.caseId).then(
      () => {
        setCopied(true);
        toast.success("Reference copied to clipboard.");
        window.setTimeout(() => setCopied(false), 1800);
      },
      () => toast.error("Couldn't copy — please copy the reference manually."),
    );
  };

  const downloadSummary = () => {
    const lines = [
      `MGX Onboarding Case Summary`,
      `=====================================`,
      `Case reference: ${caseData.caseId}`,
      `Submitted: ${submittedAt?.toISOString() ?? "—"}`,
      `Investor: ${caseData.profile?.investorName ?? "—"} (${caseData.profile?.legalForm ?? "—"})`,
      ``,
      `Documents received: ${readiness.documentsReceived}/${readiness.documentsRequired}`,
      `Facts extracted: ${readiness.extractedFacts}`,
      `Verified automatically: ${readiness.verifiedFacts}`,
      `Edited by investor: ${readiness.overriddenFacts}`,
      `Blocking issues: ${readiness.blockingIssues}`,
      ``,
      `This is a UI-only download for the prototype; the real summary will be a`,
      `signed PDF case pack.`,
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caseData.caseId}-summary.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const main = (
    <div className="step-page-in">
      <StepHeader
        step={7}
        title="Submitted"
        description="Your case has been sent to MGX Compliance. You'll hear back by email if any further information is needed."
      />

      {/* Hero: animated success icon + reference + submitted timestamp */}
      <section
        data-testid="submitted-receipt"
        className="step-item-in mt-8 overflow-hidden rounded-2xl border border-[#b9e5eb] bg-gradient-to-br from-[#effeff] via-surface to-surface"
      >
        <div className="flex flex-wrap items-center gap-8 p-8">
          {/* Big animated success circle */}
          <div className="success-pop relative grid size-[110px] shrink-0 place-items-center rounded-full border-[8px] border-accent text-accent">
            <CheckCircle2 className="size-12" strokeWidth={2.2} />
            <span aria-hidden className="absolute inset-0 rounded-full ring-1 ring-accent/20" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold text-primary">Case submitted</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              We've packaged your evidence and audit trail and sent it to MGX Compliance.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-surface px-3.5 py-2.5">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <FileText className="size-3 text-accent" />
                  Reference
                </dt>
                <dd className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold tabular-nums text-primary">
                  <span className="truncate">{caseData.caseId}</span>
                  <button
                    type="button"
                    onClick={copyReference}
                    data-testid="submitted-copy-ref"
                    aria-label="Copy reference"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {copied ? (
                      <CheckCircle2 className="size-3.5 text-accent" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </dd>
              </div>
              <div className="rounded-xl border bg-surface px-3.5 py-2.5">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Clock className="size-3 text-accent" />
                  Submitted
                </dt>
                <dd className="mt-0.5 text-[14px] text-foreground">
                  {submittedAt ? submittedAt.toLocaleString() : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* What happens next */}
      <section className="step-item-in mt-6 overflow-hidden rounded-2xl border bg-surface">
        <div className="border-b px-5 py-4">
          <h2 className="text-[15px] font-semibold text-primary">What happens next</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Typical timeline — your case may move faster or need a follow-up.
          </p>
        </div>
        <ul className="divide-y">
          <NextItem text="Compliance will review the case, including sanctions and PEP screening." />
          <NextItem text="If anything is missing, the team will follow up by email." />
          <NextItem text="You'll receive a confirmation once the case is accepted." />
          <NextItem text="Most cases are reviewed within 3 business days." />
        </ul>
      </section>

      {/* Actions */}
      <div className="step-item-in mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link to="/">← Back to landing</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={downloadSummary}
            data-testid="submitted-download-summary"
          >
            <Download className="size-4" /> Download submission summary
          </Button>
          <Button asChild data-testid="submitted-view-compliance">
            <Link
              to="/compliance"
              search={{ case: caseData.caseId }}
            >
              View compliance workspace <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );

  const intelligence = (
    <AgentPanel
      step={7}
      phase={feed.phase}
      phaseExplanation="Compliance review has started."
      progressPct={100}
      progressCaption={<span>Submission complete — Compliance now owns this case.</span>}
      findings={[
        {
          label: "Case submitted",
          value: "Your case has been successfully submitted to MGX Compliance.",
          tone: "complete",
        },
        {
          label: "Compliance review started",
          value: "Our team will review your case, including sanctions and PEP screening.",
          tone: "info",
        },
        {
          label: "Expected SLA",
          value: slaTarget
            ? `Most cases are reviewed by ${slaTarget.toLocaleDateString()}.`
            : "Most cases are reviewed within 3 business days.",
          tone: "info",
        },
      ]}
      activity={feed.activity}
      why="The case reference and timeline help you track next steps. Keep your reference handy if you need to contact Compliance."
      extraSections={[
        {
          title: "Next actions",
          body: (
            <ul className="list-disc space-y-1 pl-4">
              <li>We may contact you if anything is missing or needs clarification.</li>
              <li>You'll receive a confirmation once the case is accepted.</li>
              <li>Track status and respond securely in your compliance workspace.</li>
            </ul>
          ),
        },
        {
          title: "Reference number",
          body: (
            <div className="space-y-1">
              <div className="rounded-md border bg-background px-2.5 py-1.5 text-sm font-semibold tabular-nums text-primary">
                {caseData.caseId}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Use this if you contact Compliance about the case.
              </div>
            </div>
          ),
        },
      ]}
    />
  );

  return <StepCanvas main={main} intelligence={intelligence} />;
}

function NextItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.5} />
      <span className="text-[13.5px] leading-relaxed text-foreground/85">{text}</span>
    </li>
  );
}
