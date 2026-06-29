import {
  CheckCircle2,
  Target,
  ShieldCheck,
  AlertCircle,
  CircleDashed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/stepper/intel";

interface Props {
  received: number;
  mapped: number;
  highConfidence: number;
  mediumConfidence: number;
  missing: number;
}

/**
 * Five-stat header strip rendered above the documents list. Numbers count up
 * on render to underscore that the agent has just produced them.
 */
export function DocStatGrid({
  received,
  mapped,
  highConfidence,
  mediumConfidence,
  missing,
}: Props) {
  const stats: Array<{
    label: string;
    value: number;
    icon: React.ReactNode;
    tone: "ok" | "info" | "warn" | "muted";
    testId: string;
  }> = [
    { label: "Received", value: received, icon: <CheckCircle2 className="size-4" />, tone: "ok", testId: "doc-stat-received" },
    { label: "Mapped", value: mapped, icon: <Target className="size-4" />, tone: "info", testId: "doc-stat-mapped" },
    { label: "High confidence", value: highConfidence, icon: <ShieldCheck className="size-4" />, tone: "ok", testId: "doc-stat-high" },
    {
      label: "Medium confidence",
      value: mediumConfidence,
      icon: <AlertCircle className="size-4" />,
      tone: mediumConfidence > 0 ? "warn" : "muted",
      testId: "doc-stat-medium",
    },
    { label: "Missing", value: missing, icon: <CircleDashed className="size-4" />, tone: missing > 0 ? "warn" : "muted", testId: "doc-stat-missing" },
  ];

  return (
    <ul
      data-testid="doc-stat-grid"
      className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5"
    >
      {stats.map((s, i) => (
        <li
          key={s.label}
          data-testid={s.testId}
          className="step-item-in flex items-center gap-3 rounded-xl border bg-surface px-3.5 py-3"
          style={{ animationDelay: `${i * 0.04}s` }}
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full",
              s.tone === "ok" && "bg-[color:var(--success)]/12 text-[color:var(--success)]",
              s.tone === "info" && "bg-accent/12 text-accent",
              s.tone === "warn" && "bg-[color:var(--warn)]/12 text-[color:var(--warn)]",
              s.tone === "muted" && "bg-secondary text-muted-foreground",
            )}
          >
            {s.icon}
          </span>
          <div className="min-w-0">
            <div className="text-xl font-semibold tabular-nums text-primary">
              <CountUp value={s.value} />
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
