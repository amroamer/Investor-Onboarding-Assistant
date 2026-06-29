import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  Filter,
  FolderOpen,
  GitBranch,
  Image as ImageIcon,
  ListChecks,
  MessageSquare,
  Network,
  Plus,
  ScrollText,
  Search,
  Send,
  Sparkles,
  TimerReset,
  Users,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { StepCanvas } from "@/components/stepper/intel";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";
import {
  requiresSourceOfWealth,
  requiresSourceOfFunds,
  type StepperCase,
  type StepperAuditEvent,
} from "@/lib/stepper/types";
import { requirementsFor } from "@/lib/stepper/requirements";
import { computeReadiness, type CaseReadiness } from "@/lib/stepper/readiness";
import { deriveFactsFromUploads, type DerivedFacts, type PrefillValue } from "@/lib/stepper/derive";
import type {
  StepperComplianceState,
  StepperNameToScreen,
  StepperRfi,
  StepperScreeningHit,
  StepperRedFlag,
} from "@/lib/stepper/compliance";
import {
  getStepperComplianceState,
  syncStepperScreeningList,
  runStepperScreening,
  addStepperRfiDraft,
  sendStepperRfis,
  markStepperRfiResolved,
  recordReviewerDecision,
  recordFlagAction,
} from "@/server/stepper/compliance";
import { useStepperCase } from "@/lib/stepper/store";
import {
  ComplianceAssistantPanel,
  type AssistantTab,
  type AssistantReason,
  type AssistantTimelineItem,
} from "./ComplianceAssistantPanel";
import { CaseHero } from "./CaseHero";
import { DecisionBar } from "./DecisionBar";
import { EvidenceDrawer, type EvidenceSource } from "./EvidenceDrawer";
import { TabNextActionCard } from "./TabNextAction";
import { StatusChip, type StatusTone } from "./primitives/StatusChip";
import { MetricCard } from "./primitives/MetricCard";
import { WhatHowWhy } from "./primitives/WhatHowWhy";

const stateQueryKey = (caseId: string) => ["stepper-compliance-state", caseId] as const;

export function StepperComplianceView({ caseData }: { caseData: StepperCase }) {
  const queryClient = useQueryClient();
  const stepperCtx = useStepperCase(caseData.caseId);
  const [tab, setTab] = useState<AssistantTab>("overview");
  const [evidence, setEvidence] = useState<EvidenceSource | null>(null);
  // Shared cross-tab state: prefilled draft text passed from a red flag's
  // "Generate request" action over to the Requests tab composer.
  const [prefilledDraft, setPrefilledDraft] = useState<string | null>(null);

  const { data: state } = useQuery({
    queryKey: stateQueryKey(caseData.caseId),
    queryFn: () => getStepperComplianceState({ data: { caseId: caseData.caseId } }),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (!state) {
    return (
      <div className="rounded-2xl border bg-surface p-8 text-center text-sm text-muted-foreground">
        Loading compliance state…
      </div>
    );
  }

  const splice = (updated: StepperComplianceState) => {
    queryClient.setQueryData<StepperComplianceState>(stateQueryKey(caseData.caseId), updated);
  };

  const openFlagCount = state.redFlags.length;
  const screeningStatus = computeScreeningStatus(state.namesToScreen);

  // "Generate request" jumps to the Requests tab with a prefilled draft.
  const generateRequestFromFlag = (flag: StepperRedFlag) => {
    const text = buildRfiCopyFor(flag);
    setPrefilledDraft(text);
    setTab("rfi");
    toast(`Draft prepared for ${flag.rule}`, {
      description: "Review and send the request from the Requests tab.",
    });
  };

  // Persist a per-flag reviewer action (Mark exception / Resolve) as a real
  // audit event so the action survives reload and shows in the Audit tab.
  const persistFlagAction = async (
    flag: StepperRedFlag,
    action: "exception" | "resolved",
  ) => {
    const updated = (await recordFlagAction({
      data: {
        caseId: caseData.caseId,
        flagRule: flag.rule,
        flagDescription: flag.description,
        action,
      },
    })) as StepperCase;
    stepperCtx.setCase(updated);
  };

  // "Generate consolidated request" composes a single investor-facing draft
  // covering every open flag and jumps to Requests with it prefilled.
  const generateConsolidatedRequest = () => {
    if (state.redFlags.length === 0) {
      setTab("rfi");
      return;
    }
    const text = buildConsolidatedRfiCopy(state.redFlags);
    setPrefilledDraft(text);
    setTab("rfi");
    toast(`Consolidated draft prepared (${state.redFlags.length} items)`, {
      description: "Review and send from the Requests tab.",
    });
  };

  const assistantContext = buildAssistantContext({
    tab,
    state,
    caseData,
    screeningStatus,
    openFlagCount,
    onRequestInfo: () => setTab("rfi"),
    onSync: async () => {
      const updated = (await syncStepperScreeningList({
        data: { caseId: caseData.caseId },
      })) as StepperComplianceState;
      splice(updated);
    },
    onRun: async () => {
      const updated = (await runStepperScreening({
        data: { caseId: caseData.caseId },
      })) as StepperComplianceState;
      splice(updated);
    },
  });

  const main = (
    <div className="step-page-in space-y-5">
      <CaseHero
        caseData={caseData}
        state={state}
        openFlagCount={openFlagCount}
        screeningStatus={screeningStatus}
      />

      <TabBar tab={tab} setTab={setTab} state={state} caseData={caseData} />

      {/* Inline next-best-action card — visible on every tab, driven by the
          same logic the right-rail assistant uses. */}
      <InlineNextAction
        tab={tab}
        state={state}
        screeningStatus={screeningStatus}
        openFlagCount={openFlagCount}
        onRunScreening={async () => {
          const updated = (await runStepperScreening({
            data: { caseId: caseData.caseId },
          })) as StepperComplianceState;
          splice(updated);
        }}
        onGenerateConsolidatedRequest={generateConsolidatedRequest}
        onGoToFlags={() => setTab("flags")}
        onGoToRequests={() => setTab("rfi")}
        onGoToScreening={() => setTab("names")}
        onGoToDocuments={() => setTab("documents")}
      />

      <div
        key={tab}
        className="tab-swap-in space-y-5"
        role="tabpanel"
        id={`compliance-tabpanel-${tab}`}
        aria-labelledby={`compliance-tab-${tab}`}
      >
        {tab === "overview" && (
          <OverviewTab
            caseData={caseData}
            state={state}
            screeningStatus={screeningStatus}
            onOpenEvidence={setEvidence}
            onGoToDocuments={() => setTab("documents")}
          />
        )}
        {tab === "documents" && (
          <DocumentsTab caseData={caseData} onOpenEvidence={setEvidence} />
        )}
        {tab === "flags" && (
          <FlagsTab
            state={state}
            onGenerateRequest={generateRequestFromFlag}
            onGenerateConsolidated={generateConsolidatedRequest}
            onOpenEvidence={setEvidence}
            onPersistFlagAction={persistFlagAction}
          />
        )}
        {tab === "names" && (
          <NamesTab
            caseData={caseData}
            state={state}
            splice={splice}
          />
        )}
        {tab === "rfi" && (
          <RfiTab
            caseData={caseData}
            state={state}
            splice={splice}
            prefilledDraft={prefilledDraft}
            consumePrefill={() => setPrefilledDraft(null)}
          />
        )}
        {tab === "audit" && <AuditTab caseData={caseData} state={state} />}
      </div>

      <DecisionBar
        state={state}
        audit={caseData.audit}
        onRequestInfo={() => setTab("rfi")}
        onApprove={async () => {
          const updated = (await recordReviewerDecision({
            data: { caseId: caseData.caseId, decision: "approved" },
          })) as StepperCase;
          stepperCtx.setCase(updated);
          toast.success(`${caseData.profile?.investorName ?? caseData.caseId} approved`, {
            description: "Audit event recorded.",
          });
        }}
        onEscalate={async () => {
          const updated = (await recordReviewerDecision({
            data: { caseId: caseData.caseId, decision: "escalated" },
          })) as StepperCase;
          stepperCtx.setCase(updated);
          toast(`${caseData.profile?.investorName ?? caseData.caseId} escalated`, {
            description: "Audit event recorded.",
          });
        }}
        onReject={async () => {
          const updated = (await recordReviewerDecision({
            data: { caseId: caseData.caseId, decision: "rejected" },
          })) as StepperCase;
          stepperCtx.setCase(updated);
          toast.error(`${caseData.profile?.investorName ?? caseData.caseId} rejected`, {
            description: "Audit event recorded.",
          });
        }}
      />
    </div>
  );

  return (
    <>
      <StepCanvas
        intelligenceWidth={360}
        main={main}
        intelligence={<ComplianceAssistantPanel {...assistantContext} />}
      />
      <EvidenceDrawer source={evidence} onClose={() => setEvidence(null)} />
    </>
  );
}

/* ─── Tab bar ──────────────────────────────────────────────────────────── */

const TAB_ORDER: AssistantTab[] = [
  "overview",
  "documents",
  "flags",
  "names",
  "rfi",
  "audit",
];

function TabBar({
  tab,
  setTab,
  state,
  caseData,
}: {
  tab: AssistantTab;
  setTab: (t: AssistantTab) => void;
  state: StepperComplianceState;
  caseData: StepperCase;
}) {
  const flagsBadge = state.redFlags.length;
  const sentRfis = state.furtherInfoRequests.filter((r) => r.status !== "resolved").length;
  const docCount = caseData.uploadedDocuments.length;

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    const i = TAB_ORDER.indexOf(tab);
    let next = i;
    if (e.key === "ArrowLeft") next = i === 0 ? TAB_ORDER.length - 1 : i - 1;
    else if (e.key === "ArrowRight") next = i === TAB_ORDER.length - 1 ? 0 : i + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TAB_ORDER.length - 1;
    setTab(TAB_ORDER[next]);
    // Move focus to the newly active tab button so screen readers + keyboard
    // users land on the right element.
    requestAnimationFrame(() => {
      document.getElementById(`compliance-tab-${TAB_ORDER[next]}`)?.focus();
    });
  };

  return (
    <div
      className="step-item-in flex flex-wrap gap-1 rounded-xl border bg-surface p-1 shadow-[0_4px_12px_rgba(12,20,48,0.04)]"
      role="tablist"
      aria-label="Compliance workspace sections"
      onKeyDown={onKey}
    >
      <TabButton
        id="compliance-tab-overview"
        active={tab === "overview"}
        onClick={() => setTab("overview")}
        icon={<FileText className="size-3.5" />}
        label="Overview"
        controls="compliance-tabpanel-overview"
      />
      <TabButton
        id="compliance-tab-documents"
        active={tab === "documents"}
        onClick={() => setTab("documents")}
        icon={<FolderOpen className="size-3.5" />}
        label="Documents"
        badge={docCount > 0 ? { tone: "info", label: `${docCount}` } : undefined}
        controls="compliance-tabpanel-documents"
      />
      <TabButton
        id="compliance-tab-flags"
        active={tab === "flags"}
        onClick={() => setTab("flags")}
        icon={<AlertTriangle className="size-3.5" />}
        label="Risk & flags"
        badge={flagsBadge > 0 ? { tone: "warn", label: `${flagsBadge}` } : undefined}
        controls="compliance-tabpanel-flags"
      />
      <TabButton
        id="compliance-tab-names"
        active={tab === "names"}
        onClick={() => setTab("names")}
        icon={<Users className="size-3.5" />}
        label="Screening"
        controls="compliance-tabpanel-names"
      />
      <TabButton
        id="compliance-tab-rfi"
        active={tab === "rfi"}
        onClick={() => setTab("rfi")}
        icon={<ListChecks className="size-3.5" />}
        label="Requests"
        badge={sentRfis > 0 ? { tone: "info", label: `${sentRfis}` } : undefined}
        controls="compliance-tabpanel-rfi"
      />
      <TabButton
        id="compliance-tab-audit"
        active={tab === "audit"}
        onClick={() => setTab("audit")}
        icon={<ScrollText className="size-3.5" />}
        label="Audit trail"
        controls="compliance-tabpanel-audit"
      />
    </div>
  );
}

function TabButton({
  id,
  active,
  onClick,
  icon,
  label,
  badge,
  controls,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: { tone: StatusTone; label: string };
  controls: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      // Roving tabindex: only the active tab is in the tab sequence; the rest
      // are reachable via arrow keys.
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors min-w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(5,0,68,0.15)]"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <StatusChip size="xs" tone={badge.tone} dot={false} className="ml-1">
          {badge.label}
        </StatusChip>
      )}
    </button>
  );
}

