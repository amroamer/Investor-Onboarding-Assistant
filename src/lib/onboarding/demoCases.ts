import type { OnboardingCase } from "./types";

const now = () => new Date().toISOString();

function emptyShell(caseId: string, investorName: string, primaryContact: string): OnboardingCase {
  const t = now();
  return {
    caseId,
    investorName,
    primaryContact,
    legalForm: undefined,
    jurisdiction: undefined,
    onboardingMode: undefined,
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
    lastSavedAt: t,
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
    audit: [
      { id: "a1", at: t, actor: "Agent", type: "Case created", detail: "Onboarding case opened" },
    ],
  };
}

export function buildNewCorporateCase(): OnboardingCase {
  // Investor name + contact are intentionally blank — they're collected through the
  // chat-driven Identity card. The case key alone is enough to uniquely address the case
  // (the picker labels fall back to "Case <id>" until the investor confirms their identity).
  return emptyShell("HRZN-2026-0418", "", "");
}

export function buildReturningLPCase(): OnboardingCase {
  return emptyShell("ATLS-2026-0211", "", "");
}
