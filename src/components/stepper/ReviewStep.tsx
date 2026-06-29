import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  User,
  FileText,
  Users,
  Coins,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useDocumentViewer } from "./DocumentViewer";
import { submitCase } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import { deriveFactsFromUploads, summariseSources } from "@/lib/stepper/derive";
import type { PrefillValue } from "@/lib/stepper/derive";
import { computeReadiness } from "@/lib/stepper/readiness";
import {
  StepCanvas,
  AgentPanel,
  useAgentFeed,
  CountUp,
  type AgentFinding,
} from "./intel";
import type { StepperCase, StepKey } from "@/lib/stepper/types";

export function ReviewStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const facts = useMemo(() => deriveFactsFromUploads(caseData), [caseData]);
  const readiness = useMemo(() => computeReadiness(caseData), [caseData]);
  const feed = useAgentFeed({ caseData, stepKey: "review" });

  const findings: AgentFinding[] = useMemo(() => {
    const out: AgentFinding[] = [];
    out.push({
      label: "Blocking issues",
      value:
        readiness.blockingIssues === 0
          ? "No blocking issues detected."
          : `${readiness.blockingIssues} blocking issue${readiness.blockingIssues === 1 ? "" : "s"} to resolve.`,
      tone: readiness.blockingIssues === 0 ? "complete" : "warning",
    });
    out.push({
      label: "User-edited items",
      value: `${readiness.overriddenFacts} items you adjusted during onboarding.`,
      tone: "info",
    });
    out.push({
      label: "Items derived from documents",
      value: `${readiness.extractedFacts} auto-extracted and verified facts.`,
      tone: "complete",
    });
    return out;
  }, [readiness]);

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

  const sourceCount = summariseSources(facts).length;
  const declarations = caseData.declarations;
  const pepAny =
    declarations.pepSelf === true ||
    declarations.pepFamily === true ||
    declarations.pepAssociate === true;

  const main = (
    <div className="step-page-in">
      <StepHeader
        step={6}
        title="Review and confirm"
        description="Please review your case summary below. Once you confirm, it will be submitted to MGX Compliance for review."
      />

      {/* Readiness hero with bigcheck + 5-stat grid */}
      <ReadinessHero readiness={readiness} />

      {/* Optional agent summary */}
      {readiness.extractedFacts > 0 && (
        <div
          data-testid="review-agent-summary"
          className="step-item-in mt-5 flex gap-3 rounded-2xl border border-[#bde6eb] bg-gradient-to-b from-[#f8feff] to-surface px-4 py-3.5"
        >
          <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-white">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Onboarding agent summary
            </div>
            <div className="mt-0.5 text-sm text-foreground">
              I extracted <strong>{readiness.extractedFacts}</strong> fact
              {readiness.extractedFacts === 1 ? "" : "s"} across <strong>{sourceCount}</strong>{" "}
              document{sourceCount === 1 ? "" : "s"}. <strong>{readiness.verifiedFacts}</strong>{" "}
              {readiness.verifiedFacts === 1 ? "was" : "were"} used as-is and{" "}
              <strong>{readiness.overriddenFacts}</strong>{" "}
              {readiness.overriddenFacts === 1 ? "was" : "were"} edited by you.
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        <ReviewRow
          icon={<User className="size-4" />}
          title="Investor profile"
          status="complete"
          summary={
            <>
              {caseData.profile.investorName}
              <br />
              <span className="text-muted-foreground">
                {caseData.profile.legalForm} · {caseData.profile.primaryContactEmail}
              </span>
            </>
          }
          evidenceCount={3}
          editStep="profile"
          testId="review-profile"
        />
        <ReviewRow
          icon={<FileText className="size-4" />}
          title="Documents"
          status={readiness.blockingIssues > 0 ? "attention" : "complete"}
          summary={
            <>
              {readiness.documentsReceived} of {readiness.documentsRequired} documents received
              <br />
              <span className="text-muted-foreground">
                {readiness.blockingIssues > 0
                  ? `${readiness.blockingIssues} blocking issue${readiness.blockingIssues === 1 ? "" : "s"}`
                  : "All required documents uploaded"}
              </span>
            </>
          }
          evidenceCount={readiness.documentsReceived}
          editStep="documents"
          testId="review-documents"
        />
        <ReviewRow
          icon={<Users className="size-4" />}
          title={
            caseData.profile.legalForm === "Trust"
              ? "Trustees, settlor and beneficiaries"
              : caseData.profile.legalForm === "Regulated or Listed Entity"
                ? "Authorised signatories"
                : caseData.profile.legalForm === "Limited Partnership"
                  ? "Partners and signatories"
                  : "Ownership and related parties"
          }
          status="complete"
          summary={
            <>
              {caseData.relatedParties[0]?.name ?? "—"} —{" "}
              {caseData.relatedParties[0]?.role ?? "—"} (
              {typeof caseData.relatedParties[0]?.ownershipPct === "number"
                ? `${caseData.relatedParties[0].ownershipPct}%`
                : "—"}
              )
              <br />
              <span className="text-muted-foreground">
                {Math.max(0, caseData.relatedParties.length - 1)} related part
                {Math.max(0, caseData.relatedParties.length - 1) === 1 ? "y" : "ies"}
              </span>
            </>
          }
          evidenceCount={caseData.relatedParties.length}
          editStep="ownership"
          testId="review-ownership"
        />
        <ReviewRow
          icon={<Coins className="size-4" />}
          title={
            caseData.profile.legalForm === "Limited Partnership"
              ? "Source of Funds (via GP authority)"
              : caseData.profile.legalForm === "Regulated or Listed Entity"
                ? "Source of Funds"
                : caseData.profile.legalForm === "Trust"
                  ? "Source of Wealth (settlor) & Source of Funds"
                  : "Source of Wealth & Source of Funds"
          }
          status="complete"
          summary={
            <>
              {caseData.sourceOfWealth?.category ?? "—"}; {caseData.sourceOfFunds?.category ?? "—"}
              <br />
              <span className="text-muted-foreground">
                {caseData.sourceOfWealth?.evidenceDocIds?.length ?? 0} source of wealth ·{" "}
                {caseData.sourceOfFunds?.evidenceDocIds?.length ?? 0} source of funds
              </span>
            </>
          }
          evidenceCount={
            (caseData.sourceOfWealth?.evidenceDocIds?.length ?? 0) +
            (caseData.sourceOfFunds?.evidenceDocIds?.length ?? 0)
          }
          editStep="sow-sof"
          testId="review-sowsof"
        />
        <ReviewRow
          icon={<ShieldCheck className="size-4" />}
          title="Declarations"
          status="complete"
          summary={
            <>
              Tax residency: {declarations.taxResidencyCountry ?? "—"}
              <br />
              <span className="text-muted-foreground">
                US person: {declarations.isUsPerson ? "Yes" : "No"} · PEP: {pepAny ? "Yes" : "No"}
              </span>
            </>
          }
          evidenceCount={3}
          editStep="declarations"
          testId="review-declarations"
        >
          <DeclarationDetails
            taxResidency={declarations.taxResidencyCountry}
            isUsPerson={declarations.isUsPerson}
            pepAny={pepAny}
            taxSource={facts.declarations.taxResidencyCountry}
            usSource={facts.declarations.isUsPerson}
            pepSource={facts.declarations.pepSelf}
          />
        </ReviewRow>
      </div>

      {/* Confirmation */}
      <label className="step-item-in mt-6 flex items-start gap-3 rounded-2xl border bg-surface px-5 py-4">
        <Checkbox
          data-testid="review-confirm"
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(!!v)}
          className="mt-1"
        />
        <div className="text-[13.5px] font-semibold text-primary">
          I have reviewed the information above and confirm that it is complete and accurate.
          <br />
          <span className="mt-0.5 block text-[12px] font-normal text-muted-foreground">
            By submitting this case, I consent to MGX processing this information for compliance
            review.
          </span>
        </div>
      </label>

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "declarations" } })}
        onNext={onSubmit}
        busy={busy}
        disableNext={!confirmed}
        nextLabel="Submit for compliance review"
        nextTestId="review-submit"
      />
    </div>
  );

  const intelligence = (
    <AgentPanel
      step={6}
      phase={feed.phase}
      phaseExplanation="Assembling the final case package for compliance review."
      progressPct={feed.progressPct}
      progressCaption={
        <span>
          {readiness.readinessPercentage === 100
            ? "Case readiness 100% — ready to submit."
            : `Case readiness ${readiness.readinessPercentage}% — finish remaining items to submit.`}
        </span>
      }
      findings={findings}
      activity={feed.activity}
      why="The review step gives you control before anything is submitted. Compliance will see the same provenance and facts you see here."
      extraSections={[
        {
          title: "What happens next",
          body: (
            <p>
              Once submitted, MGX Compliance will review your case. We may reach out if we need
              additional information. You'll receive an update by email and in this portal.
            </p>
          ),
        },
      ]}
    />
  );

  return <StepCanvas main={main} intelligence={intelligence} />;
}

