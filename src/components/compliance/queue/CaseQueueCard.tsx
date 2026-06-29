import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  ListChecks,
  MoreHorizontal,
  ScrollText,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StepperCase } from "@/lib/stepper/types";
import {
  caseSlaState,
  formatRelative,
  type SlaTone,
} from "@/lib/stepper/compliance-sla";
import type { StepperComplianceState } from "@/lib/stepper/compliance";
import { getStepperComplianceState } from "@/server/stepper/compliance";
import { deleteStepperCase } from "@/server/stepper/cases";
import { StatusChip, type StatusTone } from "../primitives/StatusChip";

const stateQueryKey = (caseId: string) => ["stepper-compliance-state", caseId] as const;
const LIST_QUERY_KEY = ["stepper-cases"] as const;

const DECISION_TONE: Record<"PASS" | "FAIL" | "PENDING", StatusTone> = {
  PASS: "success",
  FAIL: "danger",
  PENDING: "warn",
};
const DECISION_LABEL: Record<"PASS" | "FAIL" | "PENDING", string> = {
  PASS: "Suggested pass",
  FAIL: "Suggested reject",
  PENDING: "Conditional",
};
const BAND_TONE: Record<"Low" | "Medium" | "High", StatusTone> = {
  Low: "success",
  Medium: "warn",
  High: "danger",
};
const SLA_TONE: Record<SlaTone, StatusTone> = {
  neutral: "neutral",
  warn: "warn",
  danger: "danger",
};

function screeningLabel(state: StepperComplianceState | undefined): {
  label: string;
  tone: StatusTone;
} {
  if (!state || state.namesToScreen.length === 0) {
    return { label: "Not run", tone: "neutral" };
  }
  const completed = state.namesToScreen.filter((n) => n.screeningStatus === "Screening completed");
  if (completed.length === 0) return { label: "Not run", tone: "neutral" };
  const hits = completed.reduce((s, n) => s + (n.matches?.length ?? 0), 0);
  if (completed.length < state.namesToScreen.length) return { label: "Mixed", tone: "warn" };
  return hits > 0 ? { label: "Hits", tone: "danger" } : { label: "Clear", tone: "success" };
}

function openRfis(state: StepperComplianceState | undefined): number {
  if (!state) return 0;
  return state.furtherInfoRequests.filter((r) => r.status !== "resolved").length;
}

interface Props {
  caseData: StepperCase;
  /** Selection state from parent for multi-select bulk actions. */
  selected: boolean;
  onToggleSelect: (caseId: string) => void;
}

