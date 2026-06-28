import { describe, it, expect } from "vitest";
import {
  recomputeRisk,
  withRecomputedRisk,
  recomputeProgress,
  investorDisplayName,
} from "./engine";
import type { OnboardingCase } from "./types";

function blankCase(overrides: Partial<OnboardingCase> = {}): OnboardingCase {
  return {
    caseId: "RISK-TEST",
    investorName: "Test Investor",
    primaryContact: "Test Person",
    legalForm: "Corporation",
    jurisdiction: "Cayman Islands",
    onboardingMode: "guided",
    currentStage: "Investor profile",
    stageStatus: {
      "Investor profile": "Not started",
      Documents: "Not started",
      "Ownership and related parties": "Not started",
      "Source of Wealth and Source of Funds": "Not started",
      Declarations: "Not started",
      "Review and confirmation": "Not started",
      "Submitted to Compliance": "Not started",
    },
    progressPct: 0,
    step: "welcome",
    conversation: [],
    checklist: [],
    uploadedDocuments: [],
    extractedFields: [],
    relatedParties: [],
    ownershipConfirmed: false,
    pepConfirmed: false,
    fatcaConfirmed: false,
    sectionConfirmations: {},
    finalConfirmation: false,
    lastSavedAt: new Date().toISOString(),
    complianceOnly: {
      redFlags: [],
      suggestedOutcome: "PENDING",
      reasoning: [],
      riskScore: 0,
      riskBand: "Low",
      namesToScreen: [],
      furtherInfoRequests: [],
      reviewerNotes: [],
    },
    audit: [],
    ...overrides,
  };
}

describe("recomputeRisk", () => {
  it("blank case is Low band, score 0, PENDING outcome", () => {
    const r = recomputeRisk(blankCase());
    expect(r.riskScore).toBe(0);
    expect(r.riskBand).toBe("Low");
    expect(r.suggestedOutcome).toBe("PENDING");
  });

  it("a single High red flag pushes band to Medium and outcome PENDING", () => {
    const c = blankCase({
      complianceOnly: {
        ...blankCase().complianceOnly,
        redFlags: [
          {
            id: "f1",
            category: "Identity",
            description: "Expired passport",
            severity: "High",
            rule: "PASSPORT-EXPIRED",
            evidence: "expired",
            recommendedAction: "Request",
            status: "Open",
          },
        ],
      },
    });
    const r = recomputeRisk(c);
    expect(r.riskScore).toBe(25); // 1 × 25
    expect(r.riskBand).toBe("Medium");
    expect(r.suggestedOutcome).toBe("PENDING"); // any High forces PENDING
  });

  it("multiple high flags + screening hits → High band and PENDING", () => {
    const c = blankCase({
      complianceOnly: {
        ...blankCase().complianceOnly,
        redFlags: [
          {
            id: "f1",
            category: "x",
            description: "x",
            severity: "High",
            rule: "r",
            evidence: "e",
            recommendedAction: "a",
            status: "Open",
          },
          {
            id: "f2",
            category: "x",
            description: "x",
            severity: "High",
            rule: "r",
            evidence: "e",
            recommendedAction: "a",
            status: "Open",
          },
        ],
        namesToScreen: [
          {
            name: "X",
            partyType: "Entity",
            role: "Investor",
            relationship: "Self",
            pepProvisional: false,
            sourceDoc: "p",
            screeningStatus: "Screening completed",
            matches: [
              {
                id: "m1",
                caption: "X",
                score: 0.9,
                topics: ["sanction"],
                countries: [],
                datasets: [],
              },
            ],
          },
        ],
      },
    });
    const r = recomputeRisk(c);
    // 25 + 25 + 20 = 70
    expect(r.riskScore).toBe(70);
    expect(r.riskBand).toBe("High");
    expect(r.suggestedOutcome).toBe("PENDING");
  });

  it("PEP marks add 15 each (only non-'no' marks)", () => {
    const c = blankCase({
      relatedParties: [
        { id: "p1", name: "A", role: "Director", partyType: "Individual", pepStatus: "foreign" },
        { id: "p2", name: "B", role: "Director", partyType: "Individual", pepStatus: "no" },
        { id: "p3", name: "C", role: "Director", partyType: "Individual", pepStatus: "connected" },
      ],
    });
    const r = recomputeRisk(c);
    expect(r.riskScore).toBe(30); // 15 + 0 + 15
    expect(r.riskBand).toBe("Medium");
  });

  it("attention-required checklist items add 5 each", () => {
    const c = blankCase({
      checklist: [
        { id: "c1", name: "POA", party: "Investor", reason: "x", status: "Attention required" },
        { id: "c2", name: "Passport", party: "Investor", reason: "x", status: "Received" },
        { id: "c3", name: "Other", party: "Investor", reason: "x", status: "Missing" },
      ],
    });
    const r = recomputeRisk(c);
    expect(r.riskScore).toBe(10);
  });

  it("PASS only when finalConfirmation + all checklist OK + screening run + low score", () => {
    const c = blankCase({
      finalConfirmation: true,
      checklist: [
        { id: "c1", name: "Passport", party: "Investor", reason: "x", status: "Received" },
        { id: "c2", name: "POA", party: "Investor", reason: "x", status: "Received" },
      ],
      complianceOnly: {
        ...blankCase().complianceOnly,
        namesToScreen: [
          {
            name: "Test Investor",
            partyType: "Entity",
            role: "Investor",
            relationship: "Self",
            pepProvisional: false,
            sourceDoc: "p",
            screeningStatus: "Screening completed",
            matches: [], // no hits
          },
        ],
      },
    });
    const r = recomputeRisk(c);
    expect(r.suggestedOutcome).toBe("PASS");
  });

  it("score caps at 100", () => {
    const flags = Array.from({ length: 10 }, (_, i) => ({
      id: `f${i}`,
      category: "x",
      description: "x",
      severity: "High" as const,
      rule: "r",
      evidence: "e",
      recommendedAction: "a",
      status: "Open" as const,
    }));
    const c = blankCase({
      complianceOnly: { ...blankCase().complianceOnly, redFlags: flags },
    });
    const r = recomputeRisk(c);
    expect(r.riskScore).toBe(100);
    expect(r.riskBand).toBe("High");
  });
});