/* ─── Inline next-best-action ──────────────────────────────────────────── */

function InlineNextAction({
  tab,
  state,
  screeningStatus,
  openFlagCount,
  onRunScreening,
  onGenerateConsolidatedRequest,
  onGoToFlags,
  onGoToRequests,
  onGoToScreening,
  onGoToDocuments,
}: {
  tab: AssistantTab;
  state: StepperComplianceState;
  screeningStatus: ReturnType<typeof computeScreeningStatus>;
  openFlagCount: number;
  onRunScreening: () => Promise<void>;
  onGenerateConsolidatedRequest: () => void;
  onGoToFlags: () => void;
  onGoToRequests: () => void;
  onGoToScreening: () => void;
  onGoToDocuments: () => void;
}) {
  // Decide the next-best-action per tab, honoring the same priorities the
  // assistant panel uses (FAIL > screening > flags > approve).
  const hasFail = state.suggestedOutcome === "FAIL";
  const screeningNotRun = screeningStatus === "Not run" || screeningStatus === "Mixed";

  if (hasFail) {
    return (
      <TabNextActionCard
        tone="danger"
        headline="Sanctions or critical hit — escalate before doing anything else."
        caption={`Risk score ${state.riskScore} (${state.riskBand}). Final decision must be made by MLRO.`}
        cta={{ label: "Open flags", onClick: onGoToFlags }}
      />
    );
  }

  if (tab === "overview") {
    if (screeningNotRun) {
      return (
        <TabNextActionCard
          tone="warn"
          headline="Run screening before final approval."
          caption={`${state.namesToScreen.length} name${state.namesToScreen.length === 1 ? "" : "s"} ready · powered by OpenSanctions.`}
          cta={{ label: "Run screening", onClick: () => void onRunScreening() }}
          secondary={{ label: "Open screening tab", onClick: onGoToScreening }}
        />
      );
    }
    if (openFlagCount > 0) {
      return (
        <TabNextActionCard
          tone="warn"
          headline={`Review the ${openFlagCount} open flag${openFlagCount === 1 ? "" : "s"} on the Risk & flags tab.`}
          caption="Then generate a consolidated request covering every evidence gap."
          cta={{ label: "Open flags", onClick: onGoToFlags }}
        />
      );
    }
    return (
      <TabNextActionCard
        tone="success"
        headline="Case looks clean. Confirm screening + flags, then approve."
        caption="No blocking signals detected."
      />
    );
  }

  if (tab === "documents") {
    const attentionCount = state.redFlags.filter(
      (f) => f.rule === "R-DOC-001" || f.rule === "R-DOC-002",
    ).length;
    if (attentionCount > 0) {
      return (
        <TabNextActionCard
          tone="warn"
          headline={`Review evidence quality for ${attentionCount} attention item${attentionCount === 1 ? "" : "s"}.`}
          caption="Open Preview or Extraction on the cards below to inspect."
          cta={{ label: "Open flags", onClick: onGoToFlags }}
        />
      );
    }
    return (
      <TabNextActionCard
        tone="accent"
        headline="Spot-check the highest-confidence evidence before approving."
        caption="Every other tab cites these documents."
      />
    );
  }

  if (tab === "flags") {
    if (openFlagCount === 0) {
      return (
        <TabNextActionCard
          tone="success"
          headline="No open flags — there's nothing to remediate."
          caption="Move on to screening or approve when ready."
        />
      );
    }
    return (
      <TabNextActionCard
        tone="warn"
        headline={`Generate one consolidated request covering all ${openFlagCount} open flag${openFlagCount === 1 ? "" : "s"}.`}
        caption="Sends a single investor-facing message instead of N separate emails."
        cta={{ label: "Generate consolidated request", onClick: onGenerateConsolidatedRequest }}
        secondary={{ label: "View Requests tab", onClick: onGoToRequests }}
      />
    );
  }

  if (tab === "names") {
    if (screeningNotRun) {
      return (
        <TabNextActionCard
          tone="warn"
          headline={`Run screening for ${state.namesToScreen.length} name${state.namesToScreen.length === 1 ? "" : "s"}.`}
          caption="Sanctions, PEP and adverse media checks via OpenSanctions."
          cta={{ label: "Run screening", onClick: () => void onRunScreening() }}
        />
      );
    }
    return (
      <TabNextActionCard
        tone="success"
        headline="Screening complete — no blocking hits."
        caption={`Last run · ${state.namesToScreen.length} subject${state.namesToScreen.length === 1 ? "" : "s"} screened.`}
      />
    );
  }

  if (tab === "rfi") {
    const drafts = state.furtherInfoRequests.filter((r) => r.status === "draft").length;
    if (drafts > 0) {
      return (
        <TabNextActionCard
          tone="accent"
          headline={`Send the ${drafts === 1 ? "AI-generated draft" : `${drafts} drafts`} to the investor.`}
          caption="Drafts below can be edited before sending."
        />
      );
    }
    if (openFlagCount > 0) {
      return (
        <TabNextActionCard
          tone="warn"
          headline="Generate a consolidated draft from your open flags."
          caption={`${openFlagCount} flag${openFlagCount === 1 ? "" : "s"} can roll into one investor-facing message.`}
          cta={{ label: "Generate draft", onClick: onGenerateConsolidatedRequest }}
        />
      );
    }
    return (
      <TabNextActionCard
        tone="success"
        headline="No open issues — nothing to request."
        caption="The requests history below shows resolved threads."
      />
    );
  }

  if (tab === "audit") {
    return (
      <TabNextActionCard
        tone="accent"
        headline="Export the audit trail if you're closing the case."
        caption="The export contains every system, investor and reviewer action."
        secondary={{ label: "Review documents", onClick: onGoToDocuments }}
      />
    );
  }

  return null;
}

/* ─── Overview tab ─────────────────────────────────────────────────────── */

