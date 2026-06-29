import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Wand2, Info, Sparkles, FileText, CheckCircle2 } from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { saveSowSof } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import { deriveFactsFromUploads } from "@/lib/stepper/derive";
import {
  AgentGapCallout,
  StepCanvas,
  AgentPanel,
  useAgentFeed,
  type AgentFinding,
} from "./intel";
import {
  requiresSourceOfWealth,
  requiresSourceOfFunds,
  type StepperCase,
} from "@/lib/stepper/types";

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
  "Corporate bank account",
  "Trust bank account",
  "Investment portfolio liquidation",
  "Sale proceeds",
  "Loan / financing",
  "Other",
];

export function SowSofStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();

  const facts = useMemo(() => deriveFactsFromUploads(caseData), [caseData]);
  const feed = useAgentFeed({ caseData, stepKey: "sow-sof" });

  const form = caseData.profile?.legalForm;
  const showSow = !!form && requiresSourceOfWealth(form);
  const showSof = !!form && requiresSourceOfFunds(form);
  const sowLabel = form === "Trust" ? "Source of Wealth of the settlor" : "Source of Wealth";
  const sofLabel = "Source of Funds for this subscription";

  const [sowCategory, setSowCategory] = useState(
    caseData.sourceOfWealth?.category ?? facts.sow.category?.value ?? "",
  );
  const [sowDetail, setSowDetail] = useState(
    caseData.sourceOfWealth?.detail ?? facts.sow.detail?.value ?? "",
  );
  const [sowEvidence, setSowEvidence] = useState<string[]>(
    caseData.sourceOfWealth?.evidenceDocIds?.length
      ? caseData.sourceOfWealth.evidenceDocIds
      : facts.sow.evidenceDocIds,
  );
  const [sofCategory, setSofCategory] = useState(
    caseData.sourceOfFunds?.category ?? facts.sof.category?.value ?? "",
  );
  const [sofDetail, setSofDetail] = useState(
    caseData.sourceOfFunds?.detail ?? facts.sof.detail?.value ?? "",
  );
  const [sofEvidence, setSofEvidence] = useState<string[]>(
    caseData.sourceOfFunds?.evidenceDocIds?.length
      ? caseData.sourceOfFunds.evidenceDocIds
      : facts.sof.evidenceDocIds,
  );
  const [busy, setBusy] = useState(false);

  const evidencePool = caseData.uploadedDocuments.filter(
    (d) =>
      d.status === "ready" &&
      (d.matchedRequirementKeys.includes("source_of_wealth") ||
        d.matchedRequirementKeys.includes("source_of_funds") ||
        d.matchedRequirementKeys.includes("entity_source_of_wealth") ||
        d.matchedRequirementKeys.includes("entity_source_of_funds")),
  );

  const sowValid = !showSow || (!!sowCategory && !!sowDetail.trim());
  const sofValid = !showSof || (!!sofCategory && !!sofDetail.trim());
  const canContinue = sowValid && sofValid;

  const onNext = async () => {
    setBusy(true);
    try {
      const saved = await saveSowSof({
        data: {
          caseId: caseData.caseId,
          sourceOfWealth: showSow
            ? {
                category: sowCategory,
                detail: sowDetail.trim(),
                evidenceDocIds: sowEvidence,
              }
            : {
                category: "Not applicable",
                detail:
                  "Source of Wealth is not separately required — covered by the entity's regulatory status or by the partnership documentation.",
                evidenceDocIds: [],
              },
          sourceOfFunds: showSof
            ? {
                category: sofCategory,
                detail: sofDetail.trim(),
                evidenceDocIds: sofEvidence,
              }
            : {
                category: "Covered by GP authority",
                detail:
                  "Source of Funds for this subscription is established through the GP's Evidence of Authority to Act and the Register of Partners uploaded in Step 2.",
                evidenceDocIds: [],
              },
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

  const bannerSourceFile = facts.sow.detail?.sourceFileName ?? facts.sof.detail?.sourceFileName;
  const anyPrefill = !!bannerSourceFile;

  const polishNarrative = (s: string): string =>
    s
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => {
        const trimmed = sentence.trim();
        if (!trimmed) return "";
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      })
      .filter(Boolean)
      .join(" ")
      .trim();

  const onPolish = (kind: "sow" | "sof") => {
    if (kind === "sow") {
      setSowDetail(polishNarrative(sowDetail));
      toast.success("Source of Wealth narrative tidied up.");
    } else {
      setSofDetail(polishNarrative(sofDetail));
      toast.success("Source of Funds narrative tidied up.");
    }
  };

  // Extracted-fact chips at the bottom of each card.
  const sowChips = useMemo(() => {
    const out: string[] = [];
    if (facts.sow.category) out.push(facts.sow.category.value);
    if (facts.sow.netWorthRange) out.push(`Net worth ${facts.sow.netWorthRange.value}`);
    const period = facts.sow.detail?.value.match(/\b(20\d{2})\s*[-–]\s*(20\d{2})\b/)?.[0];
    if (period) out.push(`Period ${period}`);
    return out;
  }, [facts.sow]);

  const sofChips = useMemo(() => {
    const out: string[] = [];
    if (facts.sof.category) out.push(facts.sof.category.value);
    const amt = facts.sof.detail?.value.match(/USD\s+[\d,]+/i)?.[0];
    if (amt) out.push(amt);
    const bank = facts.sof.detail?.value.match(/from\s+(.+?)\s+(?:account|\.)/i)?.[1];
    if (bank) out.push(bank);
    return out;
  }, [facts.sof]);

  const findings: AgentFinding[] = useMemo(() => {
    const out: AgentFinding[] = [];
    if (facts.sow.detail) {
      out.push({
        label: "Wealth narrative drafted",
        value: `AI-drafted based on ${facts.sow.detail.sourceFileName}.`,
        tone: "complete",
      });
    }
    if (facts.sof.detail) {
      out.push({
        label: "Funds narrative drafted",
        value: `AI-drafted based on ${facts.sof.detail.sourceFileName}.`,
        tone: "complete",
      });
    }
    if (facts.sow.netWorthRange) {
      out.push({
        label: "Net-worth range detected",
        value: facts.sow.netWorthRange.value,
        tone: "complete",
      });
    }
    out.push({
      label: "What needs confirmation",
      value: "Please review and confirm that the narratives and supporting evidence are accurate.",
      tone: "warning",
    });
    return out;
  }, [facts]);

  const main = (
    <div className="step-page-in">
      <StepHeader
        step={4}
        title={
          showSow && showSof
            ? "Source of Wealth & Source of Funds"
            : showSof
              ? "Source of Funds"
              : "Source of Funds — covered by GP authority"
        }
        description={
          showSow && showSof
            ? "Help us understand the difference between your overall wealth and the specific funds used for this subscription."
            : showSof
              ? "Confirm where the specific subscription amount will be remitted from."
              : "For a Limited Partnership, the source of subscription funds is established by the documents you uploaded in Step 2."
        }
      />

      {/* Info strip — shown when at least one card is visible. */}
      {(showSow || showSof) && (
        <div className="step-item-in mt-6 flex items-start gap-3 rounded-2xl border border-[#caeaf0] bg-[#fbfeff] px-5 py-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
            <Info className="size-4" />
          </div>
          <div className="grid gap-3 text-[13px] leading-relaxed sm:grid-cols-2">
            {showSow && (
              <p className="text-foreground/85">
                <span className="font-semibold text-primary">{sowLabel}</span> explains how the wealth
                was built over time (e.g., employment income, business ownership, investments).
              </p>
            )}
            <p className="text-foreground/85">
              <span className="font-semibold text-primary">Source of Funds</span> explains where the
              specific subscription amount will come from (e.g., a bank account, sale of assets, or
              investment proceeds).
            </p>
          </div>
        </div>
      )}

      {/* Agent banner */}
      {anyPrefill ? (
        <div
          data-testid="agent-prefill-banner"
          data-empty="false"
          className="step-item-in mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-[#bde6eb] bg-gradient-to-b from-[#f8feff] to-surface px-5 py-4"
        >
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-white">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Onboarding agent
            </div>
            <h3 className="mt-1 text-[15px] font-semibold text-primary">
              I've drafted the narratives below using the documents you uploaded.
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Please review and edit anything that isn't quite right.
            </p>
          </div>
          <Button
            variant="outline"
            type="button"
            onClick={() => navigate({ to: "/v2/onboarding/$step", params: { step: "documents" } })}
            className="shrink-0"
          >
            <FileText className="size-4" /> Review documents
          </Button>
        </div>
      ) : (
        <div
          data-testid="agent-prefill-banner"
          data-empty="true"
          className="step-item-in mt-4 flex items-center gap-4 rounded-2xl border border-dashed bg-surface px-5 py-4 text-muted-foreground"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">
              No SoW / SoF documents read yet — fill in the narratives below.
            </h3>
            <p className="text-[12px]">
              Upload them on the Documents step and these fields will fill automatically.
            </p>
          </div>
        </div>
      )}

      {/* SoW and SoF cards — both, one or neither depending on the legal form. */}
      {showSow || showSof ? (
        <div
          className={cn(
            "mt-6 grid gap-5",
            showSow && showSof && "lg:grid-cols-2",
          )}
        >
          {showSow && (
            <NarrativeCard
              n={1}
              title={sowLabel}
              subtitle={
                form === "Trust"
                  ? "How the settlor accumulated the wealth that funded the trust."
                  : "Your overall accumulated wealth — how it was built up over time."
              }
              categories={SOW_CATEGORIES}
              category={sowCategory}
              onCategoryChange={setSowCategory}
              categoryTestId="sow-category"
              narrative={sowDetail}
              onNarrativeChange={setSowDetail}
              narrativeTestId="sow-detail"
              onPolish={() => onPolish("sow")}
              chips={sowChips}
              confidence={facts.sow.detail ? "high" : "missing"}
              sourceFile={facts.sow.detail?.sourceFileName}
              gap={
                !facts.sow.detail && !sowDetail.trim()
                  ? "I couldn't find a Source of Wealth narrative in your documents — please describe it here."
                  : undefined
              }
              evidence={
                <EvidencePicker
                  testId="sow-evidence"
                  docs={evidencePool}
                  selected={sowEvidence}
                  onChange={setSowEvidence}
                />
              }
            />
          )}
          {showSof && (
            <NarrativeCard
              n={showSow ? 2 : 1}
              title={sofLabel}
              subtitle="The specific funds that will be used for this subscription."
              categories={SOF_CATEGORIES}
              category={sofCategory}
              onCategoryChange={setSofCategory}
              categoryTestId="sof-category"
              narrative={sofDetail}
              onNarrativeChange={setSofDetail}
              narrativeTestId="sof-detail"
              onPolish={() => onPolish("sof")}
              chips={sofChips}
              confidence={facts.sof.detail ? "high" : "missing"}
              sourceFile={facts.sof.detail?.sourceFileName}
              gap={
                !facts.sof.detail && !sofDetail.trim()
                  ? "I couldn't find a bank statement — please describe the funding account here."
                  : undefined
              }
              evidence={
                <EvidencePicker
                  testId="sof-evidence"
                  docs={evidencePool}
                  selected={sofEvidence}
                  onChange={setSofEvidence}
                />
              }
            />
          )}
        </div>
      ) : (
        // Limited Partnership — neither SoW nor SoF as a narrative; covered by GP docs.
        <section
          data-testid="sowsof-readonly-summary"
          className="step-item-in mt-6 overflow-hidden rounded-2xl border bg-surface"
        >
          <div className="flex items-start gap-3 border-b bg-gradient-to-br from-accent/[0.04] via-transparent to-transparent px-5 py-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
              <CheckCircle2 className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-primary">
                Source of Funds — covered by the General Partner's authority documents
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                For a Limited Partnership, the source of subscription funds is established by the GP's
                written authority and the Register of Partners.
              </p>
            </div>
          </div>
          <ul className="space-y-2 p-5 text-[13.5px]">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.5} />
              <span>
                Evidence of Authority to Act for the Partnership — uploaded in Step 2.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.5} />
              <span>
                Register of Partners identifies the general and limited partners that committed capital.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.5} />
              <span>
                The Limited Partnership Agreement records the commitments and authorised signatories.
              </span>
            </li>
          </ul>
        </section>
      )}

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "ownership" } })}
        onNext={onNext}
        busy={busy}
        disableNext={!canContinue}
        nextTestId="sowsof-next"
      />
    </div>
  );

  const intelligence = (
    <AgentPanel
      step={4}
      phase={feed.phase}
      phaseExplanation="Drafting Source of Wealth and Source of Funds narratives from your documents."
      progressPct={feed.progressPct}
      findings={findings}
      activity={feed.activity}
      why="Regulations require us to understand where your overall wealth comes from and the specific source of funds for this investment. This helps prevent financial crime and ensure a safe, transparent marketplace."
      extraSections={[
        {
          title: "Why we need this information",
          body: (
            <p>
              Regulations require us to understand where your overall wealth comes from and the
              specific source of funds for this investment. This helps prevent financial crime and
              ensure a safe, transparent marketplace.
            </p>
          ),
        },
      ]}
    />
  );

  return <StepCanvas main={main} intelligence={intelligence} />;
}