describe("withRecomputedRisk", () => {
  it("rewrites complianceOnly with fresh risk values", () => {
    const c = blankCase({
      complianceOnly: {
        ...blankCase().complianceOnly,
        riskScore: 999, // stale, should be overwritten
        riskBand: "High",
        suggestedOutcome: "FAIL",
        redFlags: [
          {
            id: "f1",
            category: "x",
            description: "x",
            severity: "Low",
            rule: "r",
            evidence: "e",
            recommendedAction: "a",
            status: "Open",
          },
        ],
      },
    });
    const out = withRecomputedRisk(c);
    expect(out.complianceOnly.riskScore).toBe(3);
    expect(out.complianceOnly.riskBand).toBe("Low");
    expect(out.complianceOnly.suggestedOutcome).toBe("PENDING");
  });

  it("returns the same reference when nothing changes (idempotent)", () => {
    const c = blankCase(); // already zero-valued
    const out = withRecomputedRisk(c);
    expect(out).toBe(c);
  });
});

describe("investorDisplayName", () => {
  it("returns investorName when set", () => {
    expect(investorDisplayName({ investorName: "Amelia Rose Brooks", caseId: "X" })).toBe(
      "Amelia Rose Brooks",
    );
  });

  it("falls back to 'Case <id>' when investorName is blank", () => {
    expect(investorDisplayName({ investorName: "", caseId: "HRZN-2026-0418" })).toBe(
      "Case HRZN-2026-0418",
    );
  });

  it("falls back when investorName is whitespace only", () => {
    expect(investorDisplayName({ investorName: "   ", caseId: "X" })).toBe("Case X");
  });
});

describe("recomputeProgress (regression)", () => {
  it("computes progress from stage weights", () => {
    const c = blankCase({
      stageStatus: {
        "Investor profile": "Confirmed",
        Documents: "Confirmed",
        "Ownership and related parties": "Not started",
        "Source of Wealth and Source of Funds": "Not started",
        Declarations: "Not started",
        "Review and confirmation": "Not started",
        "Submitted to Compliance": "Not started",
      },
    });
    expect(recomputeProgress(c)).toBe(35);
  });
});
