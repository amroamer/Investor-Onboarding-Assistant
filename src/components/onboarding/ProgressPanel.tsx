import { useActiveCase } from "@/lib/onboarding/store";
import type { Stage, StageStatus } from "@/lib/onboarding/types";
import { CheckCircle2, Circle, AlertCircle, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadedFilesPanel } from "./UploadedFilesPanel";
import { RequirementsChecklist } from "./RequirementsChecklist";

const STAGES: Stage[] = [
  "Investor profile",
  "Documents",
  "Ownership and related parties",
  "Source of Wealth and Source of Funds",
  "Declarations",
  "Review and confirmation",
  "Submitted to Compliance",
];

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "Confirmed" || status === "Submitted") return <CheckCircle2 className="size-4 text-accent" />;
  if (status === "Action required") return <AlertCircle className="size-4 text-[color:var(--attention)]" />;
  if (status === "In progress" || status === "Ready for review") return <Loader2 className="size-4 animate-spin text-primary" />;
  return <Circle className="size-4 text-muted-foreground/40" />;
}

export function ProgressPanel() {
  const { caseData } = useActiveCase();
  const required = caseData.checklist.length;
  const received = caseData.checklist.filter((i) => i.status === "Received" || i.status === "Accepted for onboarding review" || i.status === "Replaced" || i.status === "Investor confirmed").length;
  const attention = caseData.checklist.filter((i) => i.status === "Attention required").length;
  const outstanding = caseData.checklist.filter((i) => i.status === "Missing" || i.status === "Required").length;

  return (
    <aside className="flex h-full w-full flex-col border-l bg-surface-muted">
      <div className="border-b bg-surface px-5 py-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Onboarding progress</div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-3xl font-semibold tabular-nums text-primary">{caseData.progressPct}%</div>
          <div className="text-xs text-muted-foreground">complete</div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${caseData.progressPct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-b bg-border">
        <Stat label="Received" value={received} />
        <Stat label="Outstanding" value={outstanding} />
        <Stat label="Attention" value={attention} accent={attention > 0} />
      </div>

      <nav className="scroll-elegant flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {STAGES.map((s) => {
            const status = caseData.stageStatus[s];
            const active = caseData.currentStage === s;
            return (
              <li
                key={s}
                className={cn(
                  "flex items-start gap-3 rounded-md px-3 py-2.5",
                  active && "bg-surface",
                )}
              >
                <div className="mt-0.5"><StageIcon status={status} /></div>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm leading-tight", active && "font-medium")}>{s}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{status}</div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 px-3">
          <RequirementsChecklist />
        </div>

        <div className="mt-4 px-3">
          <UploadedFilesPanel />
        </div>
      </nav>

      <div className="border-t bg-surface px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          <span>Last saved {new Date(caseData.lastSavedAt).toLocaleTimeString()}</span>
        </div>
        <div className="mt-1 text-xs text-accent">Your progress is saved.</div>
        <div className="mt-3 text-xs text-muted-foreground">
          Required items: <span className="text-foreground tabular-nums">{required}</span>
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-surface px-3 py-3 text-center">
      <div className={cn("text-xl font-semibold tabular-nums", accent ? "text-[color:var(--attention)]" : "text-foreground")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
