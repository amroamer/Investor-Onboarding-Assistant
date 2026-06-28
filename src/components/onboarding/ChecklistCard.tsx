import type { ChecklistItem } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import { FileText, AlertTriangle, CheckCircle2, Upload, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<ChecklistItem["status"], string> = {
  "Required": "text-muted-foreground",
  "Received": "text-accent",
  "Under review": "text-muted-foreground",
  "Needs review": "text-[color:var(--attention)]",
  "Accepted for onboarding review": "text-accent",
  "Attention required": "text-[color:var(--attention)]",
  "Missing": "text-[color:var(--attention)]",
  "Replaced": "text-accent",
  "Investor confirmed": "text-accent",
};

export function ChecklistCard({ items, onProvide, onReplace }: { items: ChecklistItem[]; onProvide: (id: string) => void; onReplace: (id: string) => void }) {
  if (items.length === 0) {
    return <div className="rounded-lg border bg-surface p-4 text-sm text-muted-foreground">No items in checklist yet.</div>;
  }
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="border-b bg-surface-muted px-4 py-2.5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Document requirements</div>
      </div>
      <ul className="divide-y">
        {items.map((it) => {
          const needsAction = it.status === "Missing" || it.status === "Attention required" || it.status === "Required";
          return (
            <li key={it.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border", needsAction ? "border-[color:var(--attention)]/40 bg-[color:var(--attention)]/10" : "border-accent/30 bg-accent/5")}>
                  {needsAction ? <AlertTriangle className="size-3.5 text-[color:var(--attention)]" /> : <CheckCircle2 className="size-3.5 text-accent" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <div className="text-sm font-medium text-foreground">{it.name}</div>
                    <div className="text-xs text-muted-foreground">· {it.party}</div>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{it.reason}</div>
                  {it.investorIssue && (
                    <div className="mt-1.5 text-xs text-[color:var(--attention)]">{it.investorIssue}</div>
                  )}
                  {it.remedy && (
                    <div className="mt-0.5 text-xs text-foreground">Recommended: {it.remedy}</div>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className={cn("font-medium", STATUS_COLOR[it.status])}>{it.status}</span>
                    {it.receivedAt && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="size-3" /> Received
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {it.status === "Missing" || it.status === "Required" ? (
                    <Button size="sm" variant="outline" onClick={() => onProvide(it.id)}>
                      <Upload className="size-3.5" /> Upload
                    </Button>
                  ) : it.status === "Attention required" ? (
                    <Button size="sm" variant="outline" onClick={() => onReplace(it.id)}>
                      <FileText className="size-3.5" /> Replace
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