function OverviewTab({
  caseData,
  state,
  screeningStatus,
  onOpenEvidence,
  onGoToDocuments,
}: {
  caseData: StepperCase;
  state: StepperComplianceState;
  screeningStatus: ReturnType<typeof computeScreeningStatus>;
  onOpenEvidence: (s: EvidenceSource) => void;
  onGoToDocuments: () => void;
}) {
  // Single source of truth for readiness numbers — same one the investor saw
  // on the Review step. Avoids drift between the two surfaces.
  const readiness = useMemo<CaseReadiness>(() => computeReadiness(caseData), [caseData]);
  const facts = useMemo<DerivedFacts>(() => deriveFactsFromUploads(caseData), [caseData]);

  const flagsByTone = {
    high: state.redFlags.filter((f) => f.severity === "High").length,
    medium: state.redFlags.filter((f) => f.severity === "Medium").length,
    low: state.redFlags.filter((f) => f.severity === "Low").length,
  };

  const docsComplete =
    readiness.documentsRequired > 0 &&
    readiness.documentsValidated === readiness.documentsRequired;

  return (
    <div className="space-y-5">
      {/* Case readiness metrics — A2 + B5 */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Documents"
          value={`${readiness.documentsReceived}/${readiness.documentsRequired || "—"}`}
          tone={docsComplete ? "success" : readiness.documentsReceived === 0 ? "neutral" : "warn"}
          icon={<FileText className="size-3" />}
          hint={
            readiness.documentsValidated < readiness.documentsReceived
              ? `${readiness.documentsReceived - readiness.documentsValidated} need attention`
              : docsComplete
                ? "All validated"
                : `${readiness.documentsRequired - readiness.documentsReceived} outstanding`
          }
        />
        <MetricCard
          label="Cross-doc checks"
          count={caseData.crossDocFlags.length}
          tone={caseData.crossDocFlags.length === 0 ? "success" : "warn"}
          icon={<GitBranch className="size-3" />}
          hint={caseData.crossDocFlags.length === 0 ? "Consistent" : "Mismatch detected"}
        />
        <MetricCard
          label="Screening"
          value={screeningStatus}
          tone={
            screeningStatus === "Clear"
              ? "success"
              : screeningStatus === "Hits found" || screeningStatus === "Mixed"
                ? "danger"
                : "neutral"
          }
          icon={<Users className="size-3" />}
        />
        <MetricCard
          label="Red flags"
          count={state.redFlags.length}
          tone={state.redFlags.length === 0 ? "success" : "warn"}
          icon={<AlertTriangle className="size-3" />}
          chip={
            flagsByTone.high > 0
              ? { tone: "danger", label: `${flagsByTone.high} high` }
              : flagsByTone.medium > 0
                ? { tone: "warn", label: `${flagsByTone.medium} medium` }
                : undefined
          }
        />
        <MetricCard
          label="Investor edits"
          count={readiness.overriddenFacts}
          tone={readiness.overriddenFacts > 0 ? "warn" : "neutral"}
          icon={<Sparkles className="size-3" />}
          hint={
            readiness.overriddenFacts > 0
              ? `of ${readiness.extractedFacts} extracted facts`
              : "matched extracted values"
          }
        />
        <MetricCard
          label="Risk score"
          count={state.riskScore}
          tone={state.riskBand === "Low" ? "success" : state.riskBand === "Medium" ? "warn" : "danger"}
          icon={<Sparkles className="size-3" />}
          chip={{
            tone: state.riskBand === "Low" ? "success" : state.riskBand === "Medium" ? "warn" : "danger",
            label: state.riskBand,
          }}
        />
      </section>

      {/* Cross-doc mismatch banner (raw, before any rule) */}
      {caseData.crossDocFlags.length > 0 && (
        <section className="step-item-in flex items-start gap-3 rounded-xl border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.05] p-4">
          <GitBranch className="mt-0.5 size-4 shrink-0 text-[color:var(--warn)]" />
          <div className="min-w-0 text-[12.5px] leading-relaxed text-foreground/85">
            <div className="font-semibold text-[color:var(--warn)]">
              Cross-document consistency check
            </div>
            <ul className="mt-1 space-y-1">
              {caseData.crossDocFlags.map((f, i) => (
                <li key={i}>· {f.detail}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Confirmed investor data + Document register */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ConfirmedDataCard
          caseData={caseData}
          facts={facts}
          onOpenEvidence={onOpenEvidence}
        />
        <DocumentRegisterCard
          caseData={caseData}
          onOpenEvidence={onOpenEvidence}
          onGoToDocuments={onGoToDocuments}
        />
      </div>

      {/* Ownership + Checklist */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OwnershipCard caseData={caseData} />
        <ChecklistCard caseData={caseData} onOpenEvidence={onOpenEvidence} />
      </div>

      {/* W/H/W summary */}
      <WhatHowWhy
        variant="card"
        what="We reviewed the investor's submitted profile, uploaded documents, ownership, source-of-wealth narrative, source-of-funds evidence and declarations."
        how="Each document was extracted and mapped to a per-party requirement; rules ran against the extracted fields and produced a checklist outcome. Risk score is the sum of triggered rule weights with per-form overrides for material missing documents, clamped 0–100."
        why="This gives the compliance officer the same evidence-anchored summary the investor saw on Review, so attention can focus on the genuine exceptions."
      />
    </div>
  );
}

function CardShell({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-surface shadow-[0_4px_14px_rgba(12,20,48,0.04)]">
      <header className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-[#f7fafc] to-surface px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <span className="text-accent">{icon}</span>
          {title}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ConfirmedDataCard({
  caseData,
  facts,
  onOpenEvidence,
}: {
  caseData: StepperCase;
  facts: DerivedFacts;
  onOpenEvidence: (s: EvidenceSource) => void;
}) {
  const d = caseData.declarations;
  const form = caseData.profile?.legalForm;
  const isIndividual = form === "Individual";
  const sowRequired = !!form && requiresSourceOfWealth(form);
  const sofRequired = !!form && requiresSourceOfFunds(form);

  const findDoc = (docId: string) => caseData.uploadedDocuments.find((u) => u.id === docId);

  // Open the evidence drawer with metadata pulled from a derived PrefillValue.
  const openFromSource = <T,>(
    pv: PrefillValue<T> | undefined,
    field: string,
    section: string,
    why: string,
  ) => () => {
    if (!pv) return;
    const doc = findDoc(pv.sourceDocId);
    onOpenEvidence({
      title: `${field} · ${doc?.classifiedAs ?? "Document"}`,
      document: pv.sourceFileName,
      field,
      extractedValue:
        typeof pv.value === "boolean" ? (pv.value ? "Yes" : "No") : String(pv.value),
      confidence: doc?.classificationConfidence,
      result: doc
        ? { tone: doc.status === "ready" ? "success" : "warn", label: doc.status }
        : undefined,
      caseSection: section,
      why,
      docId: pv.sourceDocId,
    });
  };

  return (
    <CardShell title="Confirmed investor data" icon={<FileText className="size-3.5" />}>
      <ul>
        <FactRow
          label="Legal name"
          confirmed={caseData.profile?.investorName}
          source={facts.identity.name}
          onOpenEvidence={openFromSource(facts.identity.name, "Legal name", "Identity", "Pulled from the photo ID — used to cross-check the investor's name across documents.")}
        />
        <FactRow
          label="Legal form"
          confirmed={caseData.profile?.legalForm}
          status={caseData.profile?.legalForm ? { tone: "success", label: "Verified" } : undefined}
        />
        <FactRow
          label="Jurisdiction"
          confirmed={caseData.profile?.jurisdiction}
          status={caseData.profile?.jurisdiction ? { tone: "success", label: "Verified" } : undefined}
        />
        <FactRow label="Primary contact" confirmed={caseData.profile?.primaryContact} />
        <FactRow label="Contact email" confirmed={caseData.profile?.primaryContactEmail} />
        {!isIndividual && (
          <FactRow
            label="Nationality"
            confirmed={facts.identity.nationality?.value}
            source={facts.identity.nationality}
            onOpenEvidence={openFromSource(facts.identity.nationality, "Nationality", "Identity", "Extracted from the photo ID.")}
          />
        )}
        {isIndividual && (
          <>
            <FactRow
              label="Nationality"
              confirmed={facts.identity.nationality?.value}
              source={facts.identity.nationality}
              onOpenEvidence={openFromSource(facts.identity.nationality, "Nationality", "Identity", "Extracted from the photo ID.")}
            />
            <FactRow
              label="Date of birth"
              confirmed={facts.identity.dob?.value}
              source={facts.identity.dob}
              onOpenEvidence={openFromSource(facts.identity.dob, "Date of birth", "Identity", "Extracted from the photo ID.")}
            />
            <FactRow
              label="Address"
              confirmed={facts.identity.address?.value}
              source={facts.identity.address}
              onOpenEvidence={openFromSource(facts.identity.address, "Address", "Identity", "Extracted from the proof-of-address document.")}
            />
          </>
        )}
        <SowSofRow
          label="Source of Wealth"
          required={sowRequired}
          form={form}
          confirmed={caseData.sourceOfWealth?.category}
          source={facts.sow.category}
          onOpenEvidence={openFromSource(
            facts.sow.category,
            "Source of Wealth",
            "Source of Wealth & Funds",
            "Derived from the SoW narrative document the investor confirmed.",
          )}
        />
        <SowSofRow
          label="Source of Funds"
          required={sofRequired}
          form={form}
          confirmed={caseData.sourceOfFunds?.category}
          source={facts.sof.category}
          onOpenEvidence={openFromSource(
            facts.sof.category,
            "Source of Funds",
            "Source of Wealth & Funds",
            "Derived from the bank statement / SoF evidence document.",
          )}
        />
        <FactRow
          label="Tax residency"
          confirmed={d.taxResidencyCountry}
          source={facts.declarations.taxResidencyCountry}
          onOpenEvidence={openFromSource(facts.declarations.taxResidencyCountry, "Tax residency", "Declarations", "Extracted from the tax-residency self-certification.")}
        />
        {isIndividual && (
          <FactRow
            label="US person"
            confirmed={
              d.isUsPerson == null ? undefined : d.isUsPerson ? `Yes (TIN ${d.usTin || "—"})` : "No"
            }
            sourceBool={facts.declarations.isUsPerson}
            currentBool={d.isUsPerson}
            onOpenEvidence={openFromSource(facts.declarations.isUsPerson, "US person", "Declarations", "Extracted from the tax-residency self-certification.")}
          />
        )}
        <FactRow
          label="PEP declaration"
          confirmed={
            d.pepSelf || d.pepFamily || d.pepAssociate
              ? `Declared (${[d.pepSelf && "self", d.pepFamily && "family", d.pepAssociate && "associate"]
                  .filter(Boolean)
                  .join(", ")})`
              : d.pepSelf === false
                ? "No exposure"
                : undefined
          }
          sourceBool={facts.declarations.pepSelf}
          currentBool={d.pepSelf}
          onOpenEvidence={openFromSource(facts.declarations.pepSelf, "PEP self-declaration", "Declarations", "Extracted from the PEP declaration document.")}
          chip={d.pepSelf || d.pepFamily || d.pepAssociate ? { tone: "attention", label: "PEP" } : undefined}
        />
        {!isIndividual && (
          <FactRow
            label="FATCA / CRS"
            confirmed={d.fatcaSection}
            source={facts.declarations.fatcaSection}
            onOpenEvidence={openFromSource(facts.declarations.fatcaSection, "FATCA classification", "Declarations", "Extracted from the entity tax-residency form.")}
            chip={d.fatcaSection && !d.fatcaTin ? { tone: "warn", label: "TIN missing" } : undefined}
          />
        )}
        <FactRow
          label="Submission"
          confirmed={caseData.submittedAt ? new Date(caseData.submittedAt).toLocaleString() : "Not submitted"}
        />
      </ul>
    </CardShell>
  );
}

/**
 * Row that knows how to render a confirmed value alongside its agent-derived
 * source. Three states:
 *   - no source extracted → show value + optional status chip.
 *   - extracted matches confirmed → show value + teal "From {file}" chip.
 *   - extracted differs from confirmed → show value + purple "Edited — was '{X}'" chip.
 */
function FactRow({
  label,
  confirmed,
  source,
  sourceBool,
  currentBool,
  chip,
  status,
  onOpenEvidence,
}: {
  label: string;
  confirmed?: string;
  source?: PrefillValue<string>;
  sourceBool?: PrefillValue<boolean>;
  currentBool?: boolean;
  chip?: { tone: StatusTone; label: string };
  status?: { tone: StatusTone; label: string };
  onOpenEvidence?: () => void;
}) {
  const display = confirmed ?? "—";

  // String evidence chip.
  let evidenceNode: React.ReactNode = null;
  if (source) {
    const same = confirmed === source.value;
    evidenceNode = same ? (
      <EvidenceChipButton
        tone="teal"
        label={`From ${source.sourceFileName}`}
        onClick={onOpenEvidence}
      />
    ) : (
      <EvidenceChipButton
        tone="purple"
        label={`Edited — was "${source.value}"`}
        onClick={onOpenEvidence}
      />
    );
  } else if (sourceBool) {
    const same = currentBool === sourceBool.value;
    const wasLabel = sourceBool.value ? "Yes" : "No";
    evidenceNode = same ? (
      <EvidenceChipButton
        tone="teal"
        label={`From ${sourceBool.sourceFileName}`}
        onClick={onOpenEvidence}
      />
    ) : (
      <EvidenceChipButton
        tone="purple"
        label={`Edited — was "${wasLabel}"`}
        onClick={onOpenEvidence}
      />
    );
  }

  return (
    <li className="grid grid-cols-[minmax(120px,160px)_minmax(0,1fr)_auto] items-baseline gap-3 border-b py-2.5 last:border-b-0">
      <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{display}</div>
        {evidenceNode && <div className="mt-1">{evidenceNode}</div>}
      </div>
      <div className="flex flex-col items-end gap-1">
        {chip && (
          <StatusChip size="xs" tone={chip.tone}>
            {chip.label}
          </StatusChip>
        )}
        {status && (
          <StatusChip size="xs" tone={status.tone} dot={false}>
            {status.label}
          </StatusChip>
        )}
      </div>
    </li>
  );
}

/** Specialised SoW/SoF row that respects form-gated requirements (A3). */
function SowSofRow({
  label,
  required,
  form,
  confirmed,
  source,
  onOpenEvidence,
}: {
  label: string;
  required: boolean;
  form: string | undefined;
  confirmed?: string;
  source?: PrefillValue<string>;
  onOpenEvidence?: () => void;
}) {
  if (!required) {
    return (
      <FactRow
        label={label}
        confirmed="Not required for this form"
        status={{
          tone: "neutral",
          label:
            form === "Limited Partnership"
              ? "Covered by GP authority"
              : "Form-waived",
        }}
      />
    );
  }
  return (
    <FactRow
      label={label}
      confirmed={confirmed}
      source={source}
      onOpenEvidence={onOpenEvidence}
      status={
        confirmed
          ? { tone: "success", label: "Confirmed" }
          : { tone: "warn", label: "Outstanding" }
      }
    />
  );
}

function EvidenceChipButton({
  tone,
  label,
  onClick,
}: {
  tone: "teal" | "purple";
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="evidence-chip"
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
        tone === "teal"
          ? "border-accent/30 bg-accent/[0.06] text-accent hover:bg-accent/10"
          : "border-[color:var(--attention)]/30 bg-[color:var(--attention)]/[0.06] text-[color:var(--attention)] hover:bg-[color:var(--attention)]/10",
      )}
    >
      <Sparkles className="size-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function DocumentRegisterCard({
  caseData,
  onOpenEvidence,
  onGoToDocuments,
}: {
  caseData: StepperCase;
  onOpenEvidence: (s: EvidenceSource) => void;
  onGoToDocuments: () => void;
}) {
  // One-click "Preview" button uses the shared DocumentViewer dialog directly
  // — no need to detour through the evidence drawer for a quick look at the
  // PDF. Mounted by the cockpit shell, so `openDocument` always exists.
  const { openDocument } = useDocumentViewer();

  return (
    <CardShell
      title="Document register"
      icon={<FileText className="size-3.5" />}
      action={
        caseData.uploadedDocuments.length > 0 ? (
          <button
            type="button"
            onClick={onGoToDocuments}
            data-testid="overview-view-all-documents"
            className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-accent hover:underline"
          >
            View all →
          </button>
        ) : undefined
      }
    >
      {caseData.uploadedDocuments.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <ul className="divide-y">
          {caseData.uploadedDocuments.map((d) => {
            const tone: StatusTone =
              d.status === "ready" ? "success" : d.status === "failed" ? "danger" : "warn";
            return (
              <li
                key={d.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {d.classifiedAs}
                  </div>
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    {d.fileName}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusChip size="xs" tone={tone}>
                      {d.status}
                    </StatusChip>
                    {d.classificationConfidence && (
                      <StatusChip
                        size="xs"
                        tone={
                          d.classificationConfidence === "high"
                            ? "success"
                            : d.classificationConfidence === "medium"
                              ? "warn"
                              : "neutral"
                        }
                        dot={false}
                      >
                        {d.classificationConfidence} conf.
                      </StatusChip>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {/* One-click preview — opens the PDF immediately in the
                      shared DocumentViewer dialog. */}
                  <Button
                    size="sm"
                    onClick={() =>
                      openDocument({
                        docId: d.id,
                        fileName: d.fileName,
                        defaultTab: "pdf",
                      })
                    }
                    data-testid="register-preview"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <ExternalLink className="size-3.5" /> Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      openDocument({
                        docId: d.id,
                        fileName: d.fileName,
                        defaultTab: "markdown",
                      })
                    }
                    data-testid="register-extraction"
                    title="View the agent's extracted markdown"
                    className="text-accent hover:bg-accent/5"
                  >
                    Extraction
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onOpenEvidence({
                        title: d.classifiedAs,
                        document: d.fileName,
                        confidence: d.classificationConfidence,
                        result: { tone, label: d.status },
                        caseSection: "Document register",
                        why:
                          d.thumbnailExcerpt ??
                          "Document mapped to the case requirements set.",
                        docId: d.id,
                      })
                    }
                    data-testid="register-evidence"
                    title="View evidence detail in the side drawer"
                    className="text-muted-foreground hover:bg-secondary"
                  >
                    Details
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

/**
 * Group related parties by role-class so entity cases scan in the same shape
 * the OwnershipStep collects them. The classification is heuristic — based on
 * the `role` string — and mirrors the labels the investor sees on Step 3.
 */
function classifyRelatedParty(role: string, form: string | undefined): string {
  const r = role.toLowerCase();
  if (form === "Trust") {
    if (r.includes("trustee")) return "Trustees";
    if (r.includes("settlor") || r.includes("protector")) return "Settlor / Protector";
    if (r.includes("beneficiary")) return "Named beneficiaries ≥ 25%";
  }
  if (form === "Limited Partnership") {
    if (r.includes("general partner")) return "General Partner";
    if (r.includes("limited partner")) return "Limited Partners";
    if (r.includes("ubo") || r.includes("beneficial owner")) return "Beneficial owners ≥ 25%";
    if (r.includes("signatory")) return "Authorised signatories";
  }
  if (form === "Corporation or Private Trust Corporation") {
    if (r.includes("ubo") || r.includes("beneficial owner")) return "UBOs ≥ 25%";
    if (r.includes("director")) return "Directors";
    if (r.includes("signatory")) return "Authorised signatories";
  }
  if (form === "Regulated or Listed Entity") {
    return "Authorised signatories";
  }
  if (form === "Individual") {
    if (r.includes("self") || r.includes("investor")) return "Investor (self)";
    return "Related parties";
  }
  return "Related parties";
}

function OwnershipCard({ caseData }: { caseData: StepperCase }) {
  const form = caseData.profile?.legalForm;
  const grouped = useMemo(() => {
    const map = new Map<string, typeof caseData.relatedParties>();
    for (const p of caseData.relatedParties) {
      const group = classifyRelatedParty(p.role, form);
      const arr = map.get(group) ?? [];
      arr.push(p);
      map.set(group, arr);
    }
    return Array.from(map.entries());
  }, [caseData.relatedParties, form]);

  return (
    <CardShell title="Ownership structure" icon={<Network className="size-3.5" />}>
      {caseData.relatedParties.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {form === "Regulated or Listed Entity"
            ? "No authorised signatories captured yet."
            : "No related parties identified yet."}
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupLabel, parties]) => (
            <div key={groupLabel}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <span>{groupLabel}</span>
                <span className="rounded-full bg-secondary px-1.5 text-[10px] font-medium text-foreground">
                  {parties.length}
                </span>
              </div>
              <ul className="divide-y">
                {parties.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.role}
                        {p.nationality ? ` · ${p.nationality}` : ""}
                        {p.pep ? " · PEP indicator" : ""}
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      {p.ownershipPct != null && (
                        <span className="text-[13px] font-semibold tabular-nums text-foreground">
                          {p.ownershipPct}%
                        </span>
                      )}
                      {p.pep && (
                        <StatusChip size="xs" tone="attention">
                          PEP
                        </StatusChip>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

/**
 * Group the checklist by `party`. For each group, surface both the received
 * items AND the missing ones (slots the validator expected but no upload
 * landed on). This mirrors `requirementsFor(form)` ordering on the investor
 * side, so the reviewer reads the same shape the investor filled in.
 */
function ChecklistCard({
  caseData,
  onOpenEvidence,
}: {
  caseData: StepperCase;
  onOpenEvidence: (s: EvidenceSource) => void;
}) {
  const form = caseData.profile?.legalForm;
  const groups = useMemo(() => {
    if (!form) return [];
    const requirementGroups = requirementsFor(form);
    // Match on requirementKey only — the validator stamps `party` with the
    // investor's actual name (e.g. "Jane Smith"), while the requirement
    // groups use static labels ("Investor (individual)"), so a party-equality
    // join never hits. Requirement keys are already scoped per form
    // (`source_of_funds` vs `entity_source_of_funds`, etc.), so key-only
    // matching is safe.
    return requirementGroups.map((g) => {
      const items = g.items.map((req) => {
        const checklistItem = caseData.checklist.find(
          (i) => i.requirementKey === req.key,
        );
        const received = checklistItem !== undefined;
        return { req, item: checklistItem, received };
      });
      const receivedCount = items.filter((x) => x.received).length;
      return { party: g.party, items, receivedCount, total: g.items.length };
    });
  }, [form, caseData.checklist]);

  if (!form) {
    return (
      <CardShell title="Checklist status" icon={<ListChecks className="size-3.5" />}>
        <p className="py-2 text-sm text-muted-foreground">
          Profile step not completed yet — requirements set unknown.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell title="Checklist status" icon={<ListChecks className="size-3.5" />}>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.party}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <span className="min-w-0 truncate" title={g.party}>{g.party}</span>
              <StatusChip
                size="xs"
                tone={g.receivedCount === g.total ? "success" : "warn"}
                dot={false}
              >
                {g.receivedCount}/{g.total}
              </StatusChip>
            </div>
            <ul className="divide-y rounded-lg border bg-surface">
              {g.items.map(({ req, item, received }) => {
                const tone: StatusTone = !received
                  ? "warn"
                  : item?.status === "attention"
                    ? "warn"
                    : "success";
                const statusLabel = !received
                  ? "missing"
                  : item?.status === "attention"
                    ? "attention"
                    : "received";
                return (
                  <li
                    key={req.key}
                    className="flex items-baseline justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium text-foreground">
                        {req.name}
                      </div>
                      {(item?.issue || (!received && req.note)) && (
                        <div className="truncate text-[10.5px] text-muted-foreground">
                          {item?.issue ?? req.note}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2">
                      <StatusChip size="xs" tone={tone}>
                        {statusLabel}
                      </StatusChip>
                      {item?.sourceDocId && (
                        <button
                          type="button"
                          onClick={() => {
                            const doc = caseData.uploadedDocuments.find(
                              (d) => d.id === item.sourceDocId,
                            );
                            if (!doc) return;
                            onOpenEvidence({
                              title: item.name,
                              document: doc.fileName,
                              confidence: doc.classificationConfidence,
                              result: { tone, label: statusLabel },
                              rule: item.issue
                                ? { id: "Validator", description: item.issue }
                                : undefined,
                              caseSection: "Checklist",
                              why: item.remedy ?? "Validator outcome from the documents step.",
                              docId: doc.id,
                            });
                          }}
                          className="text-[10.5px] uppercase tracking-[0.06em] text-accent hover:underline"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/* ─── Documents tab ────────────────────────────────────────────────────── */

type DocStatusFilter = "all" | "ready" | "attention" | "pending" | "failed";

function DocumentsTab({
  caseData,
  onOpenEvidence,
}: {
  caseData: StepperCase;
  onOpenEvidence: (s: EvidenceSource) => void;
}) {
  const { openDocument } = useDocumentViewer();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DocStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const docs = caseData.uploadedDocuments;
  const checklistByDocId = useMemo(() => {
    const map = new Map<string, typeof caseData.checklist>();
    for (const ci of caseData.checklist) {
      if (!ci.sourceDocId) continue;
      const arr = map.get(ci.sourceDocId) ?? [];
      arr.push(ci);
      map.set(ci.sourceDocId, arr);
    }
    return map;
  }, [caseData.checklist]);

  const allTypes = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs) s.add(d.classifiedAs);
    return Array.from(s).sort();
  }, [docs]);

  // Memoised so typing into the search box doesn't re-walk the doc list on
  // every keystroke when the case has many uploads.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter !== "all") {
        if (filter === "ready" && d.processingPhase !== "ready") return false;
        if (filter === "attention") {
          const items = checklistByDocId.get(d.id);
          if (!items?.some((i) => i.status === "attention") && d.processingPhase !== "failed")
            return false;
        }
        if (filter === "pending") {
          if (
            d.processingPhase !== "pending" &&
            d.processingPhase !== "reading" &&
            d.processingPhase !== "classifying" &&
            d.processingPhase !== "matching"
          )
            return false;
        }
        if (filter === "failed" && d.processingPhase !== "failed") return false;
      }
      if (typeFilter !== "all" && d.classifiedAs !== typeFilter) return false;
      if (!q) return true;
      if (d.fileName.toLowerCase().includes(q)) return true;
      if (d.classifiedAs.toLowerCase().includes(q)) return true;
      if (d.thumbnailExcerpt?.toLowerCase().includes(q)) return true;
      for (const v of Object.values(d.extractedFields)) {
        if (String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [docs, filter, typeFilter, query, checklistByDocId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusSummary = useMemo(() => {
    const out = { ready: 0, attention: 0, pending: 0, failed: 0 };
    for (const d of docs) {
      if (d.processingPhase === "failed") out.failed += 1;
      else if (
        d.processingPhase === "pending" ||
        d.processingPhase === "reading" ||
        d.processingPhase === "classifying" ||
        d.processingPhase === "matching"
      )
        out.pending += 1;
      else {
        const hasAttention = checklistByDocId
          .get(d.id)
          ?.some((i) => i.status === "attention");
        if (hasAttention) out.attention += 1;
        else out.ready += 1;
      }
    }
    return out;
  }, [docs, checklistByDocId]);

  if (docs.length === 0) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border bg-gradient-to-br from-[#f7fafc] to-surface p-10 text-center">
          <FolderOpen
            className="mx-auto size-10 text-muted-foreground"
            strokeWidth={1.8}
          />
          <h3 className="mt-2 text-base font-semibold text-primary">No documents on file</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Investor hasn't uploaded any documents for this case yet.
          </p>
        </div>
        <WhatHowWhy
          variant="card"
          what="Every uploaded document — its original file, the agent's extracted markdown, and any rule outcomes — lives here."
          how="Each document is mapped to one or more requirement slots for the active legal form, and the agent's extracted fields are surfaced inline."
          why="This is the single place to inspect any file the investor handed over — the same source the Overview, Flags and Checklist all cite."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary band */}
      <section className="grid gap-3 sm:grid-cols-4">
        <MetricCard
          label="Documents on file"
          count={docs.length}
          tone="info"
          icon={<FolderOpen className="size-3" />}
        />
        <MetricCard
          label="Validated"
          count={statusSummary.ready}
          tone={statusSummary.ready > 0 ? "success" : "neutral"}
        />
        <MetricCard
          label="Need attention"
          count={statusSummary.attention}
          tone={statusSummary.attention > 0 ? "warn" : "neutral"}
        />
        <MetricCard
          label="Processing / failed"
          count={statusSummary.pending + statusSummary.failed}
          tone={statusSummary.failed > 0 ? "danger" : statusSummary.pending > 0 ? "warn" : "neutral"}
        />
      </section>

      {/* Processing banner — only when at least one document is still mid-flight */}
      {statusSummary.pending > 0 && (
        <section
          data-testid="documents-processing-banner"
          className="step-item-in flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/[0.05] p-4"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden
            className="mt-0.5 size-2 shrink-0 rounded-full bg-accent dot-pulse"
          />
          <div className="min-w-0 text-[12.5px] leading-relaxed text-foreground/85">
            <div className="font-semibold text-accent">Documents still being processed</div>
            <div className="mt-0.5 text-muted-foreground">
              {statusSummary.pending} document
              {statusSummary.pending === 1 ? " is" : "s are"} still being read, classified or
              matched. Risk score + flags will refresh once processing settles — hold off on a
              final decision until then.
            </div>
          </div>
        </section>
      )}

      {/* Toolbar */}
      <section className="overflow-hidden rounded-2xl border bg-surface shadow-[0_4px_14px_rgba(12,20,48,0.04)]">
        <div className="flex flex-wrap items-center gap-3 border-b bg-gradient-to-r from-[#f7fafc] to-surface px-4 py-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filename, type, or extracted text"
              className="pl-8"
              data-testid="documents-search"
            />
          </div>
          {allTypes.length > 1 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border bg-surface px-2.5 py-1.5 text-xs"
              data-testid="documents-type-filter"
              aria-label="Filter by document type"
            >
              <option value="all">All types</option>
              {allTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
          <Filter className="size-3 text-muted-foreground" />
          {(
            [
              ["all", `All (${docs.length})`],
              ["ready", `Validated (${statusSummary.ready})`],
              ["attention", `Attention (${statusSummary.attention})`],
              ["pending", `Processing (${statusSummary.pending})`],
              ["failed", `Failed (${statusSummary.failed})`],
            ] as Array<[DocStatusFilter, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
              data-testid={`documents-filter-${k}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Document list */}
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No documents matched the current filters.
          </p>
        ) : (
          <ul className="divide-y">
            {filtered.map((d) => {
              const checklistItems = checklistByDocId.get(d.id) ?? [];
              const isExpanded = expanded.has(d.id);
              const statusTone: StatusTone =
                d.processingPhase === "ready"
                  ? checklistItems.some((i) => i.status === "attention")
                    ? "warn"
                    : "success"
                  : d.processingPhase === "failed"
                    ? "danger"
                    : "warn";
              const statusLabel =
                d.processingPhase === "ready"
                  ? checklistItems.some((i) => i.status === "attention")
                    ? "Attention"
                    : "Validated"
                  : d.processingPhase === "failed"
                    ? "Failed"
                    : "Processing";
              const isImage = d.mimeType.startsWith("image/");
              const fieldCount = Object.keys(d.extractedFields).length;
              return (
                <li key={d.id} className="px-4 py-3" data-testid="document-card">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                      {isImage ? (
                        <ImageIcon className="size-4" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-foreground">
                          {d.classifiedAs}
                        </span>
                        <StatusChip size="xs" tone={statusTone}>
                          {statusLabel}
                        </StatusChip>
                        {d.classificationConfidence && (
                          <StatusChip
                            size="xs"
                            tone={
                              d.classificationConfidence === "high"
                                ? "success"
                                : d.classificationConfidence === "medium"
                                  ? "warn"
                                  : "neutral"
                            }
                            dot={false}
                          >
                            {d.classificationConfidence} conf.
                          </StatusChip>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {d.fileName} · {formatBytes(d.byteSize)} ·{" "}
                        {new Date(d.receivedAt).toLocaleString()}
                      </div>
                      {d.thumbnailExcerpt && (
                        <div className="mt-1 line-clamp-2 text-[12px] text-foreground/80">
                          {d.thumbnailExcerpt}
                        </div>
                      )}
                      {/* Requirement chips */}
                      {checklistItems.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {checklistItems.map((ci) => (
                            <span
                              key={ci.id}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                                ci.status === "attention"
                                  ? "border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.06] text-[color:var(--warn)]"
                                  : "border-accent/30 bg-accent/[0.06] text-accent",
                              )}
                              title={`${ci.name} · ${ci.party}`}
                            >
                              <CheckCircle2 className="size-2.5" />
                              {ci.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Button
                        size="sm"
                        onClick={() =>
                          openDocument({
                            docId: d.id,
                            fileName: d.fileName,
                            defaultTab: "pdf",
                          })
                        }
                        data-testid="document-card-preview"
                      >
                        <ExternalLink className="size-3.5" /> Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openDocument({
                            docId: d.id,
                            fileName: d.fileName,
                            defaultTab: "markdown",
                          })
                        }
                        data-testid="document-card-extraction"
                      >
                        Extraction
                      </Button>
                      {fieldCount > 0 && (
                        <button
                          type="button"
                          onClick={() => toggle(d.id)}
                          className="text-[10.5px] uppercase tracking-[0.06em] text-accent hover:underline"
                        >
                          {isExpanded ? "Hide" : "Show"} fields ({fieldCount})
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && fieldCount > 0 && (
                    <div className="mt-3 ml-12 grid grid-cols-1 gap-1 rounded-lg border bg-surface-muted/40 p-3 text-[12px] sm:grid-cols-2">
                      {Object.entries(d.extractedFields).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
                          <span className="truncate text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                            {k.replace(/_/g, " ")}
                          </span>
                          <span className="truncate text-foreground" title={String(v)}>
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Attention details */}
                  {checklistItems.some((i) => i.issue) && (
                    <div className="mt-2 ml-12 rounded-lg border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.05] p-2.5 text-[12px] text-foreground/85">
                      {checklistItems
                        .filter((i) => i.issue)
                        .map((i) => (
                          <div key={i.id} className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--warn)]" />
                            <div>
                              <div className="font-medium text-[color:var(--warn)]">{i.issue}</div>
                              {i.remedy && (
                                <div className="text-muted-foreground">{i.remedy}</div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenEvidence({
                                  title: i.name,
                                  document: d.fileName,
                                  confidence: d.classificationConfidence,
                                  result: { tone: "warn", label: "Attention" },
                                  rule: { id: "Validator", description: i.issue! },
                                  caseSection: "Documents",
                                  why: i.remedy ?? "Validator attention.",
                                  docId: d.id,
                                })
                              }
                              className="ml-auto shrink-0 text-[10.5px] uppercase tracking-[0.06em] text-accent hover:underline"
                            >
                              View evidence
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <WhatHowWhy
        variant="card"
        what="Every uploaded document is here — original file, agent extraction, classified type and any matched requirement slots."
        how="Use Preview to open the PDF/image and Extraction to read the agent's markdown rendering. Filters narrow by status; search hits filenames, types and extracted text."
        why="This is the single place to inspect any file the investor handed over — the same source the Overview, Flags and Checklist all cite."
      />
    </div>
  );
}

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)));
  return `${(n / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/* ─── Red flags / Risk tab ─────────────────────────────────────────────── */

function FlagsTab({
  state,
  onGenerateRequest,
  onGenerateConsolidated,
  onOpenEvidence,
  onPersistFlagAction,
}: {
  state: StepperComplianceState;
  onGenerateRequest: (f: StepperRedFlag) => void;
  onGenerateConsolidated: () => void;
  onOpenEvidence: (s: EvidenceSource) => void;
  onPersistFlagAction: (flag: StepperRedFlag, action: "exception" | "resolved") => Promise<void>;
}) {
  const flags = state.redFlags;
  const high = flags.filter((f) => f.severity === "High").length;
  const medium = flags.filter((f) => f.severity === "Medium").length;
  const low = flags.filter((f) => f.severity === "Low").length;

  return (
    <div className="space-y-5">
      {/* Summary band + consolidated CTA */}
      <section className="grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <MetricCard
          label="Open flags"
          count={flags.length}
          tone={flags.length === 0 ? "success" : "warn"}
          icon={<AlertTriangle className="size-3" />}
        />
        <MetricCard label="High" count={high} tone={high > 0 ? "danger" : "neutral"} />
        <MetricCard label="Medium" count={medium} tone={medium > 0 ? "warn" : "neutral"} />
        <MetricCard label="Low" count={low} tone="neutral" />
        {flags.length > 0 && (
          <div className="flex items-center">
            <Button
              size="sm"
              onClick={onGenerateConsolidated}
              data-testid="flags-generate-consolidated"
              className="h-full whitespace-nowrap bg-primary px-4 text-primary-foreground hover:bg-primary/90"
            >
              <Wand2 className="size-3.5" /> Generate consolidated request
            </Button>
          </div>
        )}
      </section>

      {flags.length === 0 ? (
        <div className="rounded-2xl border bg-gradient-to-br from-[#effff5] via-surface to-surface p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-[color:var(--success)]" strokeWidth={2.2} />
          <h3 className="mt-2 text-base font-semibold text-primary">No internal red flags</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Every rule that ran against this case returned clean.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {flags.map((f) => (
            <FlagCard
              key={f.id}
              flag={f}
              onGenerateRequest={() => onGenerateRequest(f)}
              onMarkException={() => onPersistFlagAction(f, "exception")}
              onResolve={() => onPersistFlagAction(f, "resolved")}
              onOpenEvidence={() =>
                onOpenEvidence({
                  title: f.description,
                  document: f.sourceDocId ? `Doc ${f.sourceDocId}` : "Case-wide signal",
                  field: f.category,
                  extractedValue: f.evidence,
                  result: {
                    tone: f.severity === "High" ? "danger" : "warn",
                    label: `Severity ${f.severity}`,
                  },
                  rule: { id: f.rule, description: f.description },
                  caseSection: "Red flags",
                  why: f.recommendedAction,
                })
              }
            />
          ))}
        </ul>
      )}

      <WhatHowWhy
        variant="card"
        what="We've evaluated every rule that applies to this legal form against the submitted case."
        how="Each rule combines extracted document data, declarations and screening signals. Triggered rules add weight to the risk score and surface here as a flag with severity, evidence and a recommended action."
        why="Surfacing the rule outcome plus the recommended next step lets the reviewer decide quickly: request an updated document, mark a defensible exception, escalate, or block."
      />
    </div>
  );
}

function FlagCard({
  flag,
  onGenerateRequest,
  onMarkException,
  onResolve,
  onOpenEvidence,
}: {
  flag: StepperRedFlag;
  onGenerateRequest: () => void;
  onMarkException: () => Promise<void>;
  onResolve: () => Promise<void>;
  onOpenEvidence: () => void;
}) {
  const severityTone: StatusTone =
    flag.severity === "High" ? "danger" : flag.severity === "Medium" ? "warn" : "neutral";
  const [resolved, setResolved] = useState(false);

  return (
    <li
      className={cn(
        "step-item-in overflow-hidden rounded-xl border bg-surface shadow-[0_4px_14px_rgba(12,20,48,0.04)] transition-opacity",
        resolved && "opacity-60",
      )}
    >
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-[15px] font-semibold text-primary">{flag.description}</h3>
            <StatusChip size="xs" tone={severityTone}>
              {flag.severity}
            </StatusChip>
            <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
              {flag.category} · Rule {flag.rule}
            </span>
          </div>

          <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-foreground/85">
            <ExplainerRow label="Evidence">{flag.evidence}</ExplainerRow>
            {flag.relatedParty && (
              <ExplainerRow label="Related party">{flag.relatedParty}</ExplainerRow>
            )}
            <ExplainerRow label="Why this matters">
              {whyForRule(flag.rule)}
            </ExplainerRow>
            <ExplainerRow label="Recommended action">
              <span className="font-medium text-foreground">{flag.recommendedAction}</span>
            </ExplainerRow>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:border-l lg:pl-4">
          <Button
            size="sm"
            onClick={onGenerateRequest}
            disabled={resolved}
            data-testid="flag-generate-request"
            className="justify-start"
          >
            <Wand2 className="size-3.5" /> Generate request
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await onMarkException();
              toast(`Exception marked for ${flag.rule}`, {
                description: "Audit event recorded — the flag remains until evidence updates.",
              });
            }}
            disabled={resolved}
            className="justify-start"
          >
            <ClipboardList className="size-3.5" /> Mark exception
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenEvidence}
            className="justify-start text-accent hover:bg-accent/5"
          >
            <Sparkles className="size-3.5" /> View evidence
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await onResolve();
              setResolved(true);
              toast.success(`${flag.rule} marked resolved`, {
                description: "Audit event recorded.",
              });
            }}
            disabled={resolved}
            className="justify-start border-[color:var(--success)]/30 text-[color:var(--success)] hover:bg-[color:var(--success)]/5"
          >
            <CheckCircle2 className="size-3.5" /> {resolved ? "Resolved" : "Resolve"}
          </Button>
        </div>
      </div>
    </li>
  );
}

function ExplainerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(120px,140px)_minmax(0,1fr)] gap-3">
      <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function whyForRule(rule: string): string {
  switch (rule) {
    case "R-DOC-001":
      return "Document name mismatches may indicate substituted identity or undisclosed legal-name changes — requires reconciliation before approval.";
    case "R-DOC-002":
      return "Documents flagged by the validator may be expired, illegible, or otherwise non-compliant with MGX evidence standards.";
    case "R-DOC-003":
      return "Missing required documents prevent the case from being fully evidenced under the legal-form requirements set.";
    case "R-PEP-001":
      return "Politically Exposed Person exposure triggers enhanced due diligence: source of wealth corroboration, senior management sign-off, and ongoing monitoring.";
    case "R-TAX-001":
      return "US persons must declare a valid TIN for FATCA reporting obligations; missing TIN blocks acceptance.";
    case "R-JUR-001":
      return "FATF high-risk jurisdictions carry elevated financial-crime exposure and require enhanced controls.";
    case "R-SCR-001":
      return "Sanctions hits are a hard regulatory block — MGX cannot onboard sanctioned individuals or entities.";
    case "R-SCR-002":
      return "PEP topic on a screening hit when the investor self-declared no exposure requires reconciliation before proceeding.";
    default:
      return "Rule triggered — review the evidence and apply the recommended remediation.";
  }
}

/* ─── Screening tab ────────────────────────────────────────────────────── */

const SCREENING_PHASES: Array<{ key: string; label: string }> = [
  { key: "prepare", label: "Preparing names" },
  { key: "sanctions", label: "Checking sanctions lists" },
  { key: "pep", label: "Checking PEP lists" },
  { key: "media", label: "Checking adverse media" },
  { key: "aliases", label: "Matching aliases" },
  { key: "finalize", label: "Finalising results" },
];

function NamesTab({
  caseData,
  state,
  splice,
}: {
  caseData: StepperCase;
  state: StepperComplianceState;
  splice: (s: StepperComplianceState) => void;
}) {
  const names = state.namesToScreen;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<number | null>(null);

  const ready = names.filter((n) => n.screeningStatus === "Ready for screening").length;
  const completed = names.filter((n) => n.screeningStatus === "Screening completed").length;
  const failed = names.filter((n) => n.screeningStatus === "Screening failed").length;
  const totalHits = names.reduce((sum, n) => sum + (n.matches?.length ?? 0), 0);

  const onSync = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = (await syncStepperScreeningList({
        data: { caseId: caseData.caseId },
      })) as StepperComplianceState;
      splice(updated);
      toast.success("Screening list synced");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const onRun = async () => {
    setBusy(true);
    setError(null);
    setPhase(0);
    // Animate through the phases while the real request runs.
    const phaseInterval = window.setInterval(() => {
      setPhase((p) => {
        if (p == null) return 0;
        if (p + 1 >= SCREENING_PHASES.length) return p;
        return p + 1;
      });
    }, 480);
    try {
      const updated = (await runStepperScreening({
        data: { caseId: caseData.caseId },
      })) as StepperComplianceState;
      splice(updated);
      const hits = updated.namesToScreen.reduce((s, n) => s + (n.matches?.length ?? 0), 0);
      toast.success(`Screening complete — ${hits} hit${hits === 1 ? "" : "s"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screening failed.");
    } finally {
      window.clearInterval(phaseInterval);
      setPhase(null);
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-4">
        <MetricCard
          label="Names to screen"
          count={names.length}
          icon={<Users className="size-3" />}
          tone="neutral"
        />
        <MetricCard
          label="Screened"
          count={completed}
          tone={completed === names.length && names.length > 0 ? "success" : "neutral"}
        />
        <MetricCard
          label="Hits"
          count={totalHits}
          tone={totalHits > 0 ? "danger" : "success"}
          chip={totalHits > 0 ? { tone: "danger", label: "review" } : undefined}
        />
        <MetricCard
          label="Failed"
          count={failed}
          tone={failed > 0 ? "danger" : "neutral"}
        />
      </section>

      {/* Pipeline + controls */}
      <section className="overflow-hidden rounded-2xl border bg-surface shadow-[0_4px_14px_rgba(12,20,48,0.04)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-[#f7fafc] to-surface px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Screening pipeline
            </div>
            <div className="mt-0.5 text-[13px] text-foreground">
              {phase != null
                ? SCREENING_PHASES[phase].label
                : ready === 0 && completed === 0
                  ? "Sync names to begin screening."
                  : ready > 0
                    ? `${ready} name${ready === 1 ? "" : "s"} ready · run when you're ready.`
                    : "All known names have been screened."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onSync}
              data-testid="screening-sync"
            >
              <TimerReset className="size-3.5" /> Sync from case
            </Button>
            <Button
              size="sm"
              disabled={busy || ready === 0}
              onClick={onRun}
              data-testid="screening-run"
            >
              {busy ? "Screening…" : `Run screening (${ready})`}
            </Button>
          </div>
        </header>

        {/* Phase steps */}
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-3 lg:grid-cols-6">
          {SCREENING_PHASES.map((p, i) => {
            const isActive = phase === i;
            const isDone = phase != null && i < phase;
            return (
              <div
                key={p.key}
                className={cn(
                  "relative overflow-hidden rounded-lg border px-2.5 py-2 text-[11px] transition-colors",
                  isActive && "border-accent bg-accent/[0.07] text-accent",
                  isDone && "border-[color:var(--success)]/40 bg-[color:var(--success)]/[0.05] text-[color:var(--success)]",
                  !isActive && !isDone && "bg-surface text-muted-foreground",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {isDone ? (
                    <CheckCircle2 className="size-3" />
                  ) : isActive ? (
                    <span className="size-1.5 rounded-full bg-accent dot-pulse" aria-hidden />
                  ) : (
                    <span className="size-1.5 rounded-full bg-border" aria-hidden />
                  )}
                  <span className="font-medium">{p.label}</span>
                </div>
                {isActive && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 pipeline-sweep" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Names table */}
      <section className="overflow-hidden rounded-2xl border bg-surface shadow-[0_4px_14px_rgba(12,20,48,0.04)]">
        <header className="border-b bg-gradient-to-r from-[#f7fafc] to-surface px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Screening subjects
        </header>
        {names.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No names ready for screening yet. Click <strong>Sync from case</strong> to populate from
            related parties already on file.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Type · Role</th>
                <th className="px-4 py-2.5 font-semibold">Sanctions</th>
                <th className="px-4 py-2.5 font-semibold">PEP</th>
                <th className="px-4 py-2.5 font-semibold">Media</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Hits</th>
              </tr>
            </thead>
            <tbody>
              {names.map((n) => {
                const isExpanded = expanded.has(n.id);
                const hits = n.matches?.length ?? 0;
                const topics = new Set((n.matches ?? []).flatMap((m) => m.topics));
                return (
                  <Fragment key={n.id}>
                    <tr
                      data-testid="screening-row"
                      onClick={() => toggle(n.id)}
                      className="cursor-pointer border-b last:border-b-0 transition-colors hover:bg-surface-muted/50"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          {isExpanded ? (
                            <ChevronDown className="size-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3 text-muted-foreground" />
                          )}
                          {n.name}
                        </div>
                        {n.country && (
                          <div className="ml-4 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                            {n.country}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[12px]">
                        <div className="text-foreground">{n.partyType}</div>
                        <div className="text-[11px] text-muted-foreground">{n.role}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <TopicChip
                          hit={topics.has("sanction")}
                          status={n.screeningStatus}
                          topic="sanction"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <TopicChip
                          hit={topics.has("role.pep")}
                          status={n.screeningStatus}
                          topic="role.pep"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <TopicChip
                          hit={topics.has("crime") || topics.has("wanted")}
                          status={n.screeningStatus}
                          topic="media"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <ScreeningBadge entry={n} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {n.screeningStatus === "Screening completed" ? (
                          <StatusChip
                            size="xs"
                            tone={hits > 0 ? "danger" : "success"}
                            dot={false}
                          >
                            {hits} {hits === 1 ? "hit" : "hits"}
                          </StatusChip>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b bg-surface-muted/40">
                        <td colSpan={7} className="px-6 py-3">
                          <ScreeningDetails entry={n} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <WhatHowWhy
        variant="card"
        what="We screen the investor and every related party against sanctions, PEP and adverse media datasets."
        how="Names, types and roles are normalised and sent to OpenSanctions. Matches are scored, topic-tagged (sanction, role.pep, crime, wanted) and surfaced inline."
        why="MGX must identify financial-crime, sanctions and reputational risk before onboarding; this is a regulatory pillar of acceptance."
      />
    </div>
  );
}

function TopicChip({
  hit,
  status,
  topic,
}: {
  hit: boolean;
  status: StepperNameToScreen["screeningStatus"];
  topic: string;
}) {
  void topic;
  if (status === "Ready for screening")
    return (
      <StatusChip size="xs" tone="neutral" dot={false}>
        pending
      </StatusChip>
    );
  if (status === "Screening failed")
    return (
      <StatusChip size="xs" tone="warn" dot={false}>
        n/a
      </StatusChip>
    );
  if (hit)
    return (
      <StatusChip size="xs" tone="danger">
        hit
      </StatusChip>
    );
  return (
    <StatusChip size="xs" tone="success">
      clear
    </StatusChip>
  );
}

function ScreeningBadge({ entry }: { entry: StepperNameToScreen }) {
  const tone: StatusTone =
    entry.screeningStatus === "Screening completed" && (entry.matches?.length ?? 0) > 0
      ? "warn"
      : entry.screeningStatus === "Screening completed"
        ? "success"
        : entry.screeningStatus === "Screening failed"
          ? "danger"
          : "neutral";
  return (
    <StatusChip size="xs" tone={tone}>
      {entry.screeningStatus}
    </StatusChip>
  );
}

function ScreeningDetails({ entry }: { entry: StepperNameToScreen }) {
  if (entry.screeningStatus === "Screening failed") {
    return (
      <div className="text-xs text-destructive">
        Screening failed: {entry.error ?? "Unknown error."}
      </div>
    );
  }
  if (!entry.matches || entry.matches.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No matches on {entry.provider ?? "the screening provider"}
        {entry.screenedAt ? ` (screened ${new Date(entry.screenedAt).toLocaleString()})` : ""}.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
        {entry.matches.length} match{entry.matches.length === 1 ? "" : "es"} from{" "}
        {entry.provider ?? "screening provider"}
        {entry.screenedAt ? ` at ${new Date(entry.screenedAt).toLocaleString()}` : ""}
      </div>
      <ul className="space-y-2">
        {entry.matches.map((m) => (
          <MatchRow key={m.id} match={m} />
        ))}
      </ul>
    </div>
  );
}

function MatchRow({ match }: { match: StepperScreeningHit }) {
  const topicTone = (t: string): StatusTone =>
    t === "sanction" ? "danger" : t === "role.pep" ? "attention" : t === "crime" ? "warn" : "neutral";
  const topicLabel = (t: string) => {
    if (t === "sanction") return "Sanctions";
    if (t === "role.pep") return "PEP";
    if (t === "crime") return "Crime";
    if (t === "wanted") return "Wanted";
    return t;
  };
  return (
    <li className="rounded-lg border bg-background px-3 py-2" data-testid="screening-match">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">
          {match.sourceUrl ? (
            <a className="underline" href={match.sourceUrl} target="_blank" rel="noreferrer">
              {match.caption}
            </a>
          ) : (
            match.caption
          )}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          score {Math.round((match.score ?? 0) * 100)}%
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {match.topics.map((t) => (
          <StatusChip key={t} size="xs" tone={topicTone(t)} dot={false}>
            {topicLabel(t)}
          </StatusChip>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {match.datasets.length > 0 && <>Datasets: {match.datasets.join(", ")} · </>}
        {match.countries.length > 0 && <>Countries: {match.countries.join(", ")}</>}
        {match.birthDate && <> · DOB: {match.birthDate}</>}
      </div>
    </li>
  );
}

/* ─── Requests tab ─────────────────────────────────────────────────────── */

function RfiTab({
  caseData,
  state,
  splice,
  prefilledDraft,
  consumePrefill,
}: {
  caseData: StepperCase;
  state: StepperComplianceState;
  splice: (s: StepperComplianceState) => void;
  prefilledDraft: string | null;
  consumePrefill: () => void;
}) {
  const items = state.furtherInfoRequests;
  const drafts = items.filter((r) => r.status === "draft");
  const sent = items.filter((r) => r.status === "sent");
  const responded = items.filter((r) => r.status === "responded");
  const resolved = items.filter((r) => r.status === "resolved");

  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(
    () => new Set(drafts.filter((d) => d.selected).map((d) => d.id)),
  );
  const [newDraft, setNewDraft] = useState(prefilledDraft ?? "");
  const [highlighted, setHighlighted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefilledDraft) {
      setNewDraft(prefilledDraft);
      setHighlighted(true);
      consumePrefill();
      const t = window.setTimeout(() => setHighlighted(false), 1500);
      return () => window.clearTimeout(t);
    }
  }, [prefilledDraft, consumePrefill]);

  const onAddDraft = async () => {
    if (!newDraft.trim()) {
      setError("Write the request text first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = (await addStepperRfiDraft({
        data: { caseId: caseData.caseId, text: newDraft },
      })) as StepperComplianceState;
      splice(updated);
      setNewDraft("");
      toast.success("Draft saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add draft.");
    } finally {
      setBusy(false);
    }
  };

  const onSendSelected = async () => {
    if (selectedDraftIds.size === 0) {
      setError("Tick at least one draft to send.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = (await sendStepperRfis({
        data: { caseId: caseData.caseId, rfiIds: Array.from(selectedDraftIds) },
      })) as StepperComplianceState;
      splice(updated);
      setSelectedDraftIds(new Set());
      toast.success(`Sent ${selectedDraftIds.size} request${selectedDraftIds.size === 1 ? "" : "s"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send RFIs.");
    } finally {
      setBusy(false);
    }
  };

  const onResolve = async (rfiId: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = (await markStepperRfiResolved({
        data: { caseId: caseData.caseId, rfiId },
      })) as StepperComplianceState;
      splice(updated);
      toast.success("Marked resolved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark resolved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Drafts" count={drafts.length} tone={drafts.length > 0 ? "warn" : "neutral"} />
        <MetricCard label="Sent" count={sent.length} tone="info" />
        <MetricCard label="Responded" count={responded.length} tone={responded.length > 0 ? "warn" : "neutral"} />
        <MetricCard label="Resolved" count={resolved.length} tone="success" />
      </section>

      {/* AI draft composer */}
      <section
        className={cn(
          "overflow-hidden rounded-2xl border bg-gradient-to-br from-[#f5fbfc] via-surface to-surface p-4 transition-colors",
          highlighted && "border-accent ring-2 ring-accent/30",
        )}
        data-testid="rfi-draft-composer"
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Wand2 className="size-3 text-accent" />
            New request draft
          </div>
          {prefilledDraft && (
            <StatusChip size="xs" tone="info" dot={false}>
              Drafted from a flag
            </StatusChip>
          )}
        </div>
        <textarea
          value={newDraft}
          onChange={(e) => setNewDraft(e.target.value)}
          rows={3}
          placeholder='e.g. "Please provide a proof of address dated within the last six months."'
          data-testid="rfi-draft-input"
          className="mt-2 w-full rounded-lg border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] text-muted-foreground">
            Investor sees only the request text. Internal severity, rule references and risk
            consequences stay in the workspace.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !newDraft.trim()}
            onClick={onAddDraft}
            data-testid="rfi-add-draft"
          >
            <Plus className="size-3.5" /> Save draft
          </Button>
        </div>
      </section>

      {/* Drafts list */}
      {drafts.length > 0 && (
        <CardShell
          title={`Drafts (${drafts.length})`}
          icon={<ListChecks className="size-3.5" />}
          action={
            <Button
              size="sm"
              disabled={busy || selectedDraftIds.size === 0}
              onClick={onSendSelected}
              data-testid="rfi-send-selected"
            >
              <Send className="size-3.5" /> Send to investor ({selectedDraftIds.size})
            </Button>
          }
        >
          <ul className="space-y-2">
            {drafts.map((r) => (
              <li
                key={r.id}
                data-testid="rfi-draft"
                className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={selectedDraftIds.has(r.id)}
                  onChange={(e) => {
                    setSelectedDraftIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    });
                  }}
                  className="mt-1"
                />
                <div className="text-sm">{r.text}</div>
              </li>
            ))}
          </ul>
        </CardShell>
      )}

      {/* Sent / Responded / Resolved sections */}
      {sent.length > 0 && (
        <CardShell title={`Sent — awaiting response (${sent.length})`} icon={<MessageSquare className="size-3.5" />}>
          <ul className="space-y-2">
            {sent.map((r) => (
              <RfiSentRow key={r.id} rfi={r} />
            ))}
          </ul>
        </CardShell>
      )}

      {responded.length > 0 && (
        <CardShell title={`Responded — review (${responded.length})`} icon={<MessageSquare className="size-3.5" />}>
          <ul className="space-y-3">
            {responded.map((r) => (
              <li
                key={r.id}
                data-testid="rfi-responded"
                className="rounded-lg border bg-background px-3 py-2.5"
              >
                <div className="text-sm">{r.text}</div>
                {r.investorResponseText && (
                  <div className="mt-2 rounded border bg-surface px-2.5 py-1.5 text-xs">
                    <span className="font-medium text-foreground">Investor response:</span>{" "}
                    <span className="text-muted-foreground">{r.investorResponseText}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  <span>Responded {r.respondedAt && new Date(r.respondedAt).toLocaleString()}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onResolve(r.id)}
                    data-testid="rfi-resolve"
                  >
                    <CheckCircle2 className="size-3.5" /> Mark resolved
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardShell>
      )}

      {resolved.length > 0 && (
        <CardShell title={`Resolved (${resolved.length})`} icon={<CheckCircle2 className="size-3.5" />}>
          <ul className="space-y-2">
            {resolved.map((r) => (
              <li key={r.id} className="rounded-lg border bg-background px-3 py-2.5 opacity-70">
                <div className="text-sm">{r.text}</div>
                <div className="mt-1 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  Resolved {r.resolvedAt && new Date(r.resolvedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </CardShell>
      )}

      <WhatHowWhy
        variant="card"
        what="Send a focused follow-up request when the case can't be cleared from the available evidence."
        how="Use the AI draft above (it pre-fills from any open red flag), or write your own. The investor sees only the request text — internal severity, rule references and risk consequences stay in the workspace."
        why="Requesting only what's missing keeps the investor experience light and the case audit clean."
      />
    </div>
  );
}

function RfiSentRow({ rfi }: { rfi: StepperRfi }) {
  return (
    <li data-testid="rfi-sent" className="rounded-lg border bg-background px-3 py-2.5">
      <div className="text-sm">{rfi.text}</div>
      <div className="mt-1 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
        Sent {rfi.sentAt && new Date(rfi.sentAt).toLocaleString()}
      </div>
    </li>
  );
}

/* ─── Audit tab ────────────────────────────────────────────────────────── */

type AuditFilter = "all" | "system" | "investor" | "compliance" | "documents" | "screening" | "requests" | "decisions";

function classifyAudit(a: StepperAuditEvent): { phase: string; group: AuditFilter } {
  const type = a.type.toLowerCase();
  if (type.includes("screen")) return { phase: "Screening", group: "screening" };
  if (type.includes("rfi") || type.includes("request") || type.includes("information")) {
    return { phase: "Requests", group: "requests" };
  }
  if (type.includes("submit") || type.includes("decision") || type.includes("approve") || type.includes("escalat") || type.includes("reject")) {
    return { phase: "Decision", group: "decisions" };
  }
  if (type.includes("document") || type.includes("upload") || type.includes("file") || type.includes("validator")) {
    return { phase: "Document processing", group: "documents" };
  }
  if (type.includes("compliance state")) return { phase: "Compliance review", group: "compliance" };
  if (a.actor === "Investor") return { phase: "Investor activity", group: "investor" };
  if (a.actor === "Compliance") return { phase: "Compliance review", group: "compliance" };
  if (type.includes("case created")) return { phase: "Case creation", group: "system" };
  return { phase: "System", group: "system" };
}

function AuditTab({
  caseData,
  state,
}: {
  caseData: StepperCase;
  state: StepperComplianceState;
}) {
  void state;
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const enriched = useMemo(
    () => caseData.audit.map((a) => ({ ...a, ...classifyAudit(a) })),
    [caseData.audit],
  );

  const filtered = enriched.filter((a) => {
    if (filter !== "all" && a.group !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      a.type.toLowerCase().includes(q) ||
      a.detail.toLowerCase().includes(q) ||
      a.actor.toLowerCase().includes(q)
    );
  });

  // Group by phase, keep newest-first within each.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof enriched>();
    for (const a of [...filtered].reverse()) {
      const arr = map.get(a.phase) ?? [];
      arr.push(a);
      map.set(a.phase, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportTrail = () => {
    const lines = enriched.map(
      (a) => `${a.at}\t${a.actor}\t${a.type}\t${a.detail}`,
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${caseData.caseId}-audit-trail.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Audit trail exported");
  };

  const filters: Array<{ key: AuditFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "system", label: "System" },
    { key: "investor", label: "Investor" },
    { key: "compliance", label: "Compliance" },
    { key: "documents", label: "Documents" },
    { key: "screening", label: "Screening" },
    { key: "requests", label: "Requests" },
    { key: "decisions", label: "Decisions" },
  ];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-surface shadow-[0_4px_14px_rgba(12,20,48,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-[#f7fafc] to-surface px-4 py-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search audit events"
                className="pl-8"
                data-testid="audit-search"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={exportTrail}
            data-testid="audit-export"
            disabled={enriched.length === 0}
          >
            Export trail
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
          <Filter className="size-3 text-muted-foreground" />
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
              data-testid={`audit-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {grouped.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {query.trim() ? "No audit events matched your search." : "No audit events recorded yet."}
          </p>
        ) : (
          <div className="divide-y">
            {grouped.map(([phase, events]) => (
              <div key={phase}>
                <div className="flex items-center gap-1.5 bg-surface-muted/40 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  <GitBranch className="size-3 text-accent" />
                  {phase}
                  <span className="ml-1 rounded-full bg-secondary px-1.5 text-[10px] font-medium text-foreground">
                    {events.length}
                  </span>
                </div>
                <ul className="divide-y">
                  {events.map((a) => {
                    const isOpen = expanded.has(a.id);
                    return (
                      <li key={a.id} className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggle(a.id)}
                          className="flex w-full items-start justify-between gap-3 text-left"
                        >
                          <div className="flex min-w-0 items-baseline gap-2">
                            {isOpen ? (
                              <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-medium text-foreground">
                                {a.type}
                              </div>
                              <div className="truncate text-[11.5px] text-muted-foreground">
                                {a.detail}
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                            <div>{a.actor}</div>
                            <div className="font-normal normal-case">
                              {new Date(a.at).toLocaleString()}
                            </div>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="mt-2 ml-5 rounded-lg border bg-surface-muted/40 p-3 text-[12px] text-foreground/85">
                            <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-y-1">
                              <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                                Event id
                              </span>
                              <span className="font-mono text-[11px]">{a.id}</span>
                              <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                                Phase
                              </span>
                              <span>{a.phase}</span>
                              <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                                Actor
                              </span>
                              <span>{a.actor}</span>
                              <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                                Detail
                              </span>
                              <span>{a.detail}</span>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <WhatHowWhy
        variant="card"
        what="Every system, investor and reviewer action against this case is captured here."
        how="Events are emitted by the server fns at the point of state change and grouped by phase: case creation, documents, screening, requests and decision."
        why="Compliance decisions must be explainable, auditable and traceable — the audit trail is the record of who saw what and when."
      />
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function computeScreeningStatus(
  names: StepperNameToScreen[],
): "Not run" | "Running" | "Clear" | "Hits found" | "Mixed" {
  if (names.length === 0) return "Not run";
  const completed = names.filter((n) => n.screeningStatus === "Screening completed");
  if (completed.length === 0) return "Not run";
  const hits = completed.reduce((s, n) => s + (n.matches?.length ?? 0), 0);
  if (completed.length < names.length) return "Mixed";
  return hits > 0 ? "Hits found" : "Clear";
}

/**
 * Compose ONE investor-facing message covering every open flag, in plain
 * English with no internal severity/rule references. Drives the consolidated
 * request flow from Risk & Flags → Requests.
 */
function buildConsolidatedRfiCopy(flags: StepperRedFlag[]): string {
  const lines: string[] = [
    "Please provide the following information so we can complete your onboarding review:",
    "",
  ];
  const items = new Set<string>();
  for (const f of flags) {
    items.add(humanItemForFlag(f));
  }
  let n = 1;
  for (const item of items) {
    lines.push(`${n}. ${item}`);
    n += 1;
  }
  lines.push("");
  lines.push(
    "Accepted formats: PDF, PNG or JPEG. Please make sure each document is clear, complete, and shows the relevant names, dates and reference details where applicable.",
  );
  lines.push("");
  lines.push("Please upload the documents through the secure portal within 5 business days.");
  return lines.join("\n");
}

function humanItemForFlag(flag: StepperRedFlag): string {
  switch (flag.rule) {
    case "R-DOC-003":
      // "Required: {name} — {party}" → just the name
      return flag.description.replace(/^Required:\s*/, "").split(" — ")[0];
    case "R-DOC-002":
      return `An updated copy of ${flag.description.replace(/^Document flagged for attention:\s*/, "").toLowerCase()} that resolves the validator's concern`;
    case "R-DOC-001":
      return "A document reconciling the differing name across your uploaded files";
    case "R-PEP-001":
      return "A short explanation supporting your PEP declaration (role, period, approving body)";
    case "R-TAX-002":
      return "A signed entity FATCA / CRS self-certification including the entity Tax Identification Number";
    case "R-JUR-001":
      return "Additional source-of-wealth corroboration for the declared jurisdiction";
    case "R-SCR-001":
    case "R-SCR-002":
      return `Confirmation regarding the screening match on ${flag.relatedParty ?? "the named party"}`;
    default:
      return flag.description;
  }
}

function buildRfiCopyFor(flag: StepperRedFlag): string {
  switch (flag.rule) {
    case "R-DOC-002":
      return `We're following up on the document linked to your case (${flag.description}). Could you please provide an updated version that addresses the following: ${flag.evidence}? Documents should be issued within the last six months and clearly show your full name, address and the issue date.`;
    case "R-DOC-003":
      return `Could you please upload the following document: ${flag.description.replace(/^Required document missing: /, "")}? This is required to complete your investor profile.`;
    case "R-DOC-001":
      return `We noticed the name on one of your uploaded documents differs slightly from the others. ${flag.evidence} Could you please confirm which spelling is correct, or share a supporting document (deed-poll, marriage certificate, etc.) that explains the difference?`;
    case "R-PEP-001":
      return `Thank you for your PEP declaration. To complete enhanced due diligence, could you please provide a short summary of your role/position, the period of exposure and any supporting confirmation from the appointing body?`;
    case "R-TAX-001":
      return `Our records indicate you may be a US person but a Taxpayer Identification Number (TIN) was not provided. Could you please share your US TIN so we can complete FATCA reporting?`;
    case "R-JUR-001":
      return `Given the jurisdiction associated with your case, we need to apply enhanced due diligence. Could you please share additional evidence corroborating your source of wealth and source of funds?`;
    case "R-SCR-001":
    case "R-SCR-002":
      return `Our screening produced a potential match against the name "${flag.relatedParty ?? "(unspecified)"}". Could you please confirm whether this match relates to you or someone connected to you, and share any supporting information?`;
    default:
      return `Could you please provide additional information regarding "${flag.description}"? ${flag.recommendedAction}`;
  }
}

interface AssistantContextArgs {
  tab: AssistantTab;
  state: StepperComplianceState;
  caseData: StepperCase;
  screeningStatus: ReturnType<typeof computeScreeningStatus>;
  openFlagCount: number;
  onRequestInfo: () => void;
  onSync: () => Promise<void>;
  onRun: () => Promise<void>;
}

function buildAssistantContext(args: AssistantContextArgs) {
  const { tab, state, caseData, screeningStatus, openFlagCount, onRequestInfo, onSync, onRun } = args;
  const decisionTone = state.suggestedOutcome;

  const form = caseData.profile?.legalForm;
  const sowRequired = !!form && requiresSourceOfWealth(form);
  const sofRequired = !!form && requiresSourceOfFunds(form);

  const reasons: AssistantReason[] = [];
  if (caseData.profile?.investorName) {
    reasons.push({
      label: `${form ?? "Investor"} profile complete: ${caseData.profile.investorName}.`,
      tone: "ok",
    });
  }
  // Form-aware SoW/SoF reasoning (A3 + C2).
  if (sowRequired) {
    reasons.push({
      label: caseData.sourceOfWealth?.category
        ? `Source of Wealth narrative captured (${caseData.sourceOfWealth.category}).`
        : "Source of Wealth narrative outstanding.",
      tone: caseData.sourceOfWealth?.category ? "ok" : "warn",
    });
  } else if (form) {
    reasons.push({
      label:
        form === "Limited Partnership"
          ? "Source of Wealth covered by GP authority for this form."
          : "Source of Wealth waived for this form.",
      tone: "info",
    });
  }
  if (sofRequired) {
    reasons.push({
      label: caseData.sourceOfFunds?.category
        ? `Source of Funds evidenced (${caseData.sourceOfFunds.category}).`
        : "Source of Funds evidence outstanding.",
      tone: caseData.sourceOfFunds?.category ? "ok" : "warn",
    });
  } else if (form === "Limited Partnership") {
    reasons.push({
      label: "Source of Funds covered by GP authority — no separate SoF document required.",
      tone: "info",
    });
  }
  const d = caseData.declarations;
  if (d.pepSelf === false && d.pepFamily === false && d.pepAssociate === false) {
    reasons.push({ label: "PEP declaration confirms no exposure.", tone: "ok" });
  }
  if (screeningStatus === "Clear") {
    reasons.push({ label: "Screening complete — no hits.", tone: "ok" });
  } else if (screeningStatus === "Hits found") {
    reasons.push({ label: "Screening returned hits — review the screening tab.", tone: "warn" });
  } else if (screeningStatus === "Not run") {
    reasons.push({ label: "Screening has not been run yet.", tone: "info" });
  }
  if (caseData.legacyLegalForm) {
    reasons.push({
      label: `Legacy form "${caseData.legacyLegalForm}" was remapped to ${form} for the rules set.`,
      tone: "info",
    });
  }
  for (const f of state.redFlags.slice(0, 4)) {
    reasons.push({ label: `${f.description} (${f.severity}).`, tone: "warn" });
  }

  const timeline: AssistantTimelineItem[] = caseData.audit.slice(-8).map((a) => ({
    id: a.id,
    label: a.type,
    detail: a.detail,
    time: new Date(a.at).toLocaleString(),
    warn: a.type.toLowerCase().includes("fail") || a.type.toLowerCase().includes("attention"),
  }));

  // Tab-specific explanation + next-best action
  let explanation: { what: React.ReactNode; how: React.ReactNode; why: React.ReactNode };
  let nextBestAction: React.ReactNode;
  let actions: Array<{ label: string; onClick?: () => void; variant?: "primary" | "outline" }>;

  if (tab === "overview") {
    explanation = {
      what: "Surfaced the investor profile, documents, ownership, declarations and the risk score so the case can be assessed at a glance.",
      how: "Each piece of evidence was extracted by the agent during onboarding and validated against the requirements for the legal form.",
      why: "A complete case summary lets the reviewer focus attention on the exceptions instead of the routine.",
    };
    nextBestAction =
      openFlagCount === 0
        ? "Case looks clean. Confirm screening is complete, then approve."
        : `Review the ${openFlagCount} open ${openFlagCount === 1 ? "flag" : "flags"} on the Risk & flags tab.`;
    actions = openFlagCount === 0
      ? [{ label: "Approve case", onClick: () => onRequestInfo(), variant: "outline" }]
      : [{ label: "Open flags", onClick: () => onRequestInfo(), variant: "primary" }];
  } else if (tab === "documents") {
    const docCount = caseData.uploadedDocuments.length;
    const attentionCount = caseData.checklist.filter((i) => i.status === "attention").length;
    explanation = {
      what: `Showing ${docCount} uploaded document${docCount === 1 ? "" : "s"} with the agent's classification, extracted fields and matched requirements.`,
      how: "Open Preview to see the original PDF or image; Extraction shows the agent's markdown rendering used by the rule set. Filters narrow by status; search hits filenames, types and extracted text.",
      why: "Every other tab cites these documents — flags, requests and screening all point back here, so this is where final evidence-anchored judgement is made.",
    };
    nextBestAction =
      attentionCount > 0
        ? `${attentionCount} document${attentionCount === 1 ? "" : "s"} need attention — review them before approving.`
        : docCount > 0
          ? "All documents validated cleanly. Spot-check the higher-risk classes (SoW narrative, register of members) before approving."
          : "No documents on file — case cannot be evaluated until the investor uploads.";
    actions =
      attentionCount > 0
        ? [{ label: "Open flags", onClick: () => onRequestInfo(), variant: "primary" }]
        : [];
  } else if (tab === "flags") {
    explanation = {
      what: "Listed every rule that triggered against this case, with evidence and a recommended action.",
      how: "Rule weights sum into the risk score; severity is set per rule. Sanctions hits force FAIL, otherwise the band drives the suggested outcome.",
      why: "Concrete next-step actions per flag make remediation defensible and traceable.",
    };
    nextBestAction =
      openFlagCount === 0
        ? "No open flags — there's nothing to remediate."
        : "Use 'Generate request' on the most blocking flag to draft the follow-up.";
    actions = openFlagCount === 0
      ? []
      : [{ label: "Draft requests", onClick: onRequestInfo, variant: "primary" }];
  } else if (tab === "names") {
    explanation = {
      what: "Screened the investor and every related party against sanctions, PEP and adverse-media datasets.",
      how: "Names are normalised and sent to OpenSanctions. Matches are scored, topic-tagged and surfaced inline. Re-running is idempotent.",
      why: "MGX must identify sanctions exposure, political exposure and reputational risk before onboarding.",
    };
    nextBestAction =
      screeningStatus === "Not run"
        ? "Sync names from the case, then run screening."
        : screeningStatus === "Hits found"
          ? "Review the hits, confirm or clear each, and capture the determination in audit."
          : screeningStatus === "Mixed"
            ? "Some subjects are still pending — run screening again."
            : "Screening is clear. No further action needed.";
    actions =
      screeningStatus === "Not run"
        ? [
            { label: "Sync", onClick: () => void onSync(), variant: "outline" },
            { label: "Run screening", onClick: () => void onRun(), variant: "primary" },
          ]
        : screeningStatus === "Mixed"
          ? [{ label: "Run again", onClick: () => void onRun(), variant: "primary" }]
          : [];
  } else if (tab === "rfi") {
    explanation = {
      what: "Drafts, sent and resolved follow-up requests to the investor live here.",
      how: "Draft text is investor-visible only. Sending appends an audit event; investor responses arrive via the stepper inbox and surface in the Responded section.",
      why: "Bundling a single consolidated request beats incremental email exchanges — it keeps the investor experience light and the audit trail focused.",
    };
    nextBestAction = state.furtherInfoRequests.some((r) => r.status === "draft")
      ? "Review and send the open drafts to the investor."
      : openFlagCount > 0
        ? "Generate a draft from the top open flag, or write a custom request."
        : "No open issues — nothing to request.";
    actions =
      openFlagCount > 0
        ? [{ label: "Open flags", onClick: () => onRequestInfo(), variant: "outline" }]
        : [];
  } else {
    // audit
    explanation = {
      what: "A full, filterable history of system, investor and reviewer actions on this case.",
      how: "Events are written by the server fns at the point of state change. Phase grouping makes the timeline easier to scan.",
      why: "Compliance decisions must be explainable, auditable and traceable — this is the record of record.",
    };
    nextBestAction =
      "Export the audit trail if you're closing the case for archival.";
    actions = [];
  }

  return {
    tab,
    suggestedDecision: decisionTone,
    riskScore: state.riskScore,
    riskBand: state.riskBand,
    confidence: deriveConfidenceForState(state),
    reasons,
    nextBestAction,
    actions,
    explanation,
    timeline,
  };
}

function deriveConfidenceForState(state: StepperComplianceState): number {
  if (state.suggestedOutcome === "FAIL") return 96;
  if (state.suggestedOutcome === "PENDING") return 84;
  const penalty = Math.min(20, state.redFlags.length * 4);
  return 92 - penalty;
}
