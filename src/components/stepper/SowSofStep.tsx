import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { saveSowSof } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import type { StepperCase } from "@/lib/stepper/types";

const SOW_CATEGORIES = [
  "Employment income",
  "Sale of business",
  "Investment income",
  "Inheritance",
  "Family wealth",
  "Other",
];

const SOF_CATEGORIES = [
  "Personal bank account",
  "Investment portfolio liquidation",
  "Sale proceeds",
  "Loan / financing",
  "Other",
];

export function SowSofStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();

  const [sowCategory, setSowCategory] = useState(caseData.sourceOfWealth?.category ?? "");
  const [sowDetail, setSowDetail] = useState(caseData.sourceOfWealth?.detail ?? "");
  const [sowEvidence, setSowEvidence] = useState<string[]>(caseData.sourceOfWealth?.evidenceDocIds ?? []);
  const [sofCategory, setSofCategory] = useState(caseData.sourceOfFunds?.category ?? "");
  const [sofDetail, setSofDetail] = useState(caseData.sourceOfFunds?.detail ?? "");
  const [sofEvidence, setSofEvidence] = useState<string[]>(caseData.sourceOfFunds?.evidenceDocIds ?? []);
  const [busy, setBusy] = useState(false);

  // Evidence pool = all uploaded SoW / SoF / bank-statement docs from the Documents step.
  const evidencePool = caseData.uploadedDocuments.filter(
    (d) =>
      d.status === "ready" &&
      (d.matchedRequirementKeys.includes("source_of_wealth") ||
        d.matchedRequirementKeys.includes("source_of_funds") ||
        d.matchedRequirementKeys.includes("entity_source_of_wealth") ||
        d.matchedRequirementKeys.includes("entity_source_of_funds")),
  );

  const canContinue = !!sowCategory && !!sowDetail.trim() && !!sofCategory && !!sofDetail.trim();

  const onNext = async () => {
    setBusy(true);
    try {
      const saved = await saveSowSof({
        data: {
          caseId: caseData.caseId,
          sourceOfWealth: { category: sowCategory, detail: sowDetail.trim(), evidenceDocIds: sowEvidence },
          sourceOfFunds: { category: sofCategory, detail: sofDetail.trim(), evidenceDocIds: sofEvidence },
        },
      });
      setCase(saved);
      navigate({ to: "/v2/onboarding/$step", params: { step: "declarations" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StepHeader step={4} title="Source of Wealth & Source of Funds" description="Explain where your overall wealth comes from (Source of Wealth) and where the subscription monies will be remitted from (Source of Funds). Tick the supporting evidence below where applicable." />

      <section className="mt-8 rounded-lg border bg-surface p-5">
        <h2 className="text-sm font-medium">Source of Wealth</h2>
        <p className="mt-1 text-xs text-muted-foreground">Your overall accumulated wealth — how it was built up over time.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sow-cat">Category</Label>
            <select
              id="sow-cat"
              data-testid="sow-category"
              value={sowCategory}
              onChange={(e) => setSowCategory(e.target.value)}
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select a category…</option>
              {SOW_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="sow-detail">Narrative</Label>
          <Textarea id="sow-detail" data-testid="sow-detail" rows={4} value={sowDetail} onChange={(e) => setSowDetail(e.target.value)} placeholder="Describe how your wealth was accumulated, the time period and a rough order of magnitude." />
        </div>
        <EvidencePicker
          testId="sow-evidence"
          label="Supporting evidence from your uploaded documents"
          docs={evidencePool}
          selected={sowEvidence}
          onChange={setSowEvidence}
        />
      </section>

      <section className="mt-6 rounded-lg border bg-surface p-5">
        <h2 className="text-sm font-medium">Source of Funds</h2>
        <p className="mt-1 text-xs text-muted-foreground">The specific funds that will be used for the subscription.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sof-cat">Category</Label>
            <select
              id="sof-cat"
              data-testid="sof-category"
              value={sofCategory}
              onChange={(e) => setSofCategory(e.target.value)}
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select a category…</option>
              {SOF_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="sof-detail">Narrative</Label>
          <Textarea id="sof-detail" data-testid="sof-detail" rows={4} value={sofDetail} onChange={(e) => setSofDetail(e.target.value)} placeholder="Describe the specific account and origin of the funds for this subscription." />
        </div>
        <EvidencePicker
          testId="sof-evidence"
          label="Supporting evidence from your uploaded documents"
          docs={evidencePool}
          selected={sofEvidence}
          onChange={setSofEvidence}
        />
      </section>

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "ownership" } })}
        onNext={onNext}
        busy={busy}
        disableNext={!canContinue}
        nextTestId="sowsof-next"
      />
    </div>
  );
}

function EvidencePicker({
  testId,
  label,
  docs,
  selected,
  onChange,
}: {
  testId: string;
  label: string;
  docs: StepperCase["uploadedDocuments"];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="mt-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {docs.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No matching documents uploaded yet — you can come back to this once you upload them.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${testId}-${d.id}`}
                data-testid={`${testId}-${d.id}`}
                checked={selected.includes(d.id)}
                onCheckedChange={() => toggle(d.id)}
              />
              <label htmlFor={`${testId}-${d.id}`} className="cursor-pointer">{d.fileName} — {d.classifiedAs}</label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
