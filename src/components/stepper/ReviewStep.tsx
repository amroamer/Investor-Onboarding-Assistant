import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, CheckCircle2 } from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { submitCase } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import type { StepperCase } from "@/lib/stepper/types";

export function ReviewStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!caseData.profile) return <div>Complete the Profile step first.</div>;

  const onSubmit = async () => {
    setBusy(true);
    try {
      const saved = await submitCase({ data: { caseId: caseData.caseId } });
      setCase(saved);
      navigate({ to: "/v2/onboarding/$step", params: { step: "submitted" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StepHeader step={6} title="Review and confirm" description="Review your case before submitting it to Compliance for review. You can step back to any earlier step to amend." />

      <Section title="Investor profile" testId="review-profile">
        <KV k="Investor" v={caseData.profile.investorName} />
        <KV k="Legal form" v={caseData.profile.legalForm} />
        <KV k="Jurisdiction" v={caseData.profile.jurisdiction} />
        <KV k="Primary contact" v={`${caseData.profile.primaryContact} <${caseData.profile.primaryContactEmail}>`} />
      </Section>

      <Section title={`Documents (${caseData.checklist.length} received)`} testId="review-documents">
        <ul className="space-y-1">
          {caseData.checklist.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm" data-testid={`review-checklist-${c.requirementKey}`}>
              <CheckCircle2 className="mt-0.5 size-4 text-accent" />
              <div className="flex-1">
                <div>{c.name}</div>
                {c.issue && (
                  <div className="text-xs text-[color:var(--attention)]">⚠ {c.issue}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Ownership and related parties (${caseData.relatedParties.length})`} testId="review-ownership">
        <ul className="space-y-1 text-sm">
          {caseData.relatedParties.map((p) => (
            <li key={p.id}>{p.name} — {p.role}{typeof p.ownershipPct === "number" ? ` (${p.ownershipPct}%)` : ""}</li>
          ))}
        </ul>
      </Section>

      <Section title="Source of Wealth & Funds" testId="review-sowsof">
        <KV k="Source of Wealth" v={`${caseData.sourceOfWealth?.category}: ${caseData.sourceOfWealth?.detail}`} />
        <KV k="Source of Funds" v={`${caseData.sourceOfFunds?.category}: ${caseData.sourceOfFunds?.detail}`} />
      </Section>

      <Section title="Declarations" testId="review-declarations">
        <KV k="Tax residency" v={caseData.declarations.taxResidencyCountry ?? "—"} />
        <KV k="US person" v={caseData.declarations.isUsPerson ? "Yes" : "No"} />
        <KV k="PEP" v={
          caseData.declarations.pepSelf || caseData.declarations.pepFamily || caseData.declarations.pepAssociate
            ? `Yes — ${caseData.declarations.pepDetail ?? "see narrative"}`
            : "No"
        } />
      </Section>

      <div className="mt-8 rounded-lg border bg-surface p-5">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox data-testid="review-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
          <span>I have reviewed the information above and confirm that it is complete and accurate. Submitting will send the case to Compliance for review.</span>
        </label>
      </div>

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "declarations" } })}
        onNext={onSubmit}
        busy={busy}
        disableNext={!confirmed}
        nextLabel="Submit to Compliance"
        nextTestId="review-submit"
      />
    </div>
  );
}

function Section({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId} className="mt-6 rounded-lg border bg-surface p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 text-sm">
      <div className="text-muted-foreground">{k}</div>
      <div>{v}</div>
    </div>
  );
}
