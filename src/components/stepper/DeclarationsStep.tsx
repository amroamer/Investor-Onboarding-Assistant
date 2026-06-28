import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { saveDeclarations } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import type { StepperCase, Declarations } from "@/lib/stepper/types";

export function DeclarationsStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();
  const init = caseData.declarations;
  const [taxResidencyCountry, setTaxResidencyCountry] = useState(init.taxResidencyCountry ?? "");
  const [taxResidencyAdditional, setTaxResidencyAdditional] = useState(init.taxResidencyAdditional ?? "");
  const [isUsPerson, setIsUsPerson] = useState<boolean | undefined>(init.isUsPerson);
  const [usTin, setUsTin] = useState(init.usTin ?? "");
  const [pepSelf, setPepSelf] = useState<boolean | undefined>(init.pepSelf);
  const [pepFamily, setPepFamily] = useState<boolean | undefined>(init.pepFamily);
  const [pepAssociate, setPepAssociate] = useState<boolean | undefined>(init.pepAssociate);
  const [pepDetail, setPepDetail] = useState(init.pepDetail ?? "");
  const [attestationsAccepted, setAttestationsAccepted] = useState(init.attestationsAccepted ?? false);
  const [busy, setBusy] = useState(false);

  const canContinue =
    !!taxResidencyCountry.trim() &&
    typeof isUsPerson === "boolean" &&
    (!isUsPerson || usTin.trim().length > 0) &&
    typeof pepSelf === "boolean" &&
    typeof pepFamily === "boolean" &&
    typeof pepAssociate === "boolean" &&
    attestationsAccepted;

  const onNext = async () => {
    setBusy(true);
    try {
      const declarations: Declarations = {
        taxResidencyCountry: taxResidencyCountry.trim(),
        taxResidencyAdditional: taxResidencyAdditional.trim() || undefined,
        isUsPerson,
        usTin: isUsPerson ? usTin.trim() : undefined,
        pepSelf,
        pepFamily,
        pepAssociate,
        pepDetail: pepDetail.trim() || undefined,
        attestationsAccepted,
      };
      const saved = await saveDeclarations({ data: { caseId: caseData.caseId, declarations } });
      setCase(saved);
      navigate({ to: "/v2/onboarding/$step", params: { step: "review" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StepHeader step={5} title="Declarations" description="Confirm your tax residency, PEP status and the standard onboarding attestations." />

      <section className="mt-8 rounded-lg border bg-surface p-5">
        <h2 className="text-sm font-medium">Tax residency (CRS / FATCA)</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tax-country">Primary tax residence country</Label>
            <Input id="tax-country" data-testid="dec-tax-country" value={taxResidencyCountry} onChange={(e) => setTaxResidencyCountry(e.target.value)} placeholder="e.g. United Arab Emirates" />
          </div>
          <div>
            <Label htmlFor="tax-additional">Additional tax residences</Label>
            <Input id="tax-additional" data-testid="dec-tax-additional" value={taxResidencyAdditional} onChange={(e) => setTaxResidencyAdditional(e.target.value)} placeholder="None or list them" />
          </div>
        </div>
        <div className="mt-3">
          <YesNo label="Are you a US citizen or US tax resident?" testId="dec-us-person" value={isUsPerson} onChange={setIsUsPerson} />
        </div>
        {isUsPerson && (
          <div className="mt-3">
            <Label htmlFor="us-tin">US TIN</Label>
            <Input id="us-tin" data-testid="dec-us-tin" value={usTin} onChange={(e) => setUsTin(e.target.value)} />
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border bg-surface p-5">
        <h2 className="text-sm font-medium">PEP self-declaration</h2>
        <p className="mt-1 text-xs text-muted-foreground">PEP = Politically Exposed Person, including current and former positions.</p>
        <div className="mt-3 space-y-3">
          <YesNo label="Do you currently or have you ever held a prominent public function?" testId="dec-pep-self" value={pepSelf} onChange={setPepSelf} />
          <YesNo label="Is an immediate family member a PEP?" testId="dec-pep-family" value={pepFamily} onChange={setPepFamily} />
          <YesNo label="Is a known close associate a PEP?" testId="dec-pep-associate" value={pepAssociate} onChange={setPepAssociate} />
        </div>
        {(pepSelf || pepFamily || pepAssociate) && (
          <div className="mt-3">
            <Label htmlFor="pep-detail">Please describe</Label>
            <Textarea id="pep-detail" data-testid="dec-pep-detail" rows={3} value={pepDetail} onChange={(e) => setPepDetail(e.target.value)} />
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border bg-surface p-5">
        <h2 className="text-sm font-medium">Attestations</h2>
        <p className="mt-1 text-xs text-muted-foreground">By continuing, you confirm the following:</p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>· All information and documents provided are accurate and complete to the best of your knowledge.</li>
          <li>· You consent to identity, sanctions and PEP screening checks.</li>
          <li>· You will notify MGX of any material change to the information provided.</li>
        </ul>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <Checkbox data-testid="dec-attestation" checked={attestationsAccepted} onCheckedChange={(v) => setAttestationsAccepted(!!v)} />
          <span>I confirm and accept the attestations above.</span>
        </label>
      </section>

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "sow-sof" } })}
        onNext={onNext}
        busy={busy}
        disableNext={!canContinue}
        nextTestId="declarations-next"
      />
    </div>
  );
}

function YesNo({ label, testId, value, onChange }: { label: string; testId: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div>
      <div className="text-sm">{label}</div>
      <div className="mt-1 flex gap-2">
        <button
          data-testid={`${testId}-yes`}
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${value === true ? "border-accent bg-accent/10 text-accent" : "hover:border-accent/40"}`}
        >Yes</button>
        <button
          data-testid={`${testId}-no`}
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${value === false ? "border-accent bg-accent/10 text-accent" : "hover:border-accent/40"}`}
        >No</button>
      </div>
    </div>
  );
}
