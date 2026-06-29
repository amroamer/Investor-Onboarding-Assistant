import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  User,
  Building2,
  Briefcase,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  Mail,
  FileText,
  Home,
  Coins,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveProfile } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import {
  STEPPER_LEGAL_FORM_CHOICES,
  type StepperCase,
  type StepperLegalForm,
} from "@/lib/stepper/types";
import { flatRequirements } from "@/lib/stepper/requirements";
import { StepCanvas, AgentPanel, useAgentFeed } from "./intel";

const FORM_ICON: Record<StepperLegalForm, typeof User> = {
  Individual: User,
  "Limited Partnership": Briefcase,
  "Corporation or Private Trust Corporation": Building2,
  Trust: ShieldCheck,
  "Regulated or Listed Entity": Landmark,
};

const REQ_ICONS: Record<string, typeof FileText> = {
  photo_id: User,
  proof_of_address: Home,
  tax_residency: ShieldCheck,
  entity_tax_residency: ShieldCheck,
  source_of_wealth: Coins,
  entity_source_of_wealth: Coins,
  source_of_funds: Wallet,
  entity_source_of_funds: Wallet,
  pep_declaration: ShieldCheck,
  certificate_of_incorporation: FileText,
  certificate_of_limited_partnership: FileText,
  memorandum_and_articles: FileText,
  limited_partnership_agreement: FileText,
  register_of_directors: FileText,
  register_of_shareholders: FileText,
  register_of_partners: FileText,
  gp_constitutional_docs: FileText,
  gp_register_of_directors: FileText,
  evidence_of_authority_partnership: FileText,
  authorised_signatory_list: FileText,
  evidence_of_regulated_status: ShieldCheck,
  audited_financial_statements: FileText,
  trust_deed: FileText,
  schedule_of_trust_parties: FileText,
  source_of_wealth_settlor: Coins,
  authority_to_act_trust: FileText,
  intermediate_register_of_members: FileText,
};

