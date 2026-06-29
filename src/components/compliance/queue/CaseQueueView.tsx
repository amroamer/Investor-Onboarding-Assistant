import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { StepCanvas } from "@/components/stepper/intel";
import { useStepperCaseList } from "@/lib/stepper/store";
import { getStepperComplianceState } from "@/server/stepper/compliance";
import type { StepperComplianceState } from "@/lib/stepper/compliance";
import { MetricCard } from "../primitives/MetricCard";
import { StatusChip, type StatusTone } from "../primitives/StatusChip";
import { WhatHowWhy } from "../primitives/WhatHowWhy";
import { CaseQueueCard } from "./CaseQueueCard";
import { QueueAssistantPanel } from "./QueueAssistantPanel";
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

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [sort, setSort] = useState<QueueSort>("submitted-newest");

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

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Total"
          count={kpis.total}
          tone="info"
          icon={<Inbox className="size-3" />}
        />
        <MetricCard
          label="Submitted"
          count={kpis.submitted}
          tone={kpis.submitted > 0 ? "success" : "neutral"}
          icon={<CheckCircle2 className="size-3" />}
        />
        <MetricCard
          label="Awaiting screening"
          count={kpis.awaitingScreening}
          tone={kpis.awaitingScreening > 0 ? "warn" : "neutral"}
          icon={<Sparkles className="size-3" />}
        />
        <MetricCard
          label="RFI in flight"
          count={kpis.awaitingRfi}
          tone={kpis.awaitingRfi > 0 ? "info" : "neutral"}
        />
        <MetricCard
          label="Overdue SLA"
          count={kpis.overdueSla}
          tone={kpis.overdueSla > 0 ? "danger" : "neutral"}
          icon={<Clock className="size-3" />}
          chip={kpis.overdueSla > 0 ? { tone: "danger", label: "breach" } : undefined}
        />
        <MetricCard
          label="High risk"
          count={kpis.highRisk}
          tone={kpis.highRisk > 0 ? "warn" : "neutral"}
          icon={<ShieldAlert className="size-3" />}
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
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
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
              <CaseQueueCard key={c.caseId} caseData={c} />
            ))}
          </ul>
        )}
      </section>

      <WhatHowWhy
        variant="card"
        what="Every submitted stepper case is here, ranked by the same SLA + risk signals the cockpit uses."
        how="Filter chips narrow by outcome and state; sort options swap the priority dimension. Click any card to open the full case cockpit."
        why="A queue keeps reviewer attention on the cases that need it — not the most recent one that happened to be picked from a dropdown."
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
