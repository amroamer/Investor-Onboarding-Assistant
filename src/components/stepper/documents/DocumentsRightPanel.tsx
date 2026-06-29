import { useState, type ReactNode } from "react";
import { CheckCircle2, Circle, AlertCircle, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RequirementItem } from "@/lib/stepper/requirements";
import type {
  ChecklistItem,
  StepperCase,
  StepperUploadedDocument,
  ProcessingPhase,
} from "@/lib/stepper/types";
import { humaniseAuditEvent, recentDocEvents, formatRelative } from "@/components/stepper/intel";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";

interface Props {
  caseData: StepperCase;
  requirements: RequirementItem[];
  checklistByReq: Map<string, ChecklistItem>;
  satisfied: number;
  inFlightReqKeys: Set<string>;
  inFlightDoc?: StepperUploadedDocument;
  isUploading: boolean;
}

/**
 * Sticky right-hand workspace panel. Single tall card, three stacked sections,
 * deliberately bounded in height so it never out-grows the main column.
 *
 *   1. Live status — current phase + progress bar (the "is anything happening?" answer)
 *   2. Checklist  — every requirement, jump-to-slot on click
 *   3. Cross-doc checks + recent agent activity (scrollable, capped)
 */
export function DocumentsRightPanel({
  caseData,
  requirements,
  checklistByReq,
  satisfied,
  inFlightReqKeys,
  inFlightDoc,
  isUploading,
}: Props) {
  const total = requirements.length;
  const pct = total === 0 ? 0 : Math.round((satisfied / total) * 100);
  const allDone = satisfied === total;
  const attentionCount = Array.from(checklistByReq.values()).filter(
    (c) => c.status === "attention",
  ).length;
  const flags = caseData.crossDocFlags;
  const live = isUploading || !!inFlightDoc;

  return (
    <aside data-testid="documents-right-panel" className="hidden lg:block">
      <div className="sticky top-6 overflow-hidden rounded-xl border bg-surface shadow-sm">
        {/* 1 — Live status header */}
        <div className={cn("border-b px-4 py-4", live && "bg-primary/[0.03]")}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {live ? "Working…" : allDone ? "Complete" : "Progress"}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {satisfied}/{total}
            </div>
          </div>

          {live && inFlightDoc ? (
            <LiveRow doc={inFlightDoc} />
          ) : (
            <div className="mt-2 flex items-baseline gap-1">
              <span
                className={cn(
                  "text-3xl font-light tabular-nums",
                  allDone ? "text-accent" : "text-foreground",
                )}
              >
                {pct}
              </span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          )}

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              data-testid="right-panel-progress"
              className={cn(
                "h-full rounded-full transition-all duration-500",
                allDone ? "bg-accent" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>

          {attentionCount > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-[color:var(--attention)]/10 px-2.5 py-1.5 text-xs text-[color:var(--attention)]">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{attentionCount} need your attention</span>
            </div>
          )}
        </div>

        {/* 2 — Checklist */}
        <div className="border-b px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Checklist
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {requirements.map((r) => {
              const item = checklistByReq.get(r.key);
              const status: "ok" | "attention" | "in_flight" | "pending" =
                item && item.status !== "attention"
                  ? "ok"
                  : item?.status === "attention"
                    ? "attention"
                    : inFlightReqKeys.has(r.key)
                      ? "in_flight"
                      : "pending";
              return (
                <li
                  key={r.key}
                  data-testid={`right-panel-item-${r.key}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <RowIcon status={status} />
                  <a
                    href={`#slot-${r.key}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.querySelector(`[data-testid='slot-${r.key}']`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    className={cn(
                      "min-w-0 flex-1 truncate transition-colors hover:text-foreground",
                      status === "ok" && "text-muted-foreground line-through",
                      status === "attention" && "text-[color:var(--attention)]",
                      status === "pending" && "text-foreground/80",
                      status === "in_flight" && "text-primary",
                    )}
                  >
                    {r.name}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 3 — Tabbed bottom section: checks vs activity (keeps height bounded) */}
        <BottomTabs caseData={caseData} flags={flags} satisfied={satisfied} />
      </div>
    </aside>
  );
}

function BottomTabs({
  caseData,
  flags,
  satisfied,
}: {
  caseData: StepperCase;
  flags: StepperCase["crossDocFlags"];
  satisfied: number;
}) {
  const [tab, setTab] = useState<"activity" | "checks">("activity");
  const events = recentDocEvents(caseData.audit, 8);
  const { openDocument } = useDocumentViewer();

  // Match each audit row against an uploaded doc by filename so rows about a
  // specific document become clickable openers.
  const matchUpload = (e: { detail: string }) => {
    for (const d of caseData.uploadedDocuments) {
      if (e.detail.includes(d.fileName)) return d;
    }
    return undefined;
  };

  return (
    <div>
      <div className="flex border-b text-[10px] font-medium uppercase tracking-wider">
        <TabBtn
          active={tab === "activity"}
          onClick={() => setTab("activity")}
          icon={<Sparkles className="size-3" />}
        >
          Activity
        </TabBtn>
        <TabBtn
          active={tab === "checks"}
          onClick={() => setTab("checks")}
          icon={<ShieldCheck className="size-3" />}
        >
          Checks
          {flags.length > 0 && (
            <span className="ml-1 rounded-full bg-[color:var(--attention)]/15 px-1.5 py-0.5 text-[9px] text-[color:var(--attention)]">
              {flags.length}
            </span>
          )}
        </TabBtn>
      </div>

      <div className="max-h-72 overflow-y-auto px-4 py-3">
        {tab === "activity" ? (
          events.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Drop your first document to see the agent's work here.
            </div>
          ) : (
            <ol className="space-y-2.5 text-xs">
              {events.map((e) => {
                const upload = matchUpload(e);
                return (
                  <li key={e.id} data-testid={`agent-log-${e.id}`} className="relative pl-3.5">
                    <span className="absolute left-0 top-1.5 size-1.5 rounded-full bg-primary/60" />
                    {upload ? (
                      <button
                        type="button"
                        onClick={() =>
                          openDocument({
                            docId: upload.id,
                            fileName: upload.fileName,
                            defaultTab: "pdf",
                          })
                        }
                        className="w-full cursor-pointer text-left text-foreground/90 transition-colors hover:text-accent hover:underline"
                      >
                        {humaniseAuditEvent(e)}
                      </button>
                    ) : (
                      <div className="text-foreground/90">{humaniseAuditEvent(e)}</div>
                    )}
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {formatRelative(e.at)}
                    </div>
                  </li>
                );
              })}
            </ol>
          )
        ) : flags.length === 0 ? (
          satisfied === 0 ? (
            <div className="text-xs text-muted-foreground">
              Cross-document checks run after the first upload.
            </div>
          ) : (
            <div className="space-y-1.5 text-xs">
              <CheckRow label="Name consistent across uploads" ok />
              <CheckRow label="No expired documents" ok />
              <CheckRow label="No duplicate uploads" ok />
            </div>
          )
        ) : (
          <ul className="space-y-1.5 text-xs">
            {flags.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[color:var(--attention)]">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{f.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function LiveRow({ doc }: { doc: StepperUploadedDocument }) {
  const phaseLabel: Record<ProcessingPhase, string> = {
    pending: "Queued…",
    reading: "Reading document…",
    classifying: "Classifying…",
    matching: "Matching to checklist…",
    ready: "Done",
    failed: "Failed",
    duplicate: "Duplicate",
  };
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2">
        <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
        <div
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
          title={doc.fileName}
        >
          {doc.fileName}
        </div>
      </div>
      <div className="doc-typing inline-block pl-6 text-xs text-primary">
        {phaseLabel[doc.processingPhase]}
      </div>
    </div>
  );
}

function RowIcon({ status }: { status: "ok" | "attention" | "in_flight" | "pending" }) {
  if (status === "ok") {
    return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" />;
  }
  if (status === "attention") {
    return <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--attention)]" />;
  }
  if (status === "in_flight") {
    return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />;
  }
  return <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40" />;
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" />
      ) : (
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--attention)]" />
      )}
      <span className="min-w-0 flex-1 text-foreground/80">{label}</span>
    </div>
  );
}
