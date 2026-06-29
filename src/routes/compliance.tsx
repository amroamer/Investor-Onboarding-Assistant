/**
 * Compliance workspace — single route, three states driven by query params:
 *   - default:           queue of every submitted stepper case
 *   - ?case=STP-...      cockpit drill-in for one case
 *   - ?legacy=key        legacy chat-flow demo case (back-compat)
 *
 * Routing via query params keeps the URL hierarchy flat and sidesteps
 * TanStack Router's parent/child Outlet plumbing.
 */
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, Fragment, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCaseStore, type CaseKey } from "@/lib/onboarding/store";
import { useStepperStore, useStepperCase } from "@/lib/stepper/store";
import { investorDisplayName } from "@/lib/onboarding/engine";
import { StepperComplianceView } from "@/components/compliance/StepperComplianceView";
import { DocumentViewerProvider } from "@/components/stepper/DocumentViewer";
import { CaseQueueView } from "@/components/compliance/queue/CaseQueueView";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  AlertTriangle,
  FileText,
  Users,
  Network,
  ListChecks,
  ScrollText,
  Plus,
  Send,
  CheckCircle2,
  MessageSquare,
  History,
} from "lucide-react";
import { MgxLogo } from "@/components/Brand";
import { cn } from "@/lib/utils";
import { addRfiDraft, sendRfis, markRfiResolved } from "@/server/rfi";
import { runScreening, syncScreeningList } from "@/server/screening";
import type { OnboardingCase, ScreeningMatch, NameToScreen } from "@/lib/onboarding/types";

interface ComplianceSearch {
  case?: string;
  legacy?: CaseKey;
}

export const Route = createFileRoute("/compliance")({
  validateSearch: (s: Record<string, unknown>): ComplianceSearch => {
    const out: ComplianceSearch = {};
    if (typeof s.case === "string" && s.case.length > 0) out.case = s.case;
    if (s.legacy === "new-corporate" || s.legacy === "returning-lp") {
      out.legacy = s.legacy;
    }
    return out;
  },
  head: () => ({
    meta: [
      { title: "Compliance workspace — MGX (demo)" },
      {
        name: "description",
        content: "Compliance review workspace for investor onboarding cases (demo).",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComplianceWorkspace,
});

function ComplianceWorkspace() {
  const search = useSearch({ from: "/compliance" });
  const { cases: legacyCases } = useCaseStore();
  const [includeInProgress, setIncludeInProgress] = useState(false);

  // CASE drill-in
  if (search.case) {
    return <CockpitView caseId={search.case} />;
  }

  // LEGACY chat-flow view
  if (search.legacy) {
    return (
      <LegacyShell>
        <LegacyComplianceView caseData={legacyCases[search.legacy]} />
        <div className="mt-10 text-center text-[11px] text-muted-foreground">
          Looking for live stepper cases?{" "}
          <Link to="/compliance" className="font-semibold text-accent hover:underline">
            Return to the queue →
          </Link>
        </div>
      </LegacyShell>
    );
  }

  // QUEUE (default)
  return (
    <QueueShell>
      <CaseQueueView
        includeInProgress={includeInProgress}
        setIncludeInProgress={setIncludeInProgress}
      />
      <LegacyFooterLink />
    </QueueShell>
  );
}

/* ─── Shells ───────────────────────────────────────────────────────────── */

function QueueShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b bg-primary px-6 text-primary-foreground">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Go to MGX home"
            className="rounded outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MgxLogo className="h-5 w-auto" />
          </Link>
          <div className="h-5 w-px bg-primary-foreground/20" />
          <div>
            <div className="text-sm font-semibold tracking-tight">Compliance workspace</div>
            <div className="text-[11px] text-primary-foreground/70">
              Demo · internal view · not accessible from investor portal
            </div>
          </div>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          <Link to="/">
            <ArrowLeft className="size-3.5" /> Home
          </Link>
        </Button>
      </header>
      <div className="mx-auto w-full max-w-[1560px] px-4 sm:px-6 lg:px-8 py-6 pb-28">{children}</div>
    </div>
  );
}

function LegacyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b bg-primary px-6 text-primary-foreground">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Go to MGX home"
            className="rounded outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MgxLogo className="h-5 w-auto" />
          </Link>
          <div className="h-5 w-px bg-primary-foreground/20" />
          <div>
            <div className="text-sm font-semibold tracking-tight">Compliance workspace</div>
            <div className="text-[11px] text-primary-foreground/70">
              Legacy demo · chat-flow case
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LegacySelect />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/compliance">
              <ArrowLeft className="size-3.5" /> Queue
            </Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 pb-24">{children}</div>
    </div>
  );
}

