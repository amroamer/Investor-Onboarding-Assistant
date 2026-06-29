import { useEffect, useMemo, useState } from "react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Filter,
  Inbox,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { StepCanvas } from "@/components/stepper/intel";
import { useStepperCaseList } from "@/lib/stepper/store";
import { getStepperComplianceState } from "@/server/stepper/compliance";
import { deleteStepperCase } from "@/server/stepper/cases";
import type { StepperCase } from "@/lib/stepper/types";
import type { StepperComplianceState } from "@/lib/stepper/compliance";
import { StatusChip, type StatusTone } from "../primitives/StatusChip";
import { WhatHowWhy } from "../primitives/WhatHowWhy";
import { CaseQueueCard } from "./CaseQueueCard";
import { QueueAssistantPanel } from "./QueueAssistantPanel";

const LIST_QUERY_KEY = ["stepper-cases"] as const;
import {
  computeQueueKpis,
  filterQueue,
  sortQueue,
  type QueueFilter,
  type QueueSort,
} from "./queue-filters";

const SORT_LABEL: Record<QueueSort, string> = {
  "submitted-newest": "Newest first",
  "sla-urgent": "SLA most urgent",
  "risk-highest": "Highest risk",
  "flags-most": "Most open flags",
};

const FILTERS: Array<{ key: QueueFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "pass", label: "Pass" },
  { key: "pending", label: "Conditional" },
  { key: "fail", label: "Fail" },
  { key: "high-risk", label: "High risk" },
  { key: "has-rfi", label: "Open RFI" },
  { key: "screening-pending", label: "Screening pending" },
];