/** "Ready for submission" hero with bigcheck + 5-stat grid that counts up. */
function ReadinessHero({ readiness }: { readiness: ReturnType<typeof computeReadiness> }) {
  const ready = readiness.readinessPercentage >= 100 && readiness.blockingIssues === 0;
  return (
    <section
      data-testid="readiness-hero"
      className="step-item-in mt-6 overflow-hidden rounded-2xl border border-[#bde6eb] bg-gradient-to-br from-[#effeff] via-surface to-surface px-6 py-6"
    >
      <div className="flex items-center gap-5">
        <div className="grid size-[62px] shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-[0_8px_24px_rgba(11,143,160,0.25)]">
          <CheckCircle2 className="size-9" strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-primary">
            {ready ? "Ready for submission" : "Almost ready"}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {ready
              ? "Your case is complete and ready for compliance review."
              : "Finish the remaining items to submit your case."}
          </p>
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <HeroStat
          icon={<FileText className="size-5" />}
          value={`${readiness.documentsReceived} / ${readiness.documentsRequired}`}
          label="Documents received"
          tone="ok"
        />
        <HeroStat
          icon={<Sparkles className="size-5" />}
          value={<CountUp value={readiness.extractedFacts} />}
          label="Facts extracted"
          tone="info"
        />
        <HeroStat
          icon={<CheckCircle2 className="size-5" />}
          value={<CountUp value={readiness.verifiedFacts} />}
          label="Verified automatically"
          tone="ok"
        />
        <HeroStat
          icon={<AlertCircle className="size-5" />}
          value={<CountUp value={readiness.needsReviewItems} />}
          label="Recommended for review"
          tone={readiness.needsReviewItems > 0 ? "warn" : "muted"}
        />
        <HeroStat
          icon={<ShieldCheck className="size-5" />}
          value={<CountUp value={readiness.blockingIssues} />}
          label="Blocking issues"
          tone={readiness.blockingIssues > 0 ? "warn" : "ok"}
        />
      </ul>
    </section>
  );
}

