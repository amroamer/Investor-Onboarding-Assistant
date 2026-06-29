import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RequirementItem } from "@/lib/stepper/requirements";

/** Inline "Why do we need this?" popover on a requirement card. */
export function RequirementInfoPopover({ item, requirementKey }: { item: RequirementItem; requirementKey: string }) {
  return (
    <Popover>
      <PopoverTrigger
        data-testid={`req-info-${requirementKey}`}
        className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={`Why we need: ${item.name}`}
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 text-xs"
        data-testid={`req-info-content-${requirementKey}`}
      >
        <div className="text-sm font-medium text-foreground">{item.name}</div>
        {item.note && <p className="mt-1 leading-relaxed text-muted-foreground">{item.note}</p>}
        {item.mustInclude && item.mustInclude.length > 0 && (
          <>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Must show</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {item.mustInclude.map((m, i) => (<li key={i}>{m}</li>))}
            </ul>
          </>
        )}
        {item.examples && item.examples.length > 0 && (
          <>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Examples</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {item.examples.map((m, i) => (<li key={i}>{m}</li>))}
            </ul>
          </>
        )}
        {item.acceptedFormats && item.acceptedFormats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {item.acceptedFormats.map((f) => (
              <span key={f} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{f}</span>
            ))}
          </div>
        )}
        {item.rejectedIf && item.rejectedIf.length > 0 && (
          <>
            <div className="mt-3 text-[10px] font-medium uppercase tracking-wider text-[color:var(--attention)]">Rejected if</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {item.rejectedIf.map((m, i) => (<li key={i}>{m}</li>))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
