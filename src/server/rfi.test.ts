import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OnboardingCase, FurtherInfoRequest } from "@/lib/onboarding/types";

// Stub the DB-touching modules so we can exercise the RFI logic in isolation.
let currentCase: OnboardingCase;
let persistedCase: OnboardingCase | null = null;

vi.mock("./cases", () => ({
  loadCaseByCaseId: vi.fn(async () => ({ key: "new-corporate" as const, case: currentCase })),
  persistCase: vi.fn(async (_key: string, c: OnboardingCase) => {
    persistedCase = c;
    return c;
  }),
}));

import {
  addRfiDraftLogic,
  sendRfisLogic,
  respondToRfiLogic,
  markRfiResolvedLogic,
} from "./rfi";

function baseCase(rfis: FurtherInfoRequest[] = []): OnboardingCase {
  return {
    caseId: "TEST-001",
    investorName: "Test Investor Ltd.",
    primaryContact: "Test Person",
    legalForm: "Corporation",
    jurisdiction: "Cayman Islands",
    onboardingMode: "guided",
    currentStage: "Documents",
    stageStatus: {
      "Investor profile": "Confirmed",
      Documents: "In progress",
      "Ownership and related parties": "Not started",
      "Source of Wealth and Source of Funds": "Not started",
      Declarations: "Not started",
      "Review and confirmation": "Not started",
      "Submitted to Compliance": "Not started",
    },
    progressPct: 30,
    step: "post_entity_confirm",
    conversation: [],
    checklist: [],
    uploadedDocuments: [],
    extractedFields: [],
    relatedParties: [],
    ownershipConfirmed: false,
    pepConfirmed: false,
    fatcaConfirmed: false,
    sectionConfirmations: { investorProfile: true },
    finalConfirmation: false,
    lastSavedAt: new Date().toISOString(),
    complianceOnly: {
      redFlags: [],
      suggestedOutcome: "PENDING",
      reasoning: [],
      riskScore: 0,
      riskBand: "Low",
      namesToScreen: [],
      furtherInfoRequests: rfis,
      reviewerNotes: [],
    },
    audit: [],
  };
}

beforeEach(() => {
  persistedCase = null;
});

describe("addRfiDraft", () => {
  it("appends a new draft RFI with status 'draft'", async () => {
    currentCase = baseCase();
    const updated = await addRfiDraftLogic("TEST-001", "Please provide a current proof of address.");
    const rfis = updated.complianceOnly.furtherInfoRequests;
    expect(rfis).toHaveLength(1);
    expect(rfis[0].status).toBe("draft");
    expect(rfis[0].text).toBe("Please provide a current proof of address.");
    expect(rfis[0].selected).toBe(true);
    expect(updated.audit.at(-1)?.type).toBe("RFI drafted");
  });

  it("rejects empty text", async () => {
    currentCase = baseCase();
    await expect(addRfiDraftLogic("TEST-001", "   ")).rejects.toThrow(/required/i);
  });
});

describe("sendRfis", () => {
  it("flips drafts to sent and posts an agent message with an RFI card", async () => {
    const draft: FurtherInfoRequest = {
      id: "rfi_1",
      text: "Please upload a fresh POA.",
      selected: true,
      status: "draft",
    };
    currentCase = baseCase([draft]);
    const updated = await sendRfisLogic("TEST-001", ["rfi_1"]);
    const rfi = updated.complianceOnly.furtherInfoRequests[0];
    expect(rfi.status).toBe("sent");
    expect(rfi.sentAt).toBeTruthy();
    expect(rfi.selected).toBe(false);

    const lastMsg = updated.conversation.at(-1);
    expect(lastMsg?.author).toBe("agent");
    expect(lastMsg?.component?.kind).toBe("rfi");
    if (lastMsg?.component?.kind === "rfi") {
      expect(lastMsg.component.items[0].id).toBe("rfi_1");
      expect(lastMsg.component.items[0].status).toBe("sent");
    }
    expect(updated.audit.at(-1)?.type).toBe("RFI sent");
  });

  it("ignores already-sent items and throws if none qualify", async () => {
    currentCase = baseCase([
      { id: "rfi_1", text: "X", selected: false, status: "sent" },
    ]);
    await expect(sendRfisLogic("TEST-001", ["rfi_1"])).rejects.toThrow(/no matching/i);
  });

  it("rejects empty list", async () => {
    currentCase = baseCase();
    await expect(sendRfisLogic("TEST-001", [])).rejects.toThrow(/at least one/i);
  });
});