function HeroStat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  tone: "ok" | "info" | "warn" | "muted";
}) {
  return (
    <li className="flex flex-col items-center gap-2 rounded-xl border bg-surface px-3 py-4 text-center">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-full",
          tone === "ok" && "bg-[color:var(--success)]/12 text-[color:var(--success)]",
          tone === "info" && "bg-accent/12 text-accent",
          tone === "warn" && "bg-[color:var(--warn)]/12 text-[color:var(--warn)]",
          tone === "muted" && "bg-secondary text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div className="text-[22px] font-semibold tabular-nums text-primary">{value}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </li>
  );
}

function ReviewRow({
  icon,
  title,
  status,
  summary,
  evidenceCount,
  editStep,
  testId,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: "complete" | "attention" | "pending";
  summary: React.ReactNode;
  evidenceCount?: number;
  editStep: StepKey;
  testId: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      data-testid={testId}
      data-status={status}
      className={cn(
        "step-item-in overflow-hidden rounded-xl border bg-surface",
        status === "attention" && "border-[color:var(--warn)]/30",
      )}
    >
      <div className="grid items-center gap-4 px-4 py-3.5 sm:grid-cols-[auto_1fr_auto_auto_auto]">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full",
              status === "complete" && "bg-accent/10 text-accent",
              status === "attention" && "bg-[color:var(--warn)]/12 text-[color:var(--warn)]",
              status === "pending" && "bg-secondary text-muted-foreground",
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-primary">{title}</h3>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold">
              {status === "complete" && (
                <>
                  <CheckCircle2 className="size-3 text-[color:var(--success)]" strokeWidth={2.5} />
                  <span className="text-[color:var(--success)]">Complete</span>
                </>
              )}
              {status === "attention" && (
                <>
                  <AlertCircle className="size-3 text-[color:var(--warn)]" />
                  <span className="text-[color:var(--warn)]">Needs review</span>
                </>
              )}
              {status === "pending" && (
                <span className="text-muted-foreground">Pending</span>
              )}
            </div>
          </div>
        </div>
        <div className="min-w-0 text-[13px] leading-snug text-foreground/85">{summary}</div>
        {typeof evidenceCount === "number" && (
          <div className="hidden text-right sm:block">
            <div className="inline-flex items-center gap-1 text-[12px] text-foreground/80">
              <FileText className="size-3.5 text-accent" /> {evidenceCount}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Evidence
            </div>
          </div>
        )}
        <Link
          to="/v2/onboarding/$step"
          params={{ step: editStep }}
          data-testid={`${testId}-edit`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:border-accent/50 hover:text-foreground"
        >
          <Pencil className="size-3" /> Edit
        </Link>
        {children ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </button>
        ) : (
          <span />
        )}
      </div>
      {children && open && <div className="border-t bg-background/40 px-4 py-3">{children}</div>}
    </section>
  );
}