/* ─── Cockpit drill-in (?case=STP-...) ─────────────────────────────────── */

function CockpitView({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  const { cases } = useStepperStore();
  const { caseData } = useStepperCase(caseId);
  const otherCases = cases.filter((c) => c.caseId !== caseId);

  // If the user opens a deleted case, bounce back to the queue.
  useEffect(() => {
    if (cases.length > 0 && !cases.some((c) => c.caseId === caseId)) {
      void navigate({ to: "/compliance" });
    }
  }, [cases, caseId, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b bg-primary px-6 text-primary-foreground">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Go to MGX home"
            className="rounded outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MgxLogo className="h-5 w-auto" />
          </Link>
          <div className="h-5 w-px bg-primary-foreground/20" />
          <div>
            <div className="text-sm font-semibold tracking-tight">Compliance workspace</div>
            <div className="text-[11px] text-primary-foreground/70">
              {caseData?.profile?.investorName ?? caseId}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {otherCases.length > 0 && (
            <select
              value={caseId}
              onChange={(e) =>
                navigate({
                  to: "/compliance",
                  search: { case: e.target.value } as ComplianceSearch,
                })
              }
              className="rounded-md border border-primary-foreground/20 bg-primary px-2 py-1 text-xs text-primary-foreground"
              data-testid="case-quick-switch"
              aria-label="Jump to another case"
            >
              <option value={caseId}>
                {caseData?.profile?.investorName ?? caseId} (this case)
              </option>
              <optgroup label="Other cases">
                {otherCases.map((c) => (
                  <option key={c.caseId} value={c.caseId}>
                    {c.profile?.investorName || `Case ${c.caseId}`}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/compliance" data-testid="case-breadcrumb-queue">
              <ArrowLeft className="size-3.5" /> All cases
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1560px] px-4 sm:px-6 lg:px-8 py-6 pb-28">
        {!caseData ? (
          <div className="rounded-lg border bg-surface p-6 text-sm text-muted-foreground">
            Loading case {caseId}…
          </div>
        ) : (
          <DocumentViewerProvider>
            <StepperComplianceView caseData={caseData} />
          </DocumentViewerProvider>
        )}
      </div>
    </div>
  );
}

/* ─── Legacy footer link (queue page) ──────────────────────────────────── */

function LegacyFooterLink() {
  const { cases: legacyCases } = useCaseStore();
  return (
    <section
      data-testid="legacy-footer-link"
      className="mt-8 rounded-2xl border border-dashed bg-surface-muted/40 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground">
            <History className="size-4" />
          </span>
          <div>
            <div className="text-[12.5px] font-semibold text-foreground">
              Legacy chat-flow demo cases
            </div>
            <div className="text-[11px] text-muted-foreground">
              The original conversational onboarding prototype. Kept for back-compat with
              regression tests.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/compliance" search={{ legacy: "new-corporate" } as ComplianceSearch}>
              {investorDisplayName(legacyCases["new-corporate"])}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/compliance" search={{ legacy: "returning-lp" } as ComplianceSearch}>
              {investorDisplayName(legacyCases["returning-lp"])}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function LegacySelect() {
  const navigate = useNavigate();
  const { cases: legacyCases } = useCaseStore();
  const search = useSearch({ from: "/compliance" });
  const active = search.legacy ?? "new-corporate";
  return (
    <select
      value={active}
      onChange={(e) =>
        navigate({
          to: "/compliance",
          search: { legacy: e.target.value as CaseKey } as ComplianceSearch,
        })
      }
      className="rounded-md border border-primary-foreground/20 bg-primary px-2 py-1 text-xs text-primary-foreground"
      data-testid="legacy-case-select"
      aria-label="Legacy demo case"
    >
      <option value="new-corporate">{investorDisplayName(legacyCases["new-corporate"])}</option>
      <option value="returning-lp">{investorDisplayName(legacyCases["returning-lp"])}</option>
    </select>
  );
}

/* ─── Legacy chat-flow view ────────────────────────────────────────────── */

function LegacyComplianceView({ caseData }: { caseData: OnboardingCase }) {
  const [tab, setTab] = useState<"overview" | "flags" | "names" | "rfi" | "audit">("overview");
  const co = caseData.complianceOnly;

  const outcomeColor =
    co.suggestedOutcome === "PASS"
      ? "bg-accent text-accent-foreground"
      : co.suggestedOutcome === "FAIL"
        ? "bg-destructive text-destructive-foreground"
        : "bg-[color:var(--attention)] text-[color:var(--attention-foreground)]";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Case
          </div>
          <h1 className="text-2xl font-medium text-foreground">{investorDisplayName(caseData)}</h1>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {caseData.legalForm} · {caseData.jurisdiction} · {caseData.caseId}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-4 min-w-[260px]">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            AI-generated recommendation
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", outcomeColor)}>
              Suggested{" "}
              {co.suggestedOutcome === "PENDING"
                ? "PENDING — further information"
                : co.suggestedOutcome}
            </span>
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums text-primary">{co.riskScore}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Internal risk score · {co.riskBand}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            AI-generated recommendation for compliance review. Final determination must be made by
            an authorised compliance officer.
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b">
        {(
          [
            ["overview", "Overview", <FileText className="size-3.5" />],
            ["flags", "Red flags", <AlertTriangle className="size-3.5" />],
            ["names", "Screening", <Users className="size-3.5" />],
            ["rfi", "Further information", <ListChecks className="size-3.5" />],
            ["audit", "Audit trail", <ScrollText className="size-3.5" />],
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              tab === k
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <LegacyOverviewTab caseData={caseData} />}
        {tab === "flags" && <LegacyFlagsTab caseData={caseData} />}
        {tab === "names" && <LegacyNamesTab caseData={caseData} />}
        {tab === "rfi" && <LegacyRfiTab caseData={caseData} />}
        {tab === "audit" && <LegacyAuditTab caseData={caseData} />}
      </div>
    </>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-surface">
      <div className="flex items-center gap-2 border-b bg-surface-muted px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LegacyOverviewTab({
  caseData,
}: {
  caseData: ReturnType<typeof useCaseStore>["cases"][CaseKey];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Confirmed investor data" icon={<FileText className="size-3.5" />}>
        <ul className="divide-y text-sm">
          <Row label="Legal name" value={caseData.investorName} />
          <Row label="Legal form" value={caseData.legalForm ?? "—"} />
          <Row label="Jurisdiction" value={caseData.jurisdiction ?? "—"} />
          <Row label="Primary contact" value={caseData.primaryContact} />
          <Row
            label="Source of Wealth"
            value={caseData.sourceOfWealth?.category ?? "Outstanding"}
          />
          <Row label="Source of Funds" value={caseData.sourceOfFunds?.category ?? "Outstanding"} />
          <Row
            label="PEP declaration"
            value={caseData.pepConfirmed ? "Submitted" : "Outstanding"}
          />
          <Row label="FATCA / CRS" value={caseData.fatcaConfirmed ? "Confirmed" : "Outstanding"} />
          <Row
            label="Submission"
            value={
              caseData.submittedAt
                ? new Date(caseData.submittedAt).toLocaleString()
                : "Not yet submitted"
            }
          />
        </ul>
      </Section>
      <Section title="Document register" icon={<FileText className="size-3.5" />}>
        <ul className="divide-y text-sm">
          {caseData.uploadedDocuments.map((d) => (
            <li key={d.id} className="flex items-baseline justify-between gap-2 py-2">
              <div>
                <div>{d.classifiedAs}</div>
                <div className="text-xs text-muted-foreground">
                  {d.fileName} · {d.party}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">Received</div>
            </li>
          ))}
          {caseData.uploadedDocuments.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">No documents uploaded yet.</li>
          )}
        </ul>
      </Section>
      <Section title="Ownership structure" icon={<Network className="size-3.5" />}>
        <ul className="divide-y text-sm">
          {caseData.relatedParties.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between py-2">
              <div>
                <div>{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.role}
                  {p.pepProvisional ? " · Provisional PEP indicator" : ""}
                </div>
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {p.ownershipPct != null ? `${p.ownershipPct}%` : "—"}
              </div>
            </li>
          ))}
          {caseData.relatedParties.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">
              No related parties identified yet.
            </li>
          )}
        </ul>
      </Section>
      <Section title="Checklist status" icon={<ListChecks className="size-3.5" />}>
        <ul className="divide-y text-sm">
          {caseData.checklist.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-2 py-2">
              <div>
                <div>{i.name}</div>
                <div className="text-xs text-muted-foreground">{i.party}</div>
              </div>
              <div className="text-xs text-muted-foreground">{i.status}</div>
            </li>
          ))}
          {caseData.checklist.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">No checklist items yet.</li>
          )}
        </ul>
      </Section>
    </div>
  );
}

function LegacyFlagsTab({
  caseData,
}: {
  caseData: ReturnType<typeof useCaseStore>["cases"][CaseKey];
}) {
  const flags = caseData.complianceOnly.redFlags;
  if (flags.length === 0)
    return (
      <div className="rounded-lg border bg-surface p-6 text-sm text-muted-foreground">
        No internal red flags identified.
      </div>
    );
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-surface-muted text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5">Flag</th>
            <th className="px-4 py-2.5">Related party</th>
            <th className="px-4 py-2.5">Severity</th>
            <th className="px-4 py-2.5">Evidence</th>
            <th className="px-4 py-2.5">Recommended action</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.id} className="border-b last:border-b-0">
              <td className="px-4 py-3 align-top">
                <div className="font-medium">{f.description}</div>
                <div className="text-xs text-muted-foreground">
                  {f.category} · Rule {f.rule}
                </div>
              </td>
              <td className="px-4 py-3 align-top text-sm">{f.relatedParty ?? "—"}</td>
              <td className="px-4 py-3 align-top">
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs",
                    f.severity === "High" && "bg-destructive/10 text-destructive",
                    f.severity === "Medium" &&
                      "bg-[color:var(--attention)]/15 text-[color:var(--attention)]",
                    f.severity === "Low" && "bg-secondary text-foreground",
                  )}
                >
                  {f.severity}
                </span>
              </td>
              <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                {f.evidence}
                {f.sourceDoc && <div className="mt-0.5">Source: {f.sourceDoc}</div>}
              </td>
              <td className="px-4 py-3 align-top text-xs">{f.recommendedAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegacyNamesTab({
  caseData,
}: {
  caseData: ReturnType<typeof useCaseStore>["cases"][CaseKey];
}) {
  const queryClient = useQueryClient();
  const names = caseData.complianceOnly.namesToScreen;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const splice = (updated: OnboardingCase) => {
    queryClient.setQueryData<Record<CaseKey, OnboardingCase>>(["cases"], (prev) => {
      if (!prev) return prev;
      const k = (Object.keys(prev) as CaseKey[]).find(
        (kk) => prev[kk].caseId === caseData.caseId,
      );
      if (!k) return prev;
      return { ...prev, [k]: updated };
    });
  };

  const onSync = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = (await syncScreeningList({
        data: { caseId: caseData.caseId },
      })) as OnboardingCase;
      splice(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const onRun = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = (await runScreening({
        data: { caseId: caseData.caseId },
      })) as OnboardingCase;
      splice(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screening failed.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRow = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const ready = names.filter((n) => n.screeningStatus === "Ready for screening").length;
  const completed = names.filter((n) => n.screeningStatus === "Screening completed").length;
  const failed = names.filter((n) => n.screeningStatus === "Screening failed").length;
  const totalHits = names.reduce((sum, n) => sum + (n.matches?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-4">
        <div className="text-xs text-muted-foreground">
          {names.length === 0 ? (
            "No names yet. Run sync to pull related parties + the investor entity into the screening list."
          ) : (
            <>
              <span className="text-foreground">{names.length}</span> name
              {names.length === 1 ? "" : "s"} · <span className="text-foreground">{ready}</span>{" "}
              ready · <span className="text-foreground">{completed}</span> screened ·{" "}
              {failed > 0 && (
                <>
                  <span className="text-destructive">{failed}</span> failed ·{" "}
                </>
              )}
              <span
                className={cn(totalHits > 0 ? "text-[color:var(--attention)]" : "text-foreground")}
              >
                {totalHits}
              </span>{" "}
              hit{totalHits === 1 ? "" : "s"}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onSync}
            data-testid="screening-sync"
          >
            Sync from case
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
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {names.length === 0 ? (
        <div className="rounded-lg border bg-surface p-6 text-sm text-muted-foreground">
          No names ready for screening yet. Click <strong>Sync from case</strong> to populate from
          the related parties already on file.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-surface-muted text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Country</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Hits</th>
              </tr>
            </thead>
            <tbody>
              {names.map((n, i) => {
                const key = `${n.name}_${i}`;
                const isExpanded = expanded.has(key);
                const hitCount = n.matches?.length ?? 0;
                return (
                  <Fragment key={key}>
                    <tr
                      className="border-b last:border-b-0 cursor-pointer hover:bg-surface-muted"
                      data-testid="screening-row"
                      onClick={() => toggleRow(key)}
                    >
                      <td className="px-4 py-2.5 font-medium">{n.name}</td>
                      <td className="px-4 py-2.5">{n.partyType}</td>
                      <td className="px-4 py-2.5">{n.role}</td>
                      <td className="px-4 py-2.5">{n.country ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <LegacyScreeningBadge entry={n} />
                      </td>
                      <td className="px-4 py-2.5">
                        {n.screeningStatus === "Screening completed" ? (
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs",
                              hitCount > 0
                                ? "bg-destructive/10 text-destructive"
                                : "bg-accent/10 text-accent",
                            )}
                          >
                            {hitCount} {hitCount === 1 ? "hit" : "hits"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b bg-surface-muted/40">
                        <td colSpan={6} className="px-4 py-3">
                          <LegacyScreeningDetails entry={n} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border bg-secondary p-4 text-xs leading-relaxed text-secondary-foreground">
        Screening is performed against{" "}
        <a
          href="https://www.opensanctions.org/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          OpenSanctions
        </a>
        , a real-world sanctions + PEP dataset.
      </div>
    </div>
  );
}

function LegacyScreeningBadge({ entry }: { entry: NameToScreen }) {
  const s = entry.screeningStatus;
  const className = cn(
    "rounded px-2 py-0.5 text-xs",
    s === "Screening completed" && (entry.matches?.length ?? 0) > 0
      ? "bg-[color:var(--attention)]/15 text-[color:var(--attention)]"
      : s === "Screening completed"
        ? "bg-accent/10 text-accent"
        : s === "Screening failed"
          ? "bg-destructive/10 text-destructive"
          : "bg-secondary text-foreground",
  );
  return <span className={className}>{s}</span>;
}

function LegacyScreeningDetails({ entry }: { entry: NameToScreen }) {
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
        No matches on {entry.provider ?? "the screening provider"}.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {entry.matches.length} match{entry.matches.length === 1 ? "" : "es"}
      </div>
      <ul className="space-y-2">
        {entry.matches.map((m) => (
          <LegacyMatchRow key={m.id} match={m} />
        ))}
      </ul>
    </div>
  );
}

function LegacyMatchRow({ match }: { match: ScreeningMatch }) {
  return (
    <li className="rounded border bg-background px-3 py-2" data-testid="screening-match">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">{match.caption}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          score {Math.round((match.score ?? 0) * 100)}%
        </div>
      </div>
    </li>
  );
}

function LegacyRfiTab({
  caseData,
}: {
  caseData: ReturnType<typeof useCaseStore>["cases"][CaseKey];
}) {
  const queryClient = useQueryClient();
  const items = caseData.complianceOnly.furtherInfoRequests;
  const drafts = items.filter((r) => r.status === "draft");
  const sent = items.filter((r) => r.status === "sent");
  const responded = items.filter((r) => r.status === "responded");
  const resolved = items.filter((r) => r.status === "resolved");

  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(
    () => new Set(drafts.filter((d) => d.selected).map((d) => d.id)),
  );
  const [newDraft, setNewDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const splice = (updated: OnboardingCase) => {
    queryClient.setQueryData<Record<CaseKey, OnboardingCase>>(["cases"], (prev) => {
      if (!prev) return prev;
      const k = (Object.keys(prev) as CaseKey[]).find(
        (kk) => prev[kk].caseId === caseData.caseId,
      );
      if (!k) return prev;
      return { ...prev, [k]: updated };
    });
  };

  const onAddDraft = async () => {
    if (!newDraft.trim()) {
      setError("Write the request text first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = (await addRfiDraft({
        data: { caseId: caseData.caseId, text: newDraft },
      })) as OnboardingCase;
      splice(updated);
      setNewDraft("");
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
      const updated = (await sendRfis({
        data: { caseId: caseData.caseId, rfiIds: Array.from(selectedDraftIds) },
      })) as OnboardingCase;
      splice(updated);
      setSelectedDraftIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send RFIs.");
    } finally {
      setBusy(false);
    }
  };

  const onResolve = async (rfiId: string, note?: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = (await markRfiResolved({
        data: { caseId: caseData.caseId, rfiId, note },
      })) as OnboardingCase;
      splice(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark resolved.");
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-surface p-6 text-sm text-muted-foreground">
          No further information requests have been drafted yet.
        </div>
        <LegacyDraftComposer
          value={newDraft}
          onChange={setNewDraft}
          onAdd={onAddDraft}
          busy={busy}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {drafts.length > 0 && (
        <Section title={`Drafts (${drafts.length})`} icon={<ListChecks className="size-3.5" />}>
          <ul className="space-y-2">
            {drafts.map((r) => (
              <li
                key={r.id}
                data-testid="rfi-draft"
                className="flex items-start gap-3 rounded-md border bg-background px-3 py-2.5"
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
          <div className="mt-4 flex items-center justify-between gap-2">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              size="sm"
              disabled={busy || selectedDraftIds.size === 0}
              onClick={onSendSelected}
              data-testid="rfi-send-selected"
            >
              <Send className="size-3.5" /> Send to investor ({selectedDraftIds.size})
            </Button>
          </div>
        </Section>
      )}

      {sent.length > 0 && (
        <Section
          title={`Sent — awaiting response (${sent.length})`}
          icon={<MessageSquare className="size-3.5" />}
        >
          <ul className="space-y-2">
            {sent.map((r) => (
              <li
                key={r.id}
                data-testid="rfi-sent"
                className="rounded-md border bg-background px-3 py-2.5"
              >
                <div className="text-sm">{r.text}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Sent {r.sentAt && new Date(r.sentAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {responded.length > 0 && (
        <Section
          title={`Responded — review (${responded.length})`}
          icon={<MessageSquare className="size-3.5" />}
        >
          <ul className="space-y-3">
            {responded.map((r) => (
              <li
                key={r.id}
                data-testid="rfi-responded"
                className="rounded-md border bg-background px-3 py-2.5"
              >
                <div className="text-sm">{r.text}</div>
                {r.investorResponseText && (
                  <div className="mt-2 rounded border bg-surface px-2 py-1.5 text-xs">
                    <span className="font-medium text-foreground">Investor response:</span>{" "}
                    <span className="text-muted-foreground">{r.investorResponseText}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
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
        </Section>
      )}

      {resolved.length > 0 && (
        <Section
          title={`Resolved (${resolved.length})`}
          icon={<CheckCircle2 className="size-3.5" />}
        >
          <ul className="space-y-2">
            {resolved.map((r) => (
              <li key={r.id} className="rounded-md border bg-background px-3 py-2.5 opacity-70">
                <div className="text-sm">{r.text}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <LegacyDraftComposer
        value={newDraft}
        onChange={setNewDraft}
        onAdd={onAddDraft}
        busy={busy}
        error={drafts.length > 0 ? null : error}
      />
    </div>
  );
}

function LegacyDraftComposer({
  value,
  onChange,
  onAdd,
  busy,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-lg border bg-surface p-4" data-testid="rfi-draft-composer">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        New request draft
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder='e.g. "Please provide a proof of address dated within the last six months."'
        data-testid="rfi-draft-input"
        className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !value.trim()}
          onClick={onAdd}
          data-testid="rfi-add-draft"
        >
          <Plus className="size-3.5" /> Add draft
        </Button>
      </div>
    </div>
  );
}

function LegacyAuditTab({
  caseData,
}: {
  caseData: ReturnType<typeof useCaseStore>["cases"][CaseKey];
}) {
  if (caseData.audit.length === 0) {
    return (
      <div className="rounded-lg border bg-surface p-6 text-sm text-muted-foreground">
        No audit events recorded yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <ul className="divide-y text-sm">
        {[...caseData.audit].reverse().map((a) => (
          <li key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <div>
              <div className="font-medium">{a.type}</div>
              <div className="text-xs text-muted-foreground">{a.detail}</div>
            </div>
            <div className="text-right">
              <div className="text-xs">{a.actor}</div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(a.at).toLocaleString()}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </li>
  );
}