describe("respondToRfi", () => {
  it("transitions sent → responded, stores response, echoes investor + agent ack", async () => {
    currentCase = baseCase([{ id: "rfi_1", text: "Please confirm X", selected: false, status: "sent" }]);
    const updated = await respondToRfiLogic("TEST-001", "rfi_1", "I have uploaded the document.");
    const rfi = updated.complianceOnly.furtherInfoRequests[0];
    expect(rfi.status).toBe("responded");
    expect(rfi.investorResponseText).toBe("I have uploaded the document.");
    expect(rfi.respondedAt).toBeTruthy();

    const last2 = updated.conversation.slice(-2);
    expect(last2[0].author).toBe("investor");
    expect(last2[0].text).toContain("I have uploaded the document.");
    expect(last2[1].author).toBe("agent");
    expect(updated.audit.at(-1)?.type).toBe("RFI responded");
  });

  it("updates embedded RFI cards in the conversation in place", async () => {
    const initialMsg = {
      id: "m_card",
      author: "agent" as const,
      text: "Please respond.",
      at: new Date().toISOString(),
      component: {
        kind: "rfi" as const,
        items: [{ id: "rfi_1", text: "T", status: "sent" as const }],
      },
    };
    currentCase = {
      ...baseCase([{ id: "rfi_1", text: "T", selected: false, status: "sent" }]),
      conversation: [initialMsg],
    };
    const updated = await respondToRfiLogic("TEST-001", "rfi_1", "OK");
    const refreshed = updated.conversation.find((m) => m.id === "m_card");
    if (refreshed?.component?.kind === "rfi") {
      expect(refreshed.component.items[0].status).toBe("responded");
      expect(refreshed.component.items[0].investorResponseText).toBe("OK");
    } else {
      throw new Error("RFI card not refreshed");
    }
  });

  it("rejects empty response", async () => {
    currentCase = baseCase([{ id: "rfi_1", text: "X", selected: false, status: "sent" }]);
    await expect(respondToRfiLogic("TEST-001", "rfi_1", "  ")).rejects.toThrow(/please write/i);
  });

  it("rejects unknown rfiId", async () => {
    currentCase = baseCase([]);
    await expect(respondToRfiLogic("TEST-001", "missing", "hi")).rejects.toThrow(/not found/i);
  });
});

describe("markRfiResolved", () => {
  it("transitions responded → resolved with optional note in audit", async () => {
    currentCase = baseCase([
      {
        id: "rfi_1",
        text: "T",
        selected: false,
        status: "responded",
        investorResponseText: "Done",
      },
    ]);
    const updated = await markRfiResolvedLogic("TEST-001", "rfi_1", "Verified.");
    const rfi = updated.complianceOnly.furtherInfoRequests[0];
    expect(rfi.status).toBe("resolved");
    expect(rfi.resolvedAt).toBeTruthy();
    expect(rfi.resolvedNote).toBe("Verified.");

    const auditEntry = updated.audit.at(-1);
    expect(auditEntry?.type).toBe("RFI resolved");
    expect(auditEntry?.detail).toContain("Verified.");
  });

  it("rejects unknown rfiId", async () => {
    currentCase = baseCase([]);
    await expect(markRfiResolvedLogic("TEST-001", "missing")).rejects.toThrow(/not found/i);
  });
});