function DeclarationDetails({
  taxResidency,
  isUsPerson,
  pepAny,
  taxSource,
  usSource,
  pepSource,
}: {
  taxResidency: string | undefined;
  isUsPerson: boolean | undefined;
  pepAny: boolean;
  taxSource?: PrefillValue<string>;
  usSource?: PrefillValue<boolean>;
  pepSource?: PrefillValue<boolean>;
}) {
  return (
    <dl className="grid gap-2 text-[13px] sm:grid-cols-3">
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tax residency
        </dt>
        <dd className="mt-0.5 text-foreground">{taxResidency ?? "—"}</dd>
        {taxSource && (
          <SourceLine docId={taxSource.sourceDocId} fileName={taxSource.sourceFileName} />
        )}
      </div>
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          US person
        </dt>
        <dd className="mt-0.5 text-foreground">
          {isUsPerson === undefined ? "—" : isUsPerson ? "Yes" : "No"}
        </dd>
        {usSource && <SourceLine docId={usSource.sourceDocId} fileName={usSource.sourceFileName} />}
      </div>
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          PEP
        </dt>
        <dd className="mt-0.5 text-foreground">{pepAny ? "Yes" : "No"}</dd>
        {pepSource && <SourceLine docId={pepSource.sourceDocId} fileName={pepSource.sourceFileName} />}
      </div>
    </dl>
  );
}

function SourceLine({ docId, fileName }: { docId: string; fileName: string }) {
  const { openDocument } = useDocumentViewer();
  return (
    <button
      type="button"
      data-testid="review-source-tag"
      onClick={() => openDocument({ docId, fileName, defaultTab: "pdf" })}
      className="mt-1 inline-flex max-w-full cursor-pointer items-center gap-1 truncate rounded-md border border-accent/30 bg-accent/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/10"
    >
      <Sparkles className="size-2.5 shrink-0" />
      <span className="truncate">From {fileName}</span>
    </button>
  );
}
