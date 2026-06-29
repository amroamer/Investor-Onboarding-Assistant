import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Info,
  User,
  Briefcase,
  PieChart,
  Globe,
  Pencil,
  Sparkles,
  FileText,
} from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveOwnership } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import { deriveFactsFromUploads, summariseSources } from "@/lib/stepper/derive";
import { AgentGapCallout, StepCanvas, AgentPanel, useAgentFeed } from "./intel";
import type { StepperCase, StepperLegalForm, RelatedParty } from "@/lib/stepper/types";

interface OwnershipFormConfig {
  /** Page subheading shown under the StepHeader. */
  description: string;
  /** Info-strip body. `null` hides the strip. */
  infoStrip: string | null;
  /** Role string used for the first (primary) row. */
  primaryRole: string;
  /** Whether the primary row's ownership defaults to 100%. */
  primary100Pct: boolean;
  /** Default role assigned to a freshly-added party. */
  addRole: string;
  /** Heading + helper text for the "Add related party" affordance. */
  addTitle: string;
  addHelper: string;
  /** Whether the per-row "Ownership %" field is meaningful for this form. */
  showOwnershipPct: boolean;
  /** "Why we need this information" body in the agent panel. */
  whyCopy: string;
}

function ownershipConfig(form: StepperLegalForm | undefined): OwnershipFormConfig {
  switch (form) {
    case "Individual":
      return {
        description:
          "Confirm your details. As an individual investor, you are the investing party — ownership is set to 100% unless you add a representative.",
        infoStrip:
          "As this is an individual investor case, ownership is set to 100%. Add a representative or related party below if applicable.",
        primaryRole: "Investor (self)",
        primary100Pct: true,
        addRole: "Power of attorney",
        addTitle: "Add related party",
        addHelper:
          "Use this if a power of attorney holder, representative or other controller is involved.",
        showOwnershipPct: true,
        whyCopy:
          "Compliance must screen the individual against sanctions and PEP lists, and confirm the photo ID matches the person opening the account.",
      };
    case "Regulated or Listed Entity":
      return {
        description:
          "List the authorised signatories acting on this subscription. No ownership disclosure is required because the entity is regulated or publicly listed.",
        infoStrip: null,
        primaryRole: "Authorised signatory",
        primary100Pct: false,
        addRole: "Authorised signatory",
        addTitle: "Add authorised signatory",
        addHelper:
          "Add every person authorised to sign for this subscription. The agent uses these names to screen them against sanctions and PEP lists.",
        showOwnershipPct: false,
        whyCopy:
          "Regulated and listed entities are not subject to UBO disclosure, but the people signing the subscription must be screened.",
      };
    case "Trust":
      return {
        description:
          "List the trustees, the settlor(s), any protector(s) and each named beneficiary ≥ 25%. We pre-filled what we could from the trust deed and the schedule of parties.",
        infoStrip: null,
        primaryRole: "Trustee",
        primary100Pct: false,
        addRole: "Settlor",
        addTitle: "Add trust party",
        addHelper:
          "Add trustees, the settlor(s), protector(s) and named beneficiaries ≥ 25%. Use Authority to act for trustees acting on the subscription.",
        showOwnershipPct: false,
        whyCopy:
          "Compliance must screen every controlling party of a trust — settlor, trustees, protectors and named beneficiaries — against sanctions and PEP lists.",
      };
    case "Corporation or Private Trust Corporation":
      return {
        description:
          "List every UBO ≥ 25%, each director and each authorised signatory. We pre-filled what we could from your registers.",
        infoStrip: null,
        primaryRole: "Beneficial owner",
        primary100Pct: false,
        addRole: "Director",
        addTitle: "Add UBO, director or signatory",
        addHelper:
          "Add every ≥ 25% UBO, every current director and every authorised signatory acting on this subscription.",
        showOwnershipPct: true,
        whyCopy:
          "Beneficial ownership ≥ 25% must be identified by regulation, alongside everyone authorised to act on the entity's behalf.",
      };
    case "Limited Partnership":
      return {
        description:
          "List the General Partner, the Limited Partners with their commitment %, and any beneficial owner ≥ 25% or authorised signatory.",
        infoStrip: null,
        primaryRole: "General Partner",
        primary100Pct: false,
        addRole: "Limited Partner",
        addTitle: "Add partner or signatory",
        addHelper:
          "Add the General Partner, each Limited Partner with their commitment %, and every beneficial owner ≥ 25% or authorised signatory.",
        showOwnershipPct: true,
        whyCopy:
          "Compliance must identify the GP, all material Limited Partners and every beneficial owner ≥ 25% of the partnership.",
      };
    default:
      return {
        description:
          "Confirm the people and entities behind the investing party.",
        infoStrip: null,
        primaryRole: "Beneficial owner",
        primary100Pct: false,
        addRole: "Director",
        addTitle: "Add related party",
        addHelper: "Add any other person or entity with ownership or control.",
        showOwnershipPct: true,
        whyCopy:
          "Compliance must understand who controls the investing party so it can screen each individual against sanctions and PEP lists.",
      };
  }
}

