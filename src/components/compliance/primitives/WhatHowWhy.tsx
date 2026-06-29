import type { ReactNode } from "react";
import { Sparkles, Cog, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Three-line explainer used throughout the cockpit — mirrors the explanation
 * pattern used on the investor side ("What we did / How we did it / Why it
 * matters") to keep both surfaces talking the same language.
 */
export function WhatHowWhy({
  what,
  how,
  why,
  className,
  variant = "block",
}: {
  what: ReactNode;
  how: ReactNode;
  why: ReactNode;
  className?: string;
  variant?: "block" | "card";
}) {
  if (variant === "card") {
    return (
      <section
        className={cn(
          "rounded-xl border bg-gradient-to-br from-[#f5fbfc] via-surface to-surface p-4",
          className,
        )}
      >
        <Row icon={<Sparkles className="size-3.5" />} label="What we did">
          {what}
        </Row>
        <Row icon={<Cog className="size-3.5" />} label="How we did it">
          {how}
        </Row>
        <Row icon={<ShieldCheck className="size-3.5" />} label="Why it matters" last>
          {why}
        </Row>
      </section>
    );
  }
  return (
    <div className={cn("space-y-3", className)}>
      <Row icon={<Sparkles className="size-3.5" />} label="What we did">
        {what}
      </Row>
      <Row icon={<Cog className="size-3.5" />} label="How we did it">
        {how}
      </Row>
      <Row icon={<ShieldCheck className="size-3.5" />} label="Why it matters" last>
        {why}
      </Row>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
  last,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-[20px_1fr] gap-3", !last && "border-b pb-3")}>
      <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-accent/10 text-accent">
        {icon}
      </span>
      <div className="text-[12.5px] leading-relaxed text-foreground/90">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-foreground/85">{children}</div>
      </div>
    </div>
  );
}