function NarrativeCard({
  n,
  title,
  subtitle,
  categories,
  category,
  onCategoryChange,
  categoryTestId,
  narrative,
  onNarrativeChange,
  narrativeTestId,
  onPolish,
  chips,
  confidence,
  sourceFile,
  gap,
  evidence,
}: {
  n: number;
  title: string;
  subtitle: string;
  categories: string[];
  category: string;
  onCategoryChange: (v: string) => void;
  categoryTestId: string;
  narrative: string;
  onNarrativeChange: (v: string) => void;
  narrativeTestId: string;
  onPolish: () => void;
  chips: string[];
  confidence: "high" | "missing";
  sourceFile?: string;
  gap?: string;
  evidence: React.ReactNode;
}) {
  return (
    <section className="step-item-in overflow-hidden rounded-2xl border bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b bg-gradient-to-br from-accent/[0.04] via-transparent to-transparent px-5 py-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-[13px] font-semibold tabular-nums">
          {n}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sourceFile && (
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              AI draft
            </span>
          )}
          {confidence === "high" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--success)]/30 bg-[color:var(--success)]/10 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--success)]">
              <CheckCircle2 className="size-3" />
              High confidence
            </span>
          )}
        </div>
      </header>

      <div className="space-y-4 p-5">
        <div>
          <Label htmlFor={`${categoryTestId}-id`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Category
          </Label>
          <Select value={category} onValueChange={onCategoryChange}>
            <SelectTrigger
              data-testid={categoryTestId}
              id={`${categoryTestId}-id`}
              className="mt-2 h-11 w-full"
            >
              <SelectValue placeholder="Select a category…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor={narrativeTestId}
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Narrative (AI-drafted)
            </Label>
            {narrative.trim() && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-testid={`${narrativeTestId.replace("detail", "polish")}`}
                onClick={onPolish}
                className="h-6 gap-1 px-2 text-[11px] text-accent hover:text-accent"
              >
                <Wand2 className="size-3" /> Improve wording
              </Button>
            )}
          </div>
          <Textarea
            id={narrativeTestId}
            data-testid={narrativeTestId}
            rows={5}
            value={narrative}
            onChange={(e) => onNarrativeChange(e.target.value)}
            placeholder="Describe the origin in a few sentences."
            className="mt-2"
          />
          {gap && <AgentGapCallout message={gap} />}
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Supporting evidence{" "}
            <span className="text-[10px] font-normal normal-case text-muted-foreground/70">
              (select all that apply)
            </span>
          </div>
          {evidence}
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            {chips.map((c) => (
              <span
                key={c}
                className="inline-flex items-center rounded-full border bg-[#f7f9fc] px-2.5 py-1 text-[11px] text-foreground/75"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EvidencePicker({
  testId,
  docs,
  selected,
  onChange,
}: {
  testId: string;
  docs: StepperCase["uploadedDocuments"];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  if (docs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No matching documents uploaded yet — come back once they're uploaded.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {docs.map((d) => (
        <li
          key={d.id}
          className={cn(
            "flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm transition-colors",
            selected.includes(d.id) && "border-accent/40 bg-accent/[0.04]",
          )}
        >
          <Checkbox
            id={`${testId}-${d.id}`}
            data-testid={`${testId}-${d.id}`}
            checked={selected.includes(d.id)}
            onCheckedChange={() => toggle(d.id)}
          />
          <label
            htmlFor={`${testId}-${d.id}`}
            className="flex-1 cursor-pointer truncate text-[13px]"
          >
            <span className="text-foreground">{d.fileName}</span>
            <span className="ml-1 text-xs text-muted-foreground">— {d.classifiedAs}</span>
          </label>
          <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {d.classifiedAs.replace(/_/g, " ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
