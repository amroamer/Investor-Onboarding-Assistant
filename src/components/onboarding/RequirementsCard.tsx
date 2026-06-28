import { Folder, CircleDot, CheckCircle2, AlertCircle, ListChecks, Layers } from "lucide-react";
import type { LegalForm } from "@/lib/onboarding/types";
import type { RequirementGroup } from "@/lib/onboarding/requirements";
import { useActiveCase } from "@/lib/onboarding/store";
import { requirementProgress, type RequirementStatus } from "@/lib/onboarding/requirementStatus";
import { useUploadMode, type UploadMode } from "@/lib/onboarding/useUploadMode";
import { DocumentActions } from "./DocumentActions";
import { RequirementUploadButton } from "./RequirementUploadButton";
import { RequirementInfoPopover } from "./RequirementInfoPopover";
import { BulkUploadCard } from "./BulkUploadCard";
import { cn } from "@/lib/utils";

export function RequirementsCard({ legalForm, groups }: { legalForm: LegalForm; groups: RequirementGroup[] }) {
  const { caseData } = useActiveCase();
  const [uploadMode, setUploadMode] = useUploadMode();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const allItems = groups.flatMap((g) => g.items.map((i) => requirementProgress(i.name, caseData)));
  const received = allItems.filter((p) => p.status === "Received").length;
  const attention = allItems.filter((p) => p.status === "Needs attention").length;
  const bulkMode = uploadMode === "bulk";

  return (
    <div className="rounded-lg border bg-surface">
      <div className="space-y-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Documents required — {legalForm}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {bulkMode
                ? "Drop everything into the upload zone — the agent classifies each file and slots it into the right requirement."
                : "Upload each requirement from its row, or switch to “Upload all” to drop multiple files at once."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
              {received} / {total}
            </span>
            {attention > 0 && (
              <span className="rounded bg-[color:var(--attention)]/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[color:var(--attention)]">
                {attention} attention
              </span>
            )}
          </div>
        </div>
        <UploadModeToggle value={uploadMode} onChange={setUploadMode} />
      </div>
      <div className="divide-y">
        {groups.map((g) => (
          <div key={g.party} className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Folder className="size-3.5" /> {g.party}
            </div>
            <ul className="space-y-2.5">
              {g.items.map((it) => {
                const p = requirementProgress(it.name, caseData);
                return (
                  <li key={it.name} className="flex items-start gap-2.5 text-sm">
                    <StatusIcon status={p.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className={cn("text-foreground", p.status === "Received" && "line-through opacity-70")}>{it.name}</span>
                          <RequirementInfoPopover item={it} />
                        </div>
                        <StatusPill status={p.status} />
                      </div>
                      {it.note && <div className="text-xs text-muted-foreground">{it.note}</div>}
                      {p.document && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          File: <span className="text-foreground">{p.document.fileName}</span>
                        </div>
                      )}
                      {p.attentionItem?.investorIssue && (
                        <div className="mt-0.5 text-[11px] text-[color:var(--attention)]">
                          {p.attentionItem.investorIssue}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {p.status === "Pending" && !bulkMode && <RequirementUploadButton variant="full" />}
                        {p.status === "Received" && p.document && <DocumentActions document={p.document} variant="full" />}
                        {p.status === "Needs attention" && p.document && (
                          <>
                            <DocumentActions document={p.document} variant="full" />
                            <RequirementUploadButton variant="full" label="Re-upload" />
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {bulkMode && (
        <div className="border-t px-4 py-3">
          <BulkUploadCard
            variant="dropzone"
            title="Drop all documents here"
            description="PDF, PNG or JPEG. We'll classify each file and assign it to the right requirement above."
          />
        </div>
      )}
    </div>
  );
}

function UploadModeToggle({
  value,
  onChange,
}: {
  value: UploadMode;
  onChange: (m: UploadMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Upload mode"
      className="inline-flex w-fit items-center gap-0.5 rounded-md border bg-surface-muted p-0.5"
    >
      <ModeButton
        active={value === "one-by-one"}
        onClick={() => onChange("one-by-one")}
        icon={<ListChecks className="size-3.5" />}
        label="One by one"
      />
      <ModeButton
        active={value === "bulk"}
        onClick={() => onChange("bulk")}
        icon={<Layers className="size-3.5" />}
        label="Upload all"
      />
    </div>
  );
}

function ModeButton({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
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

function StatusIcon({ status }: { status: RequirementStatus }) {
  if (status === "Received") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />;
  if (status === "Needs attention") return <AlertCircle className="mt-0.5 size-4 shrink-0 text-[color:var(--attention)]" />;
  return <CircleDot className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />;
}

function StatusPill({ status }: { status: RequirementStatus }) {
  if (status === "Received") {
    return <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">Received</span>;
  }
  if (status === "Needs attention") {
    return <span className="shrink-0 rounded bg-[color:var(--attention)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--attention)]">Action</span>;
  }
  return <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pending</span>;
}