export function CaseQueueView({
  includeInProgress,
  setIncludeInProgress,
}: {
  includeInProgress: boolean;
  setIncludeInProgress: (v: boolean) => void;
}) {
  const { cases, isLoading, isFetching, refetch } = useStepperCaseList();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [sort, setSort] = useState<QueueSort>("submitted-newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const toggleSelect = (caseId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Prune orphan selections — when a case is deleted from elsewhere (single
  // delete via card menu) the selection set could still hold its id.
  useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set(cases.map((c) => c.caseId));
      const next = new Set<string>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [cases]);

  // Bulk delete — fan-out N delete calls in parallel, then optimistically
  // strip the rows from the cases list.
  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((caseId) => deleteStepperCase({ data: { caseId } })),
      );
      return ids;
    },
    onSuccess: (ids) => {
      queryClient.setQueryData<StepperCase[]>(LIST_QUERY_KEY, (prev) =>
        (prev ?? []).filter((c) => !ids.includes(c.caseId)),
      );
      for (const id of ids) {
        queryClient.removeQueries({ queryKey: ["stepper-compliance-state", id] });
      }
      toast.success(`Deleted ${ids.length} case${ids.length === 1 ? "" : "s"}`);
      setBulkConfirmOpen(false);
      clearSelection();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed.");
    },
  });

  // Prefetch compliance state for every visible case. `useQueries` lets us
  // declare N queries that all share the same React Query cache the
  // CaseQueueCard reads from — no duplicate fetches.
  const queryResults = useQueries({
    queries: cases.map((c) => ({
      queryKey: ["stepper-compliance-state", c.caseId] as const,
      queryFn: () => getStepperComplianceState({ data: { caseId: c.caseId } }),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      enabled: !!c.submittedAt,
    })),
  });

  const stateLookup = useMemo(() => {
    const map = new Map<string, StepperComplianceState>();
    cases.forEach((c, i) => {
      const r = queryResults[i];
      if (r?.data) map.set(c.caseId, r.data);
    });
    return (caseId: string) => map.get(caseId);
  }, [cases, queryResults]);

  const kpis = useMemo(
    () => computeQueueKpis(cases, stateLookup),
    [cases, stateLookup],
  );

  const filtered = useMemo(
    () => filterQueue(cases, filter, search, stateLookup, includeInProgress),
    [cases, filter, search, stateLookup, includeInProgress],
  );

  const sorted = useMemo(
    () => sortQueue(filtered, sort, stateLookup),
    [filtered, sort, stateLookup],
  );

  const main = (
    <div className="step-page-in space-y-5">
      {/* Page header */}
      <header className="step-item-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
            Review queue
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight text-primary">
            Cases under compliance review
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Every submitted stepper case lives here. Open one to drill into the case cockpit.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="queue-refresh"
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {/* Bulk action bar — only rendered when ≥1 case selected */}
      {selectedIds.size > 0 && (
        <section
          data-testid="queue-bulk-actions"
          className="step-item-in sticky top-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/[0.05] px-4 py-3 shadow-[0_8px_22px_rgba(11,143,160,0.12)] backdrop-blur"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-foreground text-[12px] font-semibold">
              {selectedIds.size}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-foreground">
                {selectedIds.size} case{selectedIds.size === 1 ? "" : "s"} selected
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] text-muted-foreground hover:underline"
                data-testid="queue-bulk-clear"
              >
                Clear selection
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              data-testid="queue-bulk-cancel"
            >
              <X className="size-3.5" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => setBulkConfirmOpen(true)}
              data-testid="queue-bulk-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="size-3.5" />
              Delete {selectedIds.size} case{selectedIds.size === 1 ? "" : "s"}
            </Button>
          </div>
        </section>
      )}

      {/* KPI strip — unified band rather than 6 floating cards */}
      <section
        data-testid="queue-kpis"
        className="step-item-in flex flex-wrap items-stretch gap-x-8 gap-y-4 rounded-2xl border bg-surface px-6 py-4 shadow-[0_2px_8px_rgba(12,20,48,0.04)]"
      >
        <Stat label="Total" value={kpis.total} tone="neutral" />
        <StatDivider />
        <Stat label="Submitted" value={kpis.submitted} tone={kpis.submitted > 0 ? "success" : "neutral"} />
        <StatDivider />
        <Stat
          label="Awaiting screening"
          value={kpis.awaitingScreening}
          tone={kpis.awaitingScreening > 0 ? "warn" : "neutral"}
        />
        <StatDivider />
        <Stat
          label="RFI in flight"
          value={kpis.awaitingRfi}
          tone={kpis.awaitingRfi > 0 ? "info" : "neutral"}
        />
        <StatDivider />
        <Stat
          label="Overdue SLA"
          value={kpis.overdueSla}
          tone={kpis.overdueSla > 0 ? "danger" : "neutral"}
          suffix={kpis.overdueSla > 0 ? "breach" : undefined}
        />
        <StatDivider />
        <Stat
          label="High risk"
          value={kpis.highRisk}
          tone={kpis.highRisk > 0 ? "warn" : "neutral"}
        />
      </section>

      {/* Filter + sort bar */}
      <section className="overflow-hidden rounded-2xl border bg-surface shadow-[0_4px_14px_rgba(12,20,48,0.04)]">
        <div className="flex flex-wrap items-center gap-3 border-b bg-gradient-to-r from-[#f7fafc] to-surface px-4 py-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by investor name or case ID"
              className="pl-8"
              data-testid="queue-search"
              aria-label="Search the queue"
            />
          </div>
          <label className="flex items-center gap-1.5 rounded-md border bg-surface px-2.5 py-1.5 text-[11px]">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as QueueSort)}
              className="bg-surface text-[11px] focus:outline-none"
              data-testid="queue-sort"
              aria-label="Sort the queue"
            >
              {(Object.keys(SORT_LABEL) as QueueSort[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 rounded-md border bg-surface px-2.5 py-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={includeInProgress}
              onChange={(e) => setIncludeInProgress(e.target.checked)}
              className="size-3.5"
              data-testid="queue-include-in-progress"
            />
            Include in-progress
          </label>
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5"
          role="group"
          aria-label="Filter the queue"
        >
          <Filter className="size-3 text-muted-foreground" />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-all",
                filter === f.key
                  ? "bg-primary text-primary-foreground shadow-[0_2px_6px_rgba(5,0,68,0.18)] ring-1 ring-primary/40"
                  : "border border-border bg-surface text-muted-foreground hover:border-accent/40 hover:text-foreground",
              )}
              data-testid={`queue-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            {sorted.length} of {cases.length}
          </span>
        </div>

        {/* List */}
        {isLoading ? (
          <SkeletonList />
        ) : sorted.length === 0 ? (
          <EmptyState
            includeInProgress={includeInProgress}
            hasUnsubmitted={cases.some((c) => !c.submittedAt)}
          />
        ) : (
          <ul
            className="space-y-2 p-4"
            role="list"
            aria-label="Compliance case queue"
          >
            {sorted.map((c) => (
              <CaseQueueCard
                key={c.caseId}
                caseData={c}
                selected={selectedIds.has(c.caseId)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </ul>
        )}
      </section>

      <WhatHowWhy
        variant="card"
        what="Ranks submitted cases by SLA urgency, risk band, screening status, and open flags."
        how="Each card's priority reason combines case status, submission age, open flags, risk score, and screening progress. The card's 'Next' line tells you the single most-leveraged action."
        why="Reviewers should focus first on cases that need attention, not only the newest case. Sanctions hits, SLA breaches and high-risk bands all rise to the top automatically."
      />

      <BulkDeleteDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        count={selectedIds.size}
        busy={bulkDelete.isPending}
        onConfirm={() => bulkDelete.mutate(Array.from(selectedIds))}
      />
    </div>
  );

  return (
    <StepCanvas
      intelligenceWidth={360}
      main={main}
      intelligence={
        <QueueAssistantPanel cases={cases} lookup={stateLookup} kpis={kpis} />
      }
    />
  );
}

function BulkDeleteDialog({
  open,
  onOpenChange,
  count,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
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
      <DialogContent className="max-w-md" data-testid="bulk-delete-dialog">
        <DialogHeader>
          <DialogTitle>
            Delete {count} case{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This permanently removes the selected cases and any associated screening, RFIs and
            audit history. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="bulk-delete-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="bulk-delete-confirm"
          >
            <Trash2 className="size-3.5" />
            {busy ? "Deleting…" : `Delete ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warn" | "danger" | "info";
  suffix?: string;
}) {
  const valueClass: Record<typeof tone, string> = {
    neutral: "text-primary",
    success: "text-[color:var(--success)]",
    warn: "text-[color:var(--warn)]",
    danger: "text-destructive",
    info: "text-primary",
  };
  return (
    <div className="min-w-[88px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("text-[26px] font-semibold tabular-nums leading-none", valueClass[tone])}>
          {value}
        </span>
        {suffix && (
          <span className="text-[10px] uppercase tracking-[0.06em] text-destructive">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function StatDivider() {
  return <span className="hidden h-10 w-px self-center bg-border sm:block" aria-hidden />;
}

function SkeletonList() {
  return (
    <ul className="space-y-2 p-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-[112px] rounded-2xl border bg-gradient-to-r from-surface via-surface-muted/40 to-surface pipeline-sweep"
        />
      ))}
    </ul>
  );
}

function EmptyState({
  includeInProgress,
  hasUnsubmitted,
}: {
  includeInProgress: boolean;
  hasUnsubmitted: boolean;
}) {
  return (
    <div className="p-10 text-center">
      <Inbox className="mx-auto size-10 text-muted-foreground" strokeWidth={1.8} />
      <h3 className="mt-2 text-base font-semibold text-primary">
        {hasUnsubmitted && !includeInProgress
          ? "No submitted cases yet"
          : "No cases match the current filters"}
      </h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {hasUnsubmitted && !includeInProgress
          ? "Investors have started the stepper flow but haven't submitted yet. Tick 'Include in-progress' to see them."
          : "Try removing a filter or clearing the search box."}
      </p>
      {hasUnsubmitted && !includeInProgress && (
        <div className="mt-3">
          <StatusChip size="sm" tone="warn" dot={false}>
            {`Hidden in-progress: not visible`}
          </StatusChip>
        </div>
      )}
    </div>
  );
}

// Re-export so consumers don't reach into internals.
export { type StatusTone };
