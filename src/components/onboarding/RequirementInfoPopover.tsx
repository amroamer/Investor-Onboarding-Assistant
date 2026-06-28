import { Info, Check, FileText, Sparkles, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { RequirementItem } from "@/lib/onboarding/requirements";

interface Props {
  item: RequirementItem;
}

export function RequirementInfoPopover({ item }: Props) {
  const hasAnyDetail =
    (item.mustInclude && item.mustInclude.length > 0) ||
    (item.examples && item.examples.length > 0) ||
    (item.acceptedFormats && item.acceptedFormats.length > 0) ||
    (item.rejectedIf && item.rejectedIf.length > 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
          title="What's required for this document?"
        >
          <Info className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-4 text-xs">
        <div>
          <div className="text-sm font-semibold text-foreground">{item.name}</div>
          {item.note && (
            <div className="mt-0.5 text-xs text-muted-foreground">{item.note}</div>
          )}
        </div>

        {!hasAnyDetail && (
          <p className="text-muted-foreground">
            No additional guidance recorded for this requirement yet.
          </p>
        )}

        {item.mustInclude && item.mustInclude.length > 0 && (
          <section>
            <SectionHeader icon={<Check className="size-3.5 text-accent" />} title="Must include" />
            <ul className="ml-1 mt-1 space-y-0.5">
              {item.mustInclude.map((line) => (
                <li key={line} className="flex gap-1.5 text-foreground">
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-foreground/40" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {item.examples && item.examples.length > 0 && (
          <section>
            <SectionHeader icon={<Sparkles className="size-3.5 text-primary" />} title="Examples" />
            <ul className="ml-1 mt-1 space-y-0.5">
              {item.examples.map((line) => (
                <li key={line} className="flex gap-1.5 text-foreground">
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-foreground/40" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {item.acceptedFormats && item.acceptedFormats.length > 0 && (
          <section>
            <SectionHeader icon={<FileText className="size-3.5 text-muted-foreground" />} title="Accepted formats" />
            <div className="mt-1 flex flex-wrap gap-1">
              {item.acceptedFormats.map((f) => (
                <span
                  key={f}
                  className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          </section>
        )}

        {item.rejectedIf && item.rejectedIf.length > 0 && (
          <section>
            <SectionHeader
              icon={<X className="size-3.5 text-[color:var(--attention)]" />}
              title="Will be rejected if"
            />
            <ul className="ml-1 mt-1 space-y-0.5">
              {item.rejectedIf.map((line) => (
                <li key={line} className="flex gap-1.5 text-foreground">
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-foreground/40" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {title}
    </div>
  );
}
