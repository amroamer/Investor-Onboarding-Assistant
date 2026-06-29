/**
 * Shared SLA + time-formatting helpers used by every compliance surface
 * (queue cards, drill-in hero, assistant panel, decision bar).
 *
 * The SLA target is 3 business days from submission. "Business days" skips
 * Saturday + Sunday but does not yet consider regional public holidays —
 * adequate for the prototype's demo SLA banner.
 */

import type { StepperCase } from "./types";

const HOUR_MS = 3_600_000;
export const SLA_BUSINESS_DAYS = 3;

/** Add N business days (skip Sat/Sun) to a starting date. */
export function addBusinessDays(start: Date, n: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d;
}

export type SlaTone = "neutral" | "warn" | "danger";

export interface CaseSlaState {
  /** SLA deadline as a Date — null if the case isn't submitted yet. */
  dueAt: Date | null;
  /** Whole hours remaining until `dueAt`. Negative when overdue. Null if not submitted. */
  hoursLeft: number | null;
  /**
   * Bucket the SLA falls into right now:
   *   - `neutral` more than 24h to go
   *   - `warn`    less than 24h to go (or barely overdue)
   *   - `danger`  overdue by more than the grace window
   */
  tone: SlaTone;
  /** Short human label suitable for chips ("2d 17h remaining" / "Overdue 6h"). */
  label: string;
}

export function caseSlaState(c: StepperCase, now: Date = new Date()): CaseSlaState {
  if (!c.submittedAt) {
    return { dueAt: null, hoursLeft: null, tone: "neutral", label: "Not submitted" };
  }
  const submitted = new Date(c.submittedAt);
  const dueAt = addBusinessDays(submitted, SLA_BUSINESS_DAYS);
  const hoursLeft = Math.floor((dueAt.getTime() - now.getTime()) / HOUR_MS);
  if (hoursLeft < -2) {
    return { dueAt, hoursLeft, tone: "danger", label: formatOverdue(-hoursLeft) };
  }
  if (hoursLeft < 24) {
    return { dueAt, hoursLeft, tone: "warn", label: formatRemaining(hoursLeft) };
  }
  return { dueAt, hoursLeft, tone: "neutral", label: formatRemaining(hoursLeft) };
}

function formatRemaining(hoursLeft: number): string {
  if (hoursLeft <= 0) return "Due now";
  if (hoursLeft < 24) return `${hoursLeft}h remaining`;
  const days = Math.floor(hoursLeft / 24);
  const hours = hoursLeft % 24;
  return hours === 0 ? `${days}d remaining` : `${days}d ${hours}h remaining`;
}

function formatOverdue(hoursOverdue: number): string {
  if (hoursOverdue < 24) return `Overdue ${hoursOverdue}h`;
  const days = Math.floor(hoursOverdue / 24);
  return `Overdue ${days}d`;
}

/** Relative "5 min ago" / "2 hr ago" / "3 days ago" formatter. */
export function formatRelative(then: string | Date, now: Date = new Date()): string {
  const t = typeof then === "string" ? new Date(then) : then;
  const ms = now.getTime() - t.getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
