import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveProfile } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import {
  STEPPER_LEGAL_FORM_GROUPS,
  type StepperCase,
  type StepperLegalForm,
} from "@/lib/stepper/types";

export function ProfileStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();
  const [investorName, setInvestorName] = useState(caseData.profile?.investorName ?? "");
  const [primaryContact, setPrimaryContact] = useState(caseData.profile?.primaryContact ?? "");
  const [primaryContactEmail, setPrimaryContactEmail] = useState(caseData.profile?.primaryContactEmail ?? "");
  const [legalForm, setLegalForm] = useState<StepperLegalForm | undefined>(caseData.profile?.legalForm);
  const [jurisdiction, setJurisdiction] = useState(caseData.profile?.jurisdiction ?? "");
  const [busy, setBusy] = useState(false);

  const canSave = !!investorName && !!primaryContact && !!primaryContactEmail && !!legalForm && !!jurisdiction;

  const onNext = async () => {
    if (!legalForm) return;
    setBusy(true);
    try {
      const saved = await saveProfile({
        data: {
          caseId: caseData.caseId,
          profile: {
            investorName: investorName.trim(),
            primaryContact: primaryContact.trim(),
            primaryContactEmail: primaryContactEmail.trim(),
            legalForm,
            jurisdiction: jurisdiction.trim(),
          },
        },
      });
      setCase(saved);
      navigate({ to: "/v2/onboarding/$step", params: { step: "documents" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StepHeader step={1} title="Investor profile" description="Tell us who is investing and the legal form of the investing party. This determines the document checklist for the next step." />

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Field label="Investing party (legal name)" htmlFor="investorName">
          <Input id="investorName" data-testid="profile-investorName" value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="e.g. Amelia Rose Brooks" />
        </Field>
        <Field label="Jurisdiction of residence / formation" htmlFor="jurisdiction">
          <Input id="jurisdiction" data-testid="profile-jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="e.g. United Arab Emirates" />
        </Field>
        <Field label="Primary contact name" htmlFor="primaryContact">
          <Input id="primaryContact" data-testid="profile-primaryContact" value={primaryContact} onChange={(e) => setPrimaryContact(e.target.value)} placeholder="Person we should email" />
        </Field>
        <Field label="Primary contact email" htmlFor="primaryContactEmail">
          <Input id="primaryContactEmail" data-testid="profile-primaryContactEmail" type="email" value={primaryContactEmail} onChange={(e) => setPrimaryContactEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
      </div>

      <div className="mt-10">
        <div className="text-sm font-medium text-foreground">Legal form of the investing party</div>
        <p className="mt-1 text-xs text-muted-foreground">Pick the option that best describes the entity (or person) putting up the capital. This shapes the documents we ask for next.</p>

        <div className="mt-5 space-y-6">
          {STEPPER_LEGAL_FORM_GROUPS.map((group) => (
            <div key={group.heading}>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{group.heading}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {group.forms.map(({ form, description }) => {
                  const active = legalForm === form;
                  return (
                    <button
                      key={form}
                      type="button"
                      data-testid={`legal-form-${form.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                      data-active={active}
                      onClick={() => setLegalForm(form)}
                      className={cn(
                        "rounded-lg border bg-surface p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "border-accent shadow-sm ring-2 ring-accent/30" : "hover:border-accent/50 hover:shadow-sm",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("mt-1 size-4 shrink-0 rounded-full border-2", active ? "border-accent bg-accent" : "border-muted-foreground/30")} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">{form}</div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <StepFooter onNext={onNext} busy={busy} disableNext={!canSave} nextTestId="profile-next" />
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
