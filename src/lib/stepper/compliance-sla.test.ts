import { describe, it, expect } from "vitest";
import {
  addBusinessDays,
  caseSlaState,
  formatRelative,
  SLA_BUSINESS_DAYS,
} from "./compliance-sla";
import { buildEmptyStepperCase } from "./types";

describe("addBusinessDays", () => {
  it("Wednesday + 3 business days lands on Monday (skips weekend)", () => {
    const wed = new Date("2026-06-24T10:00:00Z");
    const out = addBusinessDays(wed, 3);
    // 24 → 25 → 26 → 29 (skipping 27 Sat / 28 Sun)
    expect(out.toISOString().slice(0, 10)).toBe("2026-06-29");
  });

  it("Friday + 1 business day lands on Monday", () => {
    const fri = new Date("2026-06-26T10:00:00Z");
    const out = addBusinessDays(fri, 1);
    expect(out.toISOString().slice(0, 10)).toBe("2026-06-29");
  });

  it("Monday + SLA_BUSINESS_DAYS lands on Thursday (no weekend crossed)", () => {
    const mon = new Date("2026-06-22T10:00:00Z");
    const out = addBusinessDays(mon, SLA_BUSINESS_DAYS);
    expect(out.toISOString().slice(0, 10)).toBe("2026-06-25");
  });
});

describe("caseSlaState", () => {
  function caseSubmittedAt(iso: string | undefined) {
    const c = buildEmptyStepperCase("STP-TEST-SLA");
    c.submittedAt = iso;
    return c;
  }

  it("returns Not submitted when there is no submittedAt", () => {
    const s = caseSlaState(caseSubmittedAt(undefined));
    expect(s.dueAt).toBeNull();
    expect(s.hoursLeft).toBeNull();
    expect(s.label).toBe("Not submitted");
    expect(s.tone).toBe("neutral");
  });

  it("plenty of time → neutral tone", () => {
    const submittedAt = "2026-06-22T09:00:00Z"; // Monday morning
    const now = new Date("2026-06-22T10:00:00Z"); // 1h after submit
    const s = caseSlaState(caseSubmittedAt(submittedAt), now);
    expect(s.tone).toBe("neutral");
    expect(s.hoursLeft).toBeGreaterThan(24);
    expect(s.label).toMatch(/d /);
  });

  it("under 24h to go → warn tone", () => {
    const submittedAt = "2026-06-22T09:00:00Z";
    // Move clock forward to ~12h before due (Thursday morning).
    const now = new Date("2026-06-24T21:00:00Z");
    const s = caseSlaState(caseSubmittedAt(submittedAt), now);
    expect(s.tone).toBe("warn");
    expect(s.hoursLeft).toBeLessThan(24);
    expect(s.label).toMatch(/h remaining/);
  });

  it("comfortably past due → danger tone with overdue label", () => {
    const submittedAt = "2026-06-22T09:00:00Z";
    // Move clock to ~2 days past the SLA.
    const now = new Date("2026-06-27T09:00:00Z");
    const s = caseSlaState(caseSubmittedAt(submittedAt), now);
    expect(s.tone).toBe("danger");
    expect(s.hoursLeft).toBeLessThan(0);
    expect(s.label.toLowerCase()).toMatch(/overdue/);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-06-28T12:00:00Z");

  it("just now (<1 minute)", () => {
    expect(formatRelative(new Date(now.getTime() - 30_000), now)).toBe("just now");
  });

  it("X min ago (<60 min)", () => {
    expect(formatRelative(new Date(now.getTime() - 12 * 60_000), now)).toBe("12 min ago");
  });

  it("X hr ago (<24 hr)", () => {
    expect(formatRelative(new Date(now.getTime() - 5 * 3_600_000), now)).toBe("5 hr ago");
  });

  it("X days ago", () => {
    expect(formatRelative(new Date(now.getTime() - 3 * 24 * 3_600_000), now)).toBe("3 days ago");
    expect(formatRelative(new Date(now.getTime() - 1 * 24 * 3_600_000), now)).toBe("1 day ago");
  });
});
