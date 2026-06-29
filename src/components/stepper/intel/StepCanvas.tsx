import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  main: ReactNode;
  /** Right intelligence column. On lg+ it sticks; on smaller screens it stacks under main. */
  intelligence?: ReactNode;
  /** Width of the right column on lg+. Defaults to 340px. */
  intelligenceWidth?: number;
  /** Optional className for the root grid. */
  className?: string;
  /** When true, drops the right column entirely on lg+ as well. */
  hideIntelligenceOnDesktop?: boolean;
}

/**
 * Two-column step layout. The main column always stretches; the intelligence
 * column floats on the right on lg+ and stacks below on smaller screens.
 *
 * The `intelligence` prop is optional — if absent, the layout falls back to a
 * comfortable single-column max-width.
 */
export function StepCanvas({
  main,
  intelligence,
  intelligenceWidth = 340,
  className,
  hideIntelligenceOnDesktop,
}: Props) {
  if (!intelligence) {
    return <div className={cn("mx-auto w-full max-w-3xl", className)}>{main}</div>;
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-6 lg:gap-8",
        !hideIntelligenceOnDesktop && "lg:[grid-template-columns:minmax(0,1fr)_var(--intel-w)]",
        className,
      )}
      style={{ ["--intel-w" as never]: `${intelligenceWidth}px` }}
    >
      <div className="min-w-0">{main}</div>
      {!hideIntelligenceOnDesktop ? (
        <aside className="lg:sticky lg:top-6 lg:self-start">{intelligence}</aside>
      ) : (
        <aside>{intelligence}</aside>
      )}
    </div>
  );
}
