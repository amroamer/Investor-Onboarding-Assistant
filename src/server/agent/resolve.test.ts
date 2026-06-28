import { describe, it, expect } from "vitest";
import { applyResolution } from "./resolve";
import type {
  OnboardingCase,
  ConversationMessage,
  EmbeddedComponent,
} from "@/lib/onboarding/types";

function caseWith(component: EmbeddedComponent, msgId = "m1"): OnboardingCase {
  const message: ConversationMessage = {
    id: msgId,
    author: "agent",
    text: "card",
    at: new Date().toISOString(),
    component,
  };
  return {
    caseId: "RES-TEST",
    investorName: "",
    primaryContact: "",
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
    conversation: [message],
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
  };
}

function componentOf(c: OnboardingCase, msgId = "m1") {
  const msg = c.conversation.find((m) => m.id === msgId);
  return msg?.component;
}

describe("applyResolution — bool kinds gain a true resolved flag after submit", () => {
  const kinds = [
    "identity",
    "ownership",
    "sourceOfWealth",
    "sourceOfFunds",
    "pep",
    "fatca",
    "review",
  ] as const;

  for (const kind of kinds) {
    it(`${kind} card gets resolved=true`, () => {
      const initial: EmbeddedComponent =
        kind === "identity" ? { kind, legalForm: "Individual" } : ({ kind } as EmbeddedComponent);
      const c = caseWith(initial);
      const updated = applyResolution(c, "m1", {
        kind:
          kind === "identity"
            ? "card_submit_identity"
            : kind === "ownership"
              ? "card_submit_ownership"
              : kind === "sourceOfWealth"
                ? "card_submit_sow"
                : kind === "sourceOfFunds"
                  ? "card_submit_sof"
                  : kind === "pep"
                    ? "card_submit_pep"
                    : kind === "fatca"
                      ? "card_submit_fatca"
                      : "card_submit_review",
        // narrow type-checker happy values for the events that need fields:
        ...(kind === "identity"
          ? { legalName: "x", primaryContact: "y", jurisdiction: "z" }
          : kind === "sourceOfWealth" || kind === "sourceOfFunds"
            ? { category: "x", detail: "y" }
            : {}),
      } as never);
      const comp = componentOf(updated);
      expect((comp as { resolved?: boolean }).resolved).toBe(true);
    });
  }

  it("choices card stores the choiceId (not a boolean)", () => {
    const c = caseWith({
      kind: "choices",
      choices: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    });
    const updated = applyResolution(c, "m1", {
      kind: "user_choice",
      choiceId: "b",
      label: "B",
    });
    const comp = componentOf(updated);
    expect(comp?.kind).toBe("choices");
    if (comp?.kind === "choices") expect(comp.resolved).toBe("b");
  });

  it("does nothing if the messageId doesn't match", () => {
    const c = caseWith({ kind: "identity", legalForm: "Individual" });
    const updated = applyResolution(c, "wrong-id", {
      kind: "card_submit_identity",
      legalName: "x",
      primaryContact: "y",
      jurisdiction: "z",
    });
    const comp = componentOf(updated);
    expect((comp as { resolved?: boolean }).resolved).toBeUndefined();
  });
});
