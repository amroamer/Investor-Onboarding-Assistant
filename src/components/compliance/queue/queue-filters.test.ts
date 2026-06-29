import { describe, it, expect } from "vitest";
import {
  computeQueueKpis,
  filterQueue,
  sortQueue,
} from "./queue-filters";
import { buildEmptyStepperCase, type StepperCase } from "@/lib/stepper/types";
import type { StepperComplianceState } from "@/lib/stepper/compliance";

function caseAt(id: string, opts: Partial<StepperCase> = {}): StepperCase {
  const c = buildEmptyStepperCase(id);
  return {
    ...c,
    ...opts,
    profile:
      opts.profile ??
      {
        investorName: `Investor ${id}`,
        primaryContact: "x",
        primaryContactEmail: "x@x.x",
        legalForm: "Individual",
        jurisdiction: "—",
      },
  };
}

function stateWith(
  caseId: string,
  patch: Partial<StepperComplianceState>,
): StepperComplianceState {
  return {
    caseId,
    suggestedOutcome: "PASS",
    riskScore: 0,
    riskBand: "Low",
    redFlags: [],
    namesToScreen: [],
    furtherInfoRequests: [],
    reasoning: [],
    computedAt: new Date().toISOString(),
    ...patch,
  };
}

describe("filterQueue", () => {
  const submitted = caseAt("A", { submittedAt: "2026-06-22T09:00:00Z" });
  const inProgress = caseAt("B", { submittedAt: undefined });
  const failCase = caseAt("C", { submittedAt: "2026-06-22T09:00:00Z" });
  const cases = [submitted, inProgress, failCase];
  const lookup = (id: string): StepperComplianceState | undefined => {
    if (id === "A") return stateWith("A", { suggestedOutcome: "PASS" });
    if (id === "C") return stateWith("C", { suggestedOutcome: "FAIL", riskBand: "High" });
    return undefined;
  };

  it("excludes in-progress unless includeInProgress is true", () => {
    expect(filterQueue(cases, "all", "", lookup, false)).toHaveLength(2);
    expect(filterQueue(cases, "all", "", lookup, true)).toHaveLength(3);
  });

  it("search hits investor name and case id", () => {
    expect(filterQueue(cases, "all", "investor a", lookup, true)).toEqual([submitted]);
    expect(filterQueue(cases, "all", "C", lookup, true)).toEqual([failCase]);
  });

  it("filter=pass keeps only PASS cases", () => {
    expect(filterQueue(cases, "pass", "", lookup, false)).toEqual([submitted]);
  });

  it("filter=fail keeps only FAIL cases", () => {
    expect(filterQueue(cases, "fail", "", lookup, false)).toEqual([failCase]);
  });

  it("filter=high-risk requires the loaded state to be High band", () => {
    expect(filterQueue(cases, "high-risk", "", lookup, false)).toEqual([failCase]);
  });

  it("unloaded states pass through screening-pending so loading rows stay visible", () => {
    const loadingCases = [caseAt("X", { submittedAt: "2026-06-22T09:00:00Z" })];
    const out = filterQueue(loadingCases, "screening-pending", "", () => undefined, false);
    expect(out).toHaveLength(1);
  });
});

describe("sortQueue", () => {
  const c1 = caseAt("A", { submittedAt: "2026-06-20T09:00:00Z" });
  const c2 = caseAt("B", { submittedAt: "2026-06-22T09:00:00Z" });
  const c3 = caseAt("C", { submittedAt: "2026-06-25T09:00:00Z" });
  const cases = [c1, c2, c3];

  it("submitted-newest sorts by submittedAt descending", () => {
    const out = sortQueue(cases, "submitted-newest", () => undefined);
    expect(out.map((c) => c.caseId)).toEqual(["C", "B", "A"]);
  });

  it("sla-urgent sorts by hoursLeft ascending (oldest submit first)", () => {
    const out = sortQueue(cases, "sla-urgent", () => undefined);
    expect(out.map((c) => c.caseId)).toEqual(["A", "B", "C"]);
  });

  it("risk-highest sorts by riskScore desc, unloaded states go last", () => {
    const lookup = (id: string) =>
      id === "A"
        ? stateWith("A", { riskScore: 20 })
        : id === "C"
          ? stateWith("C", { riskScore: 80 })
          : undefined;
    const out = sortQueue(cases, "risk-highest", lookup);
    expect(out.map((c) => c.caseId)).toEqual(["C", "A", "B"]);
  });

  it("flags-most sorts by redFlags.length desc", () => {
    const lookup = (id: string) =>
      id === "A"
        ? stateWith("A", {
            redFlags: [
              {
                id: "f1",
                rule: "R",
                category: "Documents",
                description: "x",
                severity: "Low",
                evidence: "x",
                recommendedAction: "x",
              },
              {
                id: "f2",
                rule: "R",
                category: "Documents",
                description: "x",
                severity: "Low",
                evidence: "x",
                recommendedAction: "x",
              },
            ],
          })
        : id === "B"
          ? stateWith("B", { redFlags: [] })
          : id === "C"
            ? stateWith("C", {
                redFlags: [
                  {
                    id: "f3",
                    rule: "R",
                    category: "Documents",
                    description: "x",
                    severity: "Low",
                    evidence: "x",
                    recommendedAction: "x",
                  },
                ],
              })
            : undefined;
    const out = sortQueue(cases, "flags-most", lookup);
    expect(out.map((c) => c.caseId)).toEqual(["A", "C", "B"]);
  });
});

describe("computeQueueKpis", () => {
  it("counts submitted, high-risk, fail, awaiting-rfi correctly", () => {
    const a = caseAt("A", { submittedAt: "2026-06-22T09:00:00Z" });
    const b = caseAt("B", { submittedAt: undefined });
    const c = caseAt("C", { submittedAt: "2026-06-22T09:00:00Z" });
    const lookup = (id: string) =>
      id === "A"
        ? stateWith("A", { riskBand: "High" })
        : id === "C"
          ? stateWith("C", {
              suggestedOutcome: "FAIL",
              furtherInfoRequests: [
                { id: "r", text: "x", status: "sent", selected: false },
              ],
            })
          : undefined;
    const kpis = computeQueueKpis([a, b, c], lookup);
    expect(kpis.total).toBe(3);
    expect(kpis.submitted).toBe(2);
    expect(kpis.highRisk).toBe(1);
    expect(kpis.failOutcome).toBe(1);
    expect(kpis.awaitingRfi).toBe(1);
  });
});
