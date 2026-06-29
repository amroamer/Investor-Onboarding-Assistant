import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Globe,
  Users,
  ShieldCheck,
  Pencil,
  Sparkles,
  CheckCircle2,
  FileText,
  Info,
} from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { saveDeclarations } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import { deriveFactsFromUploads, type PrefillValue } from "@/lib/stepper/derive";
import {
  AgentGapCallout,
  StepCanvas,
  AgentPanel,
  useAgentFeed,
  type AgentFinding,
} from "./intel";
import { FATCA_SECTIONS, type StepperCase, type Declarations } from "@/lib/stepper/types";

export function DeclarationsStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();
  const init = caseData.declarations;
  const isIndividual = caseData.profile?.legalForm === "Individual";
  const facts = useMemo(() => deriveFactsFromUploads(caseData), [caseData]);
  const feed = useAgentFeed({ caseData, stepKey: "declarations" });

  const [taxResidencyCountry, setTaxResidencyCountry] = useState(
    init.taxResidencyCountry ?? facts.declarations.taxResidencyCountry?.value ?? "",
  );
  const [taxResidencyAdditional, setTaxResidencyAdditional] = useState(
    init.taxResidencyAdditional ?? facts.declarations.taxResidencyAdditional?.value ?? "",
  );
  const [isUsPerson, setIsUsPerson] = useState<boolean | undefined>(
    init.isUsPerson ?? facts.declarations.isUsPerson?.value,
  );
  const [usTin, setUsTin] = useState(init.usTin ?? facts.declarations.usTin?.value ?? "");
  const [pepSelf, setPepSelf] = useState<boolean | undefined>(
    init.pepSelf ?? facts.declarations.pepSelf?.value,
  );
  const [pepFamily, setPepFamily] = useState<boolean | undefined>(
    init.pepFamily ?? facts.declarations.pepFamily?.value,
  );
  const [pepAssociate, setPepAssociate] = useState<boolean | undefined>(
    init.pepAssociate ?? facts.declarations.pepAssociate?.value,
  );
  const [pepDetail, setPepDetail] = useState(
    init.pepDetail ?? facts.declarations.pepDetail?.value ?? "",
  );
  const [fatcaSection, setFatcaSection] = useState<string>(
    init.fatcaSection ?? facts.declarations.fatcaSection?.value ?? "",
  );
  const [fatcaTin, setFatcaTin] = useState(init.fatcaTin ?? facts.declarations.fatcaTin?.value ?? "");
  const [attestationsAccepted, setAttestationsAccepted] = useState(init.attestationsAccepted ?? false);
  const [editTax, setEditTax] = useState(false);
  const [editPep, setEditPep] = useState(false);
  const [busy, setBusy] = useState(false);

  const canContinue =
    !!taxResidencyCountry.trim() &&
    typeof isUsPerson === "boolean" &&
    (!isUsPerson || usTin.trim().length > 0) &&
    typeof pepSelf === "boolean" &&
    typeof pepFamily === "boolean" &&
    typeof pepAssociate === "boolean" &&
    (isIndividual || (fatcaSection.trim().length > 0 && fatcaTin.trim().length > 0)) &&
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
        fatcaSection: !isIndividual && fatcaSection.trim() ? fatcaSection.trim() : undefined,
        fatcaTin: !isIndividual && fatcaTin.trim() ? fatcaTin.trim() : undefined,
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

  const sourceFiles = useMemo(() => {
    const acc = new Map<string, string>();
    const push = (v?: PrefillValue<unknown>) => {
      if (v) acc.set(v.sourceDocId, v.sourceFileName);
    };
    push(facts.declarations.taxResidencyCountry);
    push(facts.declarations.isUsPerson);
    push(facts.declarations.pepSelf);
    push(facts.declarations.fatcaSection);
    return Array.from(acc, ([docId, fileName]) => ({ docId, fileName }));
  }, [facts]);

  const findings: AgentFinding[] = useMemo(() => {
    const out: AgentFinding[] = [];
    if (taxResidencyCountry) {
      out.push({
        label: "Tax residency extracted",
        value: `Primary tax residence: ${taxResidencyCountry}`,
        tone: "complete",
      });
    }
    if (typeof isUsPerson === "boolean") {
      out.push({
        label: "FATCA / CRS completed",
        value: `US citizen or US tax resident: ${isUsPerson ? "Yes" : "No"}`,
        tone: "complete",
      });
    }
    if (
      typeof pepSelf === "boolean" &&
      typeof pepFamily === "boolean" &&
      typeof pepAssociate === "boolean"
    ) {
      out.push({
        label: "PEP declaration completed",
        value:
          pepSelf || pepFamily || pepAssociate
            ? "PEP relationships disclosed"
            : "No PEPs or relationships disclosed",
        tone: "complete",
      });
    }
    out.push({
      label: "Attestation required",
      value: "Please confirm the attestations before continuing.",
      tone: attestationsAccepted ? "complete" : "warning",
    });
    return out;
  }, [taxResidencyCountry, isUsPerson, pepSelf, pepFamily, pepAssociate, attestationsAccepted]);

  const main = (
    <div className="step-page-in">
      <StepHeader
        step={5}
        title="Declarations"
        description="Confirm your tax residency, PEP status, and the required attestations before continuing."
      />

      {/* Agent banner with source chips */}
      {sourceFiles.length > 0 ? (
        <div
          data-testid="agent-prefill-banner"
          data-empty="false"
          className="step-item-in mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[#bde6eb] bg-gradient-to-b from-[#f8feff] to-surface px-5 py-4"
        >
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-white">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Onboarding agent
            </div>
            <h3 className="mt-1 text-[15px] font-semibold text-primary">
              We pre-filled these declarations from your tax-residency and PEP documents.
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Please review each item carefully before you continue.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sourceFiles.map((s) => (
                <span
                  key={s.docId}
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground"
                >
                  <FileText className="size-3 text-accent" />
                  <span className="max-w-[200px] truncate">{s.fileName}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          data-testid="agent-prefill-banner"
          data-empty="true"
          className="step-item-in mt-6 flex items-center gap-4 rounded-2xl border border-dashed bg-surface px-5 py-4 text-muted-foreground"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">
              No tax-residency or PEP documents read yet — fill the cards below by hand.
            </h3>
            <p className="text-[12px]">
              Upload them on the Documents step to autofill these answers.
            </p>
          </div>
        </div>
      )}

      {/* Tax residency card */}
      <NumberedCard
        n={1}
        title="Tax residency / CRS / FATCA"
        subtitle={
          isIndividual
            ? "Confirm your tax residency details and FATCA / CRS status."
            : caseData.profile?.legalForm === "Trust"
              ? "Confirm the trust's tax residency details and CRS / FATCA classification."
              : caseData.profile?.legalForm === "Limited Partnership"
                ? "Confirm the partnership's tax residency details and CRS / FATCA classification."
                : "Confirm the entity's tax residency details and CRS / FATCA classification."
        }
        testId="dec-card-tax"
        onEdit={() => setEditTax((v) => !v)}
        editing={editTax}
      >
        {editTax ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tax-country" className="text-xs text-muted-foreground">
                  Primary tax residence country
                </Label>
                <Input
                  id="tax-country"
                  data-testid="dec-tax-country"
                  value={taxResidencyCountry}
                  onChange={(e) => setTaxResidencyCountry(e.target.value)}
                  placeholder="e.g. United Arab Emirates"
                  className="mt-2"
                />
                {!facts.declarations.taxResidencyCountry && !taxResidencyCountry && (
                  <AgentGapCallout message="I couldn't extract this — please type your primary tax residence country." />
                )}
              </div>
              <div>
                <Label htmlFor="tax-additional" className="text-xs text-muted-foreground">
                  Additional tax residences
                </Label>
                <Input
                  id="tax-additional"
                  data-testid="dec-tax-additional"
                  value={taxResidencyAdditional}
                  onChange={(e) => setTaxResidencyAdditional(e.target.value)}
                  placeholder="None or list them"
                  className="mt-2"
                />
              </div>
            </div>
            <EditYesNo
              label="Are you a US citizen or US tax resident?"
              testId="dec-us-person"
              value={isUsPerson}
              onChange={setIsUsPerson}
            />
            {isUsPerson && (
              <div>
                <Label htmlFor="us-tin" className="text-xs text-muted-foreground">
                  US TIN
                </Label>
                <Input
                  id="us-tin"
                  data-testid="dec-us-tin"
                  value={usTin}
                  onChange={(e) => setUsTin(e.target.value)}
                  className="mt-2"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <ConfirmationAnswer
              icon={<Globe className="size-4" />}
              label="Primary tax residence country"
              value={taxResidencyCountry || "Not yet provided"}
              sourceFile={facts.declarations.taxResidencyCountry?.sourceFileName}
            />
            <ConfirmationAnswer
              icon={<Users className="size-4" />}
              label="Additional tax residences"
              value={taxResidencyAdditional || "None or list them"}
              sourceFile={facts.declarations.taxResidencyAdditional?.sourceFileName}
            />
            <ConfirmationAnswer
              icon={<ShieldCheck className="size-4" />}
              label="US citizen or US tax resident?"
              value={
                isUsPerson === undefined ? "—" : isUsPerson ? "Yes" : "No"
              }
              accent
              sourceFile={facts.declarations.isUsPerson?.sourceFileName}
            />
          </div>
        )}
      </NumberedCard>

      {/* FATCA (entities only) */}
      {!isIndividual && (
        <NumberedCard
          n={2}
          title="FATCA / CRS classification"
          subtitle="How the investing entity is classified for FATCA / CRS reporting."
          testId="dec-fatca-section"
          onEdit={() => {}}
          editing
          hideEdit
        >
          <div className="mb-3 flex items-start gap-2 rounded-lg border bg-surface-muted/50 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <div>
              The agent suggests a section based on your entity documents — review and confirm.
              The agent will not classify on your behalf.
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fatca-section" className="text-xs text-muted-foreground">
                FATCA / CRS section
              </Label>
              <Select value={fatcaSection} onValueChange={setFatcaSection}>
                <SelectTrigger
                  data-testid="dec-fatca-section-select"
                  id="fatca-section"
                  className="mt-2"
                >
                  <SelectValue placeholder="Select a classification…" />
                </SelectTrigger>
                <SelectContent>
                  {FATCA_SECTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fatca-tin" className="text-xs text-muted-foreground">
                Tax Identification Number (TIN)
              </Label>
              <Input
                id="fatca-tin"
                data-testid="dec-fatca-tin"
                value={fatcaTin}
                onChange={(e) => setFatcaTin(e.target.value)}
                placeholder="e.g. 98-7654321"
                className="mt-2"
              />
            </div>
          </div>
        </NumberedCard>
      )}

      {/* PEP card */}
      <NumberedCard
        n={isIndividual ? 2 : 3}
        title="PEP self-declaration"
        subtitle="Confirm your politically-exposed-person (PEP) status."
        testId="dec-card-pep"
        onEdit={() => setEditPep((v) => !v)}
        editing={editPep}
      >
        {editPep ? (
          <div className="space-y-3">
            <EditYesNo
              label="Do you currently or have you ever held a prominent public function?"
              testId="dec-pep-self"
              value={pepSelf}
              onChange={setPepSelf}
            />
            <EditYesNo
              label="Is an immediate family member a PEP?"
              testId="dec-pep-family"
              value={pepFamily}
              onChange={setPepFamily}
            />
            <EditYesNo
              label="Is a known close associate a PEP?"
              testId="dec-pep-associate"
              value={pepAssociate}
              onChange={setPepAssociate}
            />
            {(pepSelf || pepFamily || pepAssociate) && (
              <div>
                <Label htmlFor="pep-detail" className="text-xs text-muted-foreground">
                  Please describe
                </Label>
                <Textarea
                  id="pep-detail"
                  data-testid="dec-pep-detail"
                  rows={3}
                  value={pepDetail}
                  onChange={(e) => setPepDetail(e.target.value)}
                  className="mt-2"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <ConfirmationAnswer
              icon={<Users className="size-4" />}
              label="Held a prominent public function?"
              value={pepSelf === undefined ? "—" : pepSelf ? "Yes" : "No"}
              accent
              sourceFile={facts.declarations.pepSelf?.sourceFileName}
            />
            <ConfirmationAnswer
              icon={<Users className="size-4" />}
              label="Immediate family member a PEP?"
              value={pepFamily === undefined ? "—" : pepFamily ? "Yes" : "No"}
              accent
              sourceFile={facts.declarations.pepFamily?.sourceFileName}
            />
            <ConfirmationAnswer
              icon={<Users className="size-4" />}
              label="Known close associate a PEP?"
              value={pepAssociate === undefined ? "—" : pepAssociate ? "Yes" : "No"}
              accent
              sourceFile={facts.declarations.pepAssociate?.sourceFileName}
            />
          </div>
        )}
      </NumberedCard>

      {/* Attestations */}
      <NumberedCard
        n={isIndividual ? 3 : 4}
        title="Attestations"
        subtitle="By continuing, you confirm the following:"
        testId="dec-card-attestation"
        editing
        hideEdit
        onEdit={() => {}}
      >
        <ul className="space-y-2 text-[13px]">
          {[
            "All information and documents provided are accurate and complete to the best of your knowledge.",
            "You consent to identity, sanctions and PEP screening checks.",
            "You will notify MGX of any material change to the information provided.",
            "You acknowledge that MGX may rely on information provided for compliance and regulatory purposes.",
          ].map((x) => (
            <li key={x} className="flex items-start gap-2 text-foreground/80">
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-accent"
                strokeWidth={2.5}
              />
              <span>{x}</span>
            </li>
          ))}
        </ul>
        <label className="mt-4 flex items-start gap-2.5 rounded-xl border bg-background px-3.5 py-3 font-semibold text-primary">
          <Checkbox
            data-testid="dec-attestation"
            checked={attestationsAccepted}
            onCheckedChange={(v) => setAttestationsAccepted(!!v)}
            className="mt-0.5"
          />
          <span className="text-[13.5px]">I confirm and accept the attestations above.</span>
        </label>
      </NumberedCard>

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "sow-sof" } })}
        onNext={onNext}
        busy={busy}
        disableNext={!canContinue}
        nextTestId="declarations-next"
      />
    </div>
  );

  const intelligence = (
    <AgentPanel
      step={5}
      phase={feed.phase}
      phaseExplanation="Confirming tax residency, PEP status and attestations from your declarations."
      progressPct={feed.progressPct}
      findings={findings}
      activity={feed.activity}
      why="Declarations help MGX meet tax, FATCA / CRS, sanctions and PEP obligations. Honest answers up front speed up acceptance."
      extraSections={[
        {
          title: "Why these declarations are required",
          body: (
            <p>
              Regulatory rules require us to understand your tax residency and PEP status and to
              obtain your attestations. This helps us meet legal obligations and protect the
              integrity of the investment process.
            </p>
          ),
        },
      ]}
    />
  );

  return <StepCanvas main={main} intelligence={intelligence} />;
}

function NumberedCard({
  n,
  title,
  subtitle,
  testId,
  onEdit,
  editing,
  hideEdit = false,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  testId?: string;
  onEdit: () => void;
  editing: boolean;
  hideEdit?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="step-item-in mt-5 overflow-hidden rounded-2xl border bg-surface"
    >
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/12 text-[13px] font-semibold tabular-nums text-accent">
            {n}
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {!hideEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <Pencil className="size-3" />
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ConfirmationAnswer({
  icon,
  label,
  value,
  sourceFile,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sourceFile?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-background p-3.5">
      <div className="flex items-center gap-2 text-accent">{icon}</div>
      <Label className="mt-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div
        className={cn(
          "mt-1 text-[15px] font-semibold",
          accent ? "text-accent" : "text-primary",
        )}
      >
        {value}
      </div>
      {sourceFile && (
        <div className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-md border border-accent/30 bg-accent/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-accent">
          <Sparkles className="size-2.5 shrink-0" />
          <span className="truncate">From {sourceFile}</span>
        </div>
      )}
    </div>
  );
}

function EditYesNo({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <div className="text-sm leading-snug text-foreground">{label}</div>
      <div className="mt-2 flex gap-2">
        <button
          data-testid={`${testId}-yes`}
          data-active={value === true}
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm transition-colors",
            value === true ? "border-accent bg-accent/10 text-accent" : "hover:border-accent/40",
          )}
        >
          Yes
        </button>
        <button
          data-testid={`${testId}-no`}
          data-active={value === false}
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm transition-colors",
            value === false ? "border-accent bg-accent/10 text-accent" : "hover:border-accent/40",
          )}
        >
          No
        </button>
      </div>
    </div>
  );
}