export function OwnershipStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();
  const legalForm = caseData.profile?.legalForm;
  const isIndividual = legalForm === "Individual";
  const cfg = ownershipConfig(legalForm);

  const facts = useMemo(() => deriveFactsFromUploads(caseData), [caseData]);
  const feed = useAgentFeed({ caseData, stepKey: "ownership" });

  const initial: RelatedParty[] = useMemo(() => {
    if (caseData.relatedParties.length > 0) return caseData.relatedParties;
    if (isIndividual) {
      return [
        {
          id: `rp_${Math.random().toString(36).slice(2, 10)}`,
          name: facts.identity.name?.value ?? caseData.profile?.investorName ?? "",
          role: cfg.primaryRole,
          partyType: "Individual",
          ownershipPct: cfg.primary100Pct ? 100 : undefined,
          nationality: facts.identity.nationality?.value,
          dob: facts.identity.dob?.value,
        },
      ];
    }
    if (facts.entityHolders) return facts.entityHolders.value;
    return [];
  }, [
    caseData.relatedParties,
    caseData.profile?.investorName,
    facts,
    isIndividual,
    cfg.primaryRole,
    cfg.primary100Pct,
  ]);

  const [parties, setParties] = useState<RelatedParty[]>(initial);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addParty = () => {
    const newId = `rp_${Math.random().toString(36).slice(2, 10)}`;
    setParties((p) => [
      ...p,
      {
        id: newId,
        name: "",
        role: cfg.addRole,
        partyType: "Individual",
      },
    ]);
    setEditingPartyId(newId);
  };

  const removeParty = (id: string) => setParties((p) => p.filter((r) => r.id !== id));

  const updateParty = (id: string, patch: Partial<RelatedParty>) =>
    setParties((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const canContinue =
    parties.length > 0 &&
    parties.every((r) => r.name.trim().length > 0 && r.role.trim().length > 0);

  const onNext = async () => {
    setBusy(true);
    try {
      const saved = await saveOwnership({
        data: { caseId: caseData.caseId, relatedParties: parties },
      });
      setCase(saved);
      navigate({ to: "/v2/onboarding/$step", params: { step: "sow-sof" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Compact source-doc list for the agent banner.
  const sourceBadge = useMemo(() => {
    if (isIndividual) {
      const pv = facts.identity.name ?? facts.identity.nationality ?? facts.identity.dob;
      return pv ? { docId: pv.sourceDocId, fileName: pv.sourceFileName } : null;
    }
    const all = summariseSources(facts);
    const reg = all.find((s) => facts.entityHolders?.sourceDocId === s.docId);
    return reg ?? null;
  }, [facts, isIndividual]);

  const findings = useMemo(() => {
    const out = [];
    if (parties[0]?.name) {
      out.push({
        label: "Owner identified",
        value: parties[0].name,
        tone: "complete" as const,
      });
    }
    if (isIndividual) {
      out.push({
        label: "Ownership set to 100%",
        value: "As an individual investor, ownership is set to 100%.",
        tone: "complete" as const,
      });
    } else if (legalForm === "Regulated or Listed Entity") {
      out.push({
        label: "No UBO disclosure required",
        value: "Regulated and listed entities do not need to disclose ownership.",
        tone: "complete" as const,
      });
    }
    if (parties[0]?.nationality) {
      out.push({
        label: "Nationality extracted from photo ID",
        value: parties[0].nationality,
        tone: "complete" as const,
      });
    }
    out.push({
      label: parties.length > 1 ? `${parties.length - 1} related party listed` : "No related parties added",
      value: "You haven't added any related parties yet.",
      tone: "info" as const,
    });
    out.push({
      label: "Needs user confirmation",
      value: "Please review and confirm the information before continuing.",
      tone: "warning" as const,
    });
    return out;
  }, [parties, isIndividual]);

  const main = (
    <div className="step-page-in">
      <StepHeader
        step={3}
        title="Ownership and related parties"
        description={cfg.description}
      />

      {/* Agent banner with the extracted source doc chip on the right */}
      {sourceBadge ? (
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
              {isIndividual
                ? "We pre-filled details from your government-issued photo ID."
                : "We pre-filled directors and shareholders from the register you uploaded."}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Please review and adjust anything that's incorrect.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-[12px] text-foreground/80 transition-colors hover:border-accent/50 hover:text-foreground"
            data-testid={`agent-source-${sourceBadge.docId}`}
          >
            <FileText className="size-3.5 text-accent" />
            <span className="max-w-[200px] truncate">{sourceBadge.fileName}</span>
          </button>
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
              No identity documents read yet — the fields below are blank.
            </h3>
            <p className="text-[12px]">
              Upload a passport on the Documents step and I'll fill this in automatically.
            </p>
          </div>
        </div>
      )}

      {/* Party cards */}
      <div className="mt-6 space-y-4" data-testid="ownership-rows">
        {parties.map((p, idx) => (
          <PartyCard
            key={p.id}
            idx={idx}
            party={p}
            isPrimary={idx === 0}
            isIndividual={isIndividual}
            showOwnershipPct={cfg.showOwnershipPct}
            primaryBadge={
              legalForm === "Limited Partnership"
                ? "General Partner"
                : legalForm === "Trust"
                  ? "Trustee"
                  : legalForm === "Regulated or Listed Entity"
                    ? "Authorised signatory"
                    : "Primary owner"
            }
            facts={facts}
            editing={editingPartyId === p.id}
            onEdit={() => setEditingPartyId(p.id)}
            onDone={() => setEditingPartyId(null)}
            onChange={(patch) => updateParty(p.id, patch)}
            onRemove={() => removeParty(p.id)}
            canRemove={parties.length > 1}
          />
        ))}
      </div>

      {cfg.infoStrip && (
        <div className="step-item-in mt-4 flex items-start gap-3 rounded-xl border border-[#caeaf0] bg-[#fbfeff] px-4 py-3.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
            <Info className="size-4" />
          </div>
          <div className="text-sm leading-relaxed">
            <div className="font-semibold text-primary">{cfg.infoStrip}</div>
          </div>
        </div>
      )}

      {/* Dashed-border Add related party card */}
      <button
        type="button"
        data-testid="ownership-add"
        onClick={addParty}
        className="step-item-in mt-4 flex w-full items-center gap-4 rounded-2xl border-2 border-dashed bg-surface px-5 py-4 text-left transition-colors hover:border-accent/60 hover:bg-accent/[0.03]"
      >
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-accent">
          <Plus className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-primary">{cfg.addTitle}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{cfg.addHelper}</p>
        </div>
      </button>

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "documents" } })}
        onNext={onNext}
        busy={busy}
        disableNext={!canContinue}
        nextTestId="ownership-next"
      />
    </div>
  );

  const intelligence = (
    <AgentPanel
      step={3}
      phase={feed.phase}
      phaseExplanation="Preparing ownership details from the identity documents you uploaded."
      progressPct={feed.progressPct}
      findings={findings}
      activity={feed.activity}
      why={cfg.whyCopy}
      extraSections={[
        {
          title: "Why we need this information",
          body: (
            <p>
              Ownership and control information helps us understand who ultimately owns or controls
              the investing party so we can comply with regulatory requirements and ensure the
              integrity of our platform.
            </p>
          ),
        },
      ]}
    />
  );

  return <StepCanvas main={main} intelligence={intelligence} />;
}

interface PartyCardProps {
  idx: number;
  party: RelatedParty;
  isPrimary: boolean;
  isIndividual: boolean;
  /** When false, the Ownership % data box is hidden (e.g. Regulated / Trust). */
  showOwnershipPct: boolean;
  /** Badge label for the primary row (e.g. "Primary owner", "General Partner"). */
  primaryBadge: string;
  facts: ReturnType<typeof deriveFactsFromUploads>;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onChange: (patch: Partial<RelatedParty>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function PartyCard({
  idx,
  party,
  isPrimary,
  isIndividual,
  showOwnershipPct,
  primaryBadge,
  facts,
  editing,
  onEdit,
  onDone,
  onChange,
  onRemove,
  canRemove,
}: PartyCardProps) {
  return (
    <section
      data-testid={`ownership-row-${idx}`}
      className="step-item-in overflow-hidden rounded-2xl border bg-surface"
    >
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Party {idx + 1}
        </h3>
        <div className="flex items-center gap-2">
          {isPrimary && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              {primaryBadge}
            </span>
          )}
          {!isPrimary && canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove party"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-[color:var(--attention)]"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={editing ? onDone : onEdit}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <Pencil className="size-3" />
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </header>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <DataBox
          label="Full name"
          icon={<User className="size-4" />}
          value={party.name}
          editing={editing}
          onChange={(v) => onChange({ name: v })}
          evidenceLabel={
            isPrimary && facts.identity.name ? `From ${facts.identity.name.sourceFileName}` : null
          }
          inputTestId={`ownership-name-${idx}`}
        />
        <DataBox
          label="Role"
          icon={<Briefcase className="size-4" />}
          value={party.role}
          editing={editing}
          onChange={(v) => onChange({ role: v })}
          evidenceLabel={isPrimary && facts.identity.name ? "From Photo ID" : null}
          inputTestId={`ownership-role-${idx}`}
        />
        {showOwnershipPct && (
          <DataBox
            label="Ownership %"
            icon={<PieChart className="size-4" />}
            value={typeof party.ownershipPct === "number" ? `${party.ownershipPct}%` : ""}
            editing={editing}
            onChange={(v) => {
              const stripped = v.replace(/[^0-9.]/g, "");
              onChange({ ownershipPct: stripped === "" ? undefined : Number(stripped) });
            }}
            evidenceLabel={isPrimary && isIndividual ? "From Photo ID" : null}
            inputTestId={`ownership-pct-${idx}`}
          />
        )}
        <DataBox
          label="Nationality / Country"
          icon={<Globe className="size-4" />}
          value={party.nationality ?? ""}
          editing={editing}
          onChange={(v) => onChange({ nationality: v })}
          evidenceLabel={
            isPrimary && facts.identity.nationality
              ? `From ${facts.identity.nationality.sourceFileName}`
              : null
          }
          inputTestId={`ownership-nationality-${idx}`}
          gapMessage={
            isPrimary && isIndividual && !facts.identity.nationality && !party.nationality
              ? "I couldn't read your nationality from the documents — please add it."
              : undefined
          }
        />
      </div>
    </section>
  );
}

function DataBox({
  label,
  icon,
  value,
  editing,
  onChange,
  evidenceLabel,
  inputTestId,
  gapMessage,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  evidenceLabel: string | null;
  inputTestId: string;
  gapMessage?: string;
}) {
  const displayValue = value || "—";
  return (
    <div className="rounded-xl border bg-background p-3.5">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-foreground/70">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <Label
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            htmlFor={inputTestId}
          >
            {label}
          </Label>
          {editing ? (
            <Input
              id={inputTestId}
              data-testid={inputTestId}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="mt-1 h-9"
            />
          ) : (
            <div
              data-testid={`${inputTestId}-readonly`}
              className={cn(
                "mt-1 text-[15px] font-semibold text-primary",
                !value && "text-muted-foreground",
              )}
            >
              {displayValue}
            </div>
          )}
          {evidenceLabel && (
            <div
              data-testid={`${inputTestId}-chip-source`}
              className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-md border border-accent/30 bg-accent/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-accent"
            >
              <Sparkles className="size-2.5 shrink-0" />
              <span className="truncate">{evidenceLabel}</span>
            </div>
          )}
          {gapMessage && <AgentGapCallout message={gapMessage} />}
        </div>
      </div>
    </div>
  );
}
