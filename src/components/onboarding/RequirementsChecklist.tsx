import { useState } from "react";
import { CheckCircle2, AlertCircle, CircleDot, ChevronRight, ChevronDown, FileCheck2, ListChecks, Layers } from "lucide-react";
import { useActiveCase } from "@/lib/onboarding/store";
import { requirementsFor, type RequirementItem } from "@/lib/onboarding/requirements";
import { requirementProgress, type RequirementStatus } from "@/lib/onboarding/requirementStatus";
import { useDispatch } from "@/lib/onboarding/dispatch";
import { useUploadMode, type UploadMode } from "@/lib/onboarding/useUploadMode";
import type { LegalForm } from "@/lib/onboarding/types";
import { DocumentActions } from "./DocumentActions";
import { RequirementUploadButton } from "./RequirementUploadButton";
import { RequirementInfoPopover } from "./RequirementInfoPopover";
import { BulkUploadCard } from "./BulkUploadCard";
import { UnmatchedUploadsTray } from "./UnmatchedUploadsTray";
import { cn } from "@/lib/utils";

const LEGAL_FORMS: { id: LegalForm; label: string }[] = [
  { id: "Individual", label: "Individual" },
  { id: "Limited Partnership", label: "Limited Partnership" },
  { id: "Corporation", label: "Corporation" },
  { id: "Trust", label: "Trust" },
  { id: "Regulated or Listed Entity", label: "Regulated or Listed Entity" },
];

export function RequirementsChecklist() {
  const { caseData } = useActiveCase();
  const { dispatch, isBusy } = useDispatch();
  const [uploadMode, setUploadMode] = useUploadMode();

  if (!caseData.legalForm) {
    return (
      <div className="rounded-md border bg-surface p-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Document checklist</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Tell us the investing party's legal form to see the required documents.
        </p>
        <div className="mt-2.5 flex flex-col gap-1">
          {LEGAL_FORMS.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={isBusy}
              onClick={() => void dispatch({ kind: "user_choice", choiceId: f.id, label: f.label })}
              className="flex w-full items-center justify-between rounded border bg-surface px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:border-accent hover:bg-secondary disabled:opacity-50"
            >
              <span>{f.label}</span>
              <ChevronRight className="size-3 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const groups = requirementsFor(caseData.legalForm);
  const all = groups.flatMap((g) => g.items.map((i) => ({ group: g.party, item: i, progress: requirementProgress(i.name, caseData) })));
  const total = all.length;
  const received = all.filter((a) => a.progress.status === "Received").length;
  const attention = all.filter((a) => a.progress.status === "Needs attention").length;
  const unmatched = caseData.uploadedDocuments.filter(
    (d) => d.matchOutcome && d.matchOutcome !== "matched",
  ).length;
  const bulkMode = uploadMode === "bulk";

  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-surface">
        <div className="space-y-1.5 border-b px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Document checklist</div>
            <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
              <span className="text-foreground">{received} / {total} matched</span>
              {attention > 0 && (
                <span className="rounded bg-[color:var(--attention)]/10 px-1.5 py-0.5 font-medium text-[color:var(--attention)]">{attention} action</span>
              )}
              {unmatched > 0 && (
                <a
                  href="#unmatched-uploads-tray"
                  className="rounded bg-[color:var(--attention)]/10 px-1.5 py-0.5 font-medium text-[color:var(--attention)] underline-offset-2 hover:underline"
                  data-testid="unmatched-counter"
                >
                  {unmatched} unmatched
                </a>
              )}
            </div>
          </div>
          <CompactUploadModeToggle value={uploadMode} onChange={setUploadMode} />
        </div>
        <div className="px-3 py-2">
          <ul className="space-y-2">
            {groups.map((g) => (
              <GroupRow key={g.party} party={g.party} items={g.items} bulkMode={bulkMode} />
            ))}
          </ul>
          {bulkMode && (
            <div className="mt-3 border-t pt-3">
              <BulkUploadCard
                variant="dropzone"
                title="Drop documents here"
                description="We'll classify and slot each file into the right requirement."
              />
            </div>
          )}
        </div>
      </div>
      <div id="unmatched-uploads-tray">
        <UnmatchedUploadsTray />
      </div>
    </div>
  );
}

function CompactUploadModeToggle({
  value,
  onChange,
}: {
  value: UploadMode;
  onChange: (m: UploadMode) => void;
}) {
  return (
    <div className="inline-flex w-fit items-center gap-0.5 rounded border bg-surface-muted p-0.5">
      <CompactModeButton
        active={value === "one-by-one"}
        onClick={() => onChange("one-by-one")}
        icon={<ListChecks className="size-3" />}
        label="One by one"
      />
      <CompactModeButton
        active={value === "bulk"}
        onClick={() => onChange("bulk")}
        icon={<Layers className="size-3" />}
        label="Upload all"
      />
    </div>
  );
}

function CompactModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function GroupRow({ party, items, bulkMode }: { party: string; items: RequirementItem[]; bulkMode: boolean }) {
  const [open, setOpen] = useState(true);
  const { caseData } = useActiveCase();
  const progresses = items.map((i) => requirementProgress(i.name, caseData));
  const groupReceived = progresses.filter((p) => p.status === "Received").length;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="flex-1 truncate">{party}</span>
        <span className="tabular-nums">{groupReceived} / {items.length}</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5 pl-4">
          {items.map((it, idx) => {
            const p = progresses[idx];
            return (
              <li key={it.name} className="flex items-start gap-2 text-xs">
                <StatusDot status={p.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className={cn("flex min-w-0 items-center gap-1 leading-snug text-foreground", p.status === "Received" && "line-through opacity-60")}>
                      <span className="min-w-0 truncate">{it.name}</span>
                      <RequirementInfoPopover item={it} />
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {p.status === "Pending" && !bulkMode && <RequirementUploadButton variant="compact" />}
                      {p.status === "Received" && p.document && <DocumentActions document={p.document} variant="compact" />}
                      {p.status === "Needs attention" && p.document && (
                        <>
                          <DocumentActions document={p.document} variant="compact" />
                          <RequirementUploadButton variant="compact" label="Re-upload" />
                        </>
                      )}
                    </div>
                  </div>
                  {p.document && (
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <FileCheck2 className="size-2.5" /> <span className="truncate">{p.document.fileName}</span>
                    </div>
                  )}
                  {p.attentionItem?.investorIssue && (
                    <div className="mt-0.5 text-[10px] text-[color:var(--attention)]">{p.attentionItem.investorIssue}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function StatusDot({ status }: { status: RequirementStatus }) {
  if (status === "Received") return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" />;
  if (status === "Needs attention") return <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--attention)]" />;
  return <CircleDot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />;
}
