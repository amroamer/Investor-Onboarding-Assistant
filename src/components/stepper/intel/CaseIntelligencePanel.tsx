import { useState, type ReactNode } from "react";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Section {
  title: string;
  body: ReactNode;
  /** When true, render with a slight emphasis (gradient bg). */
  emphasised?: boolean;
}

export interface IntelTab {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
  body: ReactNode;
}

interface Props {
  /** Eyebrow above the heading — typically "Case intelligence" or step-specific. */
  eyebrow?: string;
  /** Heading line. */
  heading: ReactNode;
  /** Optional sub-heading. */
  subheading?: ReactNode;
  /** Top stack of sections, rendered without tabs. */
  sections?: Section[];
  /** Tabbed sections at the bottom. */
  tabs?: IntelTab[];
  className?: string;
  /** Test selector hook. */
  testId?: string;
}

/**
 * Generic right-side intelligence panel. Stacks: heading → fixed sections →
 * tabs (Activity / Checks / Evidence by convention).
 *
 * Layout-agnostic — the parent decides whether to wrap it in a sticky `<aside>`,
 * a `<Sheet>` (tablet drawer) or a collapsible card (mobile).
 */
export function CaseIntelligencePanel({
  eyebrow = "Case intelligence",
  heading,
  subheading,
  sections = [],
  tabs = [],
  className,
  testId,
}: Props) {
  const [tab, setTab] = useState<string | undefined>(tabs[0]?.key);
  return (
    <div
      data-testid={testId ?? "case-intel-panel"}
      className={cn("overflow-hidden rounded-xl border bg-surface shadow-sm", className)}
    >
      {(eyebrow || heading || subheading) && (
        <div className="border-b bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.03] px-4 py-4">
          {eyebrow && (
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </div>
          )}
          {heading && <div className="mt-1 text-sm font-semibold text-foreground">{heading}</div>}
          {subheading && (
            <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subheading}</div>
          )}
        </div>
      )}

      {sections.map((s, i) => (
        <div
          key={i}
          className={cn(
            "border-b px-4 py-3",
            s.emphasised && "bg-gradient-to-br from-accent/[0.03] to-transparent",
          )}
        >
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {s.title}
          </div>
          <div className="mt-2 text-xs text-foreground/90">{s.body}</div>
        </div>
      ))}

      {tabs.length > 0 && (
        <div>
          <div className="flex border-b text-[10px] font-medium uppercase tracking-wider">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                data-testid={`intel-tab-${t.key}`}
                data-active={tab === t.key}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 transition-colors",
                  tab === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.icon}
                <span>{t.label}</span>
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span className="ml-1 rounded-full bg-[color:var(--attention)]/15 px-1.5 py-0.5 text-[9px] text-[color:var(--attention)]">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="max-h-72 overflow-y-auto px-4 py-3">
            {tabs.find((t) => t.key === tab)?.body}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mobile-friendly collapsible variant of the intelligence panel. Renders as a
 * single card with a chevron toggle; closed by default to keep the mobile
 * canvas clean.
 */
export function CollapsibleIntel({
  heading,
  children,
}: {
  heading: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border bg-surface lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="size-4 text-accent" />
          {heading}
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t bg-background/40">{children}</div>}
    </div>
  );
}