export function CaseQueueCard({ caseData, selected, onToggleSelect }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: state } = useQuery({
    queryKey: stateQueryKey(caseData.caseId),
    queryFn: () => getStepperComplianceState({ data: { caseId: caseData.caseId } }),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: !!caseData.submittedAt,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteStepperCase({ data: { caseId: caseData.caseId } }),
    onSuccess: () => {
      queryClient.setQueryData<StepperCase[]>(LIST_QUERY_KEY, (prev) =>
        (prev ?? []).filter((c) => c.caseId !== caseData.caseId),
      );
      queryClient.removeQueries({ queryKey: stateQueryKey(caseData.caseId) });
      toast.success(
        `Deleted ${caseData.profile?.investorName ?? caseData.caseId}`,
      );
      setConfirmOpen(false);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the case.");
    },
  });

  const open = useCallback(() => {
    // Use query-param routing — `/compliance?case=STP-...` — instead of a
    // child path so the parent route's component swap is unambiguous.
    void navigate({
      to: "/compliance",
      search: { case: caseData.caseId },
    });
  }, [caseData.caseId, navigate]);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      // Ignore Enter/Space when focus is on the inner checkbox / menu.
      const target = e.target as HTMLElement;
      if (target.closest("[data-stop-card-key]")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    },
    [open],
  );

  const isSubmitted = !!caseData.submittedAt;
  const sla = caseSlaState(caseData);
  const slaTone = SLA_TONE[sla.tone];
  const screening = screeningLabel(state);
  const flagCount = state?.redFlags.length ?? 0;
  const rfiCount = openRfis(state);
  const docCount = caseData.uploadedDocuments.length;

  const topFlag = state?.redFlags[0];

  const decisionTone: StatusTone | undefined = state
    ? DECISION_TONE[state.suggestedOutcome]
    : undefined;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(caseData.caseId);
      toast.success(`Copied ${caseData.caseId}`);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <>
      <div
        data-testid="queue-card"
        data-case-id={caseData.caseId}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={onKey}
        className={cn(
          "group relative cursor-pointer overflow-hidden rounded-xl border bg-surface shadow-[0_2px_8px_rgba(12,20,48,0.04)] transition-all",
          "hover:border-accent/40 hover:shadow-[0_8px_22px_rgba(12,20,48,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected && "border-accent bg-accent/[0.03] ring-1 ring-accent/30",
        )}
      >
        <div className="grid items-center gap-4 px-4 py-3 lg:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
          {/* Selection checkbox */}
          <label
            data-stop-card-key
            className="flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(caseData.caseId)}
              data-testid="queue-card-select"
              aria-label={`Select case ${caseData.profile?.investorName ?? caseData.caseId}`}
              className="size-4 cursor-pointer rounded border-border accent-primary"
            />
          </label>

          {/* Identity */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="truncate text-[15px] font-semibold leading-tight text-primary">
                {caseData.profile?.investorName || `Case ${caseData.caseId}`}
              </h3>
              {!isSubmitted ? (
                <StatusChip size="xs" tone="neutral" dot={false}>
                  In progress
                </StatusChip>
              ) : state ? (
                <StatusChip size="xs" tone={decisionTone!}>
                  {DECISION_LABEL[state.suggestedOutcome]}
                </StatusChip>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
              {caseData.profile?.legalForm && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="size-3" />
                  {caseData.profile.legalForm}
                </span>
              )}
              {caseData.profile?.legalForm && caseData.profile?.jurisdiction && (
                <span className="opacity-40">·</span>
              )}
              {caseData.profile?.jurisdiction && <span>{caseData.profile.jurisdiction}</span>}
              {caseData.profile?.jurisdiction && <span className="opacity-40">·</span>}
              <span className="font-medium tabular-nums text-foreground/80">
                {caseData.caseId}
              </span>
              {isSubmitted && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="inline-flex items-center gap-1">
                    <ScrollText className="size-3" />
                    {formatRelative(caseData.submittedAt!)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Inline stats */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
            <InlineStat
              icon={<Clock className="size-3" />}
              value={isSubmitted ? sla.label : "Not submitted"}
              tone={isSubmitted ? slaTone : "neutral"}
            />
            <span className="text-border">|</span>
            <InlineStat
              icon={<FileText className="size-3" />}
              value={`${docCount} ${docCount === 1 ? "doc" : "docs"}`}
              tone="neutral"
            />
            <span className="text-border">|</span>
            <InlineStat
              icon={<AlertTriangle className="size-3" />}
              value={`${flagCount} ${flagCount === 1 ? "flag" : "flags"}`}
              tone={flagCount === 0 ? "success" : "warn"}
            />
            <span className="text-border">|</span>
            <InlineStat
              icon={<Users className="size-3" />}
              value={`Screen · ${screening.label}`}
              tone={screening.tone}
            />
            {rfiCount > 0 && (
              <>
                <span className="text-border">|</span>
                <InlineStat
                  icon={<ListChecks className="size-3" />}
                  value={`${rfiCount} RFI`}
                  tone="info"
                />
              </>
            )}
          </div>

          {/* Risk score */}
          <div className="flex items-center gap-2">
            {isSubmitted && state ? (
              <>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                    Risk
                  </div>
                  <div className="text-[20px] font-semibold tabular-nums leading-none text-primary">
                    {state.riskScore}
                  </div>
                </div>
                <StatusChip size="xs" tone={BAND_TONE[state.riskBand]} dot={false}>
                  {state.riskBand}
                </StatusChip>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                {isSubmitted ? "Assessing…" : "Awaiting submission"}
              </div>
            )}
          </div>

          {/* Actions */}
          <div
            data-stop-card-key
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              onClick={open}
              data-testid="queue-card-open"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Open <ExternalLink className="size-3.5" />
            </Button>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  aria-label="More actions"
                  data-testid="queue-card-menu"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem onClick={open}>
                  <ExternalLink className="size-3.5" /> Open in cockpit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyId}>
                  <Copy className="size-3.5" /> Copy case ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                  className="text-destructive focus:text-destructive"
                  data-testid="queue-card-delete"
                >
                  <Trash2 className="size-3.5" /> Delete case…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Priority + next action footer — always renders for submitted cases */}
        {isSubmitted && state && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-surface-muted/40 px-4 py-1.5 text-[11px]">
            <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Priority
              </span>
              <span className="truncate text-foreground/85">
                {priorityReason({ state, sla, screening, flagCount, rfiCount })}
              </span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Next
              </span>
              <span className="truncate text-foreground/85">
                {nextActionLabel({ state, sla, screening, flagCount, rfiCount })}
              </span>
            </div>
          </div>
        )}

        {/* Blocking banner — only when material */}
        {state?.suggestedOutcome === "FAIL" ? (
          <div className="flex items-center gap-1.5 border-t bg-destructive/[0.06] px-4 py-1.5 text-[11.5px] font-medium text-destructive">
            <ShieldAlert className="size-3.5 shrink-0" />
            Sanctions or critical hit — block recommended.
          </div>
        ) : topFlag && (topFlag.severity === "High" || topFlag.severity === "Medium") ? (
          <div className="flex items-center gap-1.5 border-t bg-[color:var(--warn)]/[0.05] px-4 py-1.5 text-[11.5px] text-foreground/85">
            <AlertTriangle className="size-3.5 shrink-0 text-[color:var(--warn)]" />
            <span className="truncate">{topFlag.description}</span>
            {flagCount > 1 && (
              <span className="text-muted-foreground">· +{flagCount - 1} more</span>
            )}
          </div>
        ) : null}
      </div>

      <DeleteCaseDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        caseData={caseData}
        busy={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}

interface ReasonCtx {
  state: StepperComplianceState;
  sla: ReturnType<typeof caseSlaState>;
  screening: { label: string; tone: StatusTone };
  flagCount: number;
  rfiCount: number;
}

/**
 * One-line explanation of why this case is in its current priority position.
 * Order matters — the first matching rule wins.
 */
function priorityReason({ state, sla, screening, flagCount, rfiCount }: ReasonCtx): string {
  if (state.suggestedOutcome === "FAIL") return "Sanctions / critical hit detected";
  if (sla.tone === "danger") return `SLA breached — ${sla.label.toLowerCase()}`;
  if (sla.tone === "warn") return `SLA close — ${sla.label.toLowerCase()}`;
  if (state.riskBand === "High") return `High-risk band (score ${state.riskScore})`;
  if (flagCount > 0 && screening.label === "Not run") {
    return `${flagCount} open flag${flagCount === 1 ? "" : "s"} + screening not run`;
  }
  if (flagCount > 0) return `${flagCount} open flag${flagCount === 1 ? "" : "s"} to review`;
  if (screening.label === "Not run") return "Screening not run";
  if (rfiCount > 0) return `${rfiCount} RFI in flight`;
  return "Within SLA · clean risk band";
}

function nextActionLabel({
  state,
  sla,
  screening,
  flagCount,
  rfiCount,
}: ReasonCtx): string {
  void sla;
  if (state.suggestedOutcome === "FAIL") return "Escalate to MLRO";
  if (screening.label === "Not run") return "Run screening";
  if (flagCount > 0) return "Generate consolidated request";
  if (rfiCount > 0) return "Review investor response";
  return "Spot-check + approve";
}

function InlineStat({
  icon,
  value,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  tone: StatusTone;
}) {
  const toneClass: Record<StatusTone, string> = {
    success: "text-[color:var(--success)]",
    warn: "text-[color:var(--warn)]",
    danger: "text-destructive",
    attention: "text-[color:var(--attention)]",
    info: "text-primary",
    neutral: "text-foreground/70",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", toneClass[tone])}>
      <span className="text-muted-foreground/60">{icon}</span>
      {value}
    </span>
  );
}

function DeleteCaseDialog({
  open,
  onOpenChange,
  caseData,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseData: StepperCase;
  busy: boolean;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="delete-case-dialog">
        <DialogHeader>
          <DialogTitle>Delete this case?</DialogTitle>
          <DialogDescription>
            This permanently removes{" "}
            <span className="font-semibold text-foreground">
              {caseData.profile?.investorName ?? caseData.caseId}
            </span>{" "}
            ({caseData.caseId}) and any associated screening, RFIs and audit history. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="delete-case-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="delete-case-confirm"
          >
            <Trash2 className="size-3.5" />
            {busy ? "Deleting…" : "Delete case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