export function ProfileStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();

  const [legalForm, setLegalForm] = useState<StepperLegalForm | undefined>(caseData.profile?.legalForm);
  const [investorName, setInvestorName] = useState(caseData.profile?.investorName ?? "");
  const [primaryContactEmail, setPrimaryContactEmail] = useState(
    caseData.profile?.primaryContactEmail ?? "",
  );
  const [busy, setBusy] = useState(false);

  const isIndividual = legalForm === "Individual";
  const nameLabel = isIndividual ? "Full legal name" : "Investing entity (legal name)";
  const namePlaceholder = isIndividual
    ? "e.g. Amelia Rose Brooks"
    : "e.g. Atlas Growth Opportunities LP";

  const canSave = !!investorName.trim() && !!primaryContactEmail.trim() && !!legalForm;

  const previewRequirements = useMemo(
    () => (legalForm ? flatRequirements(legalForm) : []),
    [legalForm],
  );

  const onNext = async () => {
    if (!legalForm) return;
    setBusy(true);
    try {
      const saved = await saveProfile({
        data: {
          caseId: caseData.caseId,
          profile: {
            investorName: investorName.trim(),
            primaryContact: investorName.trim(),
            primaryContactEmail: primaryContactEmail.trim(),
            legalForm,
            jurisdiction: "",
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

  const feed = useAgentFeed({ caseData, stepKey: "profile" });

  const main = (
    <div className="step-page-in">
      <StepHeader
        step={1}
        title="Investor profile"
        description="Provide your investor type and details below. We'll use this information to determine your onboarding requirements and the documents we need."
      />

      {/* Details row */}
      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        <Field label={nameLabel} htmlFor="investorName">
          <InputWithIcon icon={<User className="size-4" />}>
            <Input
              id="investorName"
              data-testid="profile-investorName"
              value={investorName}
              onChange={(e) => setInvestorName(e.target.value)}
              placeholder={namePlaceholder}
              className="h-12 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </InputWithIcon>
        </Field>
        <Field label="Email address" htmlFor="primaryContactEmail">
          <InputWithIcon icon={<Mail className="size-4" />}>
            <Input
              id="primaryContactEmail"
              data-testid="profile-primaryContactEmail"
              type="email"
              value={primaryContactEmail}
              onChange={(e) => setPrimaryContactEmail(e.target.value)}
              placeholder="name@example.com"
              className="h-12 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </InputWithIcon>
        </Field>
      </section>

      {/* The 5 investor party types — flat cards, one click selects. */}
      <section className="mt-10">
        <h2 className="text-base font-semibold text-primary">
          What best describes the investing party?
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          We'll tailor the onboarding to your structure.
        </p>

        <div data-testid="profile-forms" className="mt-5 grid gap-3 sm:grid-cols-2">
          {STEPPER_LEGAL_FORM_CHOICES.map((c, idx) => {
            const Icon = FORM_ICON[c.form];
            const selected = legalForm === c.form;
            return (
              <button
                key={c.form}
                type="button"
                data-testid={`legal-form-${c.form.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                data-active={selected}
                onClick={() => setLegalForm(c.form)}
                className={cn(
                  "step-item-in group relative flex min-h-[112px] items-center gap-4 rounded-2xl border bg-surface p-5 text-left transition-all duration-200 outline-none",
                  selected
                    ? "border-2 border-accent bg-gradient-to-br from-surface to-[#f7feff] shadow-[0_8px_22px_rgba(11,143,160,0.12)]"
                    : "hover:-translate-y-0.5 hover:border-[#b9c5d8] hover:shadow-[0_18px_50px_rgba(12,20,48,0.08)]",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  c.form === "Regulated or Listed Entity" && "sm:col-span-2",
                )}
                style={{ animationDelay: `${idx * 0.06}s` }}
              >
                <div
                  className={cn(
                    "grid size-12 shrink-0 place-items-center rounded-full bg-[#eefafd] text-accent",
                    selected && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="size-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-primary">{c.form}</h3>
                  <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
                    {c.description}
                  </p>
                </div>
                {selected && (
                  <div className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-accent text-accent-foreground shadow-sm">
                    <CheckCircle2 className="size-4" strokeWidth={2.5} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected summary with required-document chips */}
      {legalForm && (
        <section
          data-testid="profile-selection-summary"
          className="step-item-in mt-6 rounded-2xl border border-[#b9e5eb] bg-gradient-to-b from-[#f5fdff] to-surface p-5"
        >
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <CheckCircle2 className="size-5" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-primary">
                You selected: <span className="text-accent">{legalForm}</span>
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Next, we'll ask you to upload the following documents and complete declarations.
              </p>
              {previewRequirements.length > 0 && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {previewRequirements.slice(0, 12).map((r, i) => {
                    const Icon = REQ_ICONS[r.key] ?? FileText;
                    return (
                      <li
                        key={r.key}
                        className="step-item-in flex items-center gap-2 rounded-xl border bg-surface px-3 py-2.5 text-[12px] text-foreground/80"
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <Icon className="size-4 shrink-0 text-accent" />
                        <span className="truncate">{r.name}</span>
                      </li>
                    );
                  })}
                  {previewRequirements.length > 12 && (
                    <li className="flex items-center text-[11px] text-muted-foreground">
                      +{previewRequirements.length - 12} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <StepFooter onNext={onNext} busy={busy} disableNext={!canSave} nextTestId="profile-next" />

      <p className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        <ChevronRight className="size-3 -rotate-90 text-accent" />
        All information is encrypted and secure.
      </p>
    </div>
  );

  const intelligence = (
    <AgentPanel
      step={1}
      phase={feed.phase}
      phaseExplanation="Determining onboarding requirements from your investor type."
      progressPct={feed.progressPct}
      findings={
        legalForm
          ? [
              { label: "Investor type selected", value: legalForm, tone: "complete" },
              {
                label: "Required documents generated",
                value: `${previewRequirements.length} document${previewRequirements.length === 1 ? "" : "s"}`,
                tone: "complete",
              },
            ]
          : feed.findings
      }
      activity={feed.activity}
      why="Investor type determines the documents and declarations required for onboarding, and the routing your case takes inside Compliance."
      extraSections={[
        {
          title: "What happens next",
          body: (
            <p>
              After you continue, we'll request, read and validate your supporting documents using
              AI and expert review. You'll be guided step-by-step.
            </p>
          ),
        },
      ]}
    />
  );

  return <StepCanvas main={main} intelligence={intelligence} />;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-sm font-semibold text-primary">
        {label}
      </Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function InputWithIcon({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center gap-3 rounded-[10px] border bg-surface px-4 shadow-[inset_0_1px_0_rgba(0,0,0,0.02)] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
