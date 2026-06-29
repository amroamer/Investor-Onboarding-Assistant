import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 to `value` over `durationMs`. Reduced-motion respects
 * the user preference and jumps straight to the final value.
 */
export function CountUp({
  value,
  durationMs = 600,
  format,
}: {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
}) {
  const [n, setN] = useState(value);
  const startedFor = useRef<number | null>(null);

  useEffect(() => {
    // Respect reduced-motion: just set the final value and bail.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      setN(value);
      return;
    }
    if (startedFor.current === value) return;
    startedFor.current = value;

    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic for a calmer landing
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(value * eased));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  return <>{format ? format(n) : n}</>;
}
