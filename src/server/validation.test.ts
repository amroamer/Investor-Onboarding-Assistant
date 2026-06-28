import { describe, it, expect } from "vitest";
import { validateDocument, checkPoaAge } from "./validation";
import type { ClassifiedDoc } from "./classification";
import type { OnboardingCase } from "@/lib/onboarding/types";

function emptyCase(overrides: Partial<OnboardingCase> = {}): OnboardingCase {
  return {
    caseId: "TEST-001",
    investorName: "Test Investor Ltd.",
    primaryContact: "Test Person",
    legalForm: undefined,
    jurisdiction: undefined,
    onboardingMode: undefined,
    currentStage: "Investor profile",
    stageStatus: {
      "Investor profile": "In progress",
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

function classifiedDoc(overrides: Partial<ClassifiedDoc> = {}): ClassifiedDoc {
  return {
    document_type: "other",
    confidence: "high",
    summary: "Test doc",
    party_name: "",
    language: "",
    appears_certified: false,
    document_subtype: "",
    holder_name: "",
    date_of_birth: "",
    nationality: "",
    document_number: "",
    issue_date: "",
    expiry_date: "",
    address: "",
    legal_name: "",
    jurisdiction: "",
    registration_number: "",
    incorporation_date: "",
    general_partner: "",
    ownership_holders: [],
    ...overrides,
  };
}

describe("checkPoaAge", () => {
  it("accepts a POA issued today", () => {
    const today = new Date("2026-06-24T00:00:00Z");
    const result = checkPoaAge("2026-06-24", today);
    expect(result.ok).toBe(true);
  });

  it("accepts a POA issued 5 months ago", () => {
    const today = new Date("2026-06-24T00:00:00Z");
    const result = checkPoaAge("2026-01-24", today);
    expect(result.ok).toBe(true);
  });

  it("rejects a POA issued 9 months ago", () => {
    const today = new Date("2026-06-24T00:00:00Z");
    const result = checkPoaAge("2025-09-24", today);
    expect(result.ok).toBe(false);
  });

  it("returns ageMonths = -1 for an unparseable date", () => {
    const result = checkPoaAge("not a date");
    expect(result.ok).toBe(false);
    expect(result.ageMonths).toBe(-1);
  });

  it("returns ageMonths = -1 for an empty string", () => {
    const result = checkPoaAge("");
    expect(result.ok).toBe(false);
  });
});

describe("validateDocument: passport", () => {
  it("creates a Received checklist item for a valid passport", () => {
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "passport",
      holder_name: "Jane Doe",
      expiry_date: "2030-01-01",
      nationality: "United Kingdom",
    });
    const r = validateDocument(c, doc, "doc1", "passport.pdf");
    expect(r.classifiedAs).toBe("Passport");
    expect(r.checklistAdditions).toHaveLength(1);
    expect(r.checklistAdditions[0].status).toBe("Received");
    expect(r.redFlagAdditions).toHaveLength(0);
    expect(r.relatedPartyAdditions[0]).toMatchObject({
      name: "Jane Doe",
      partyType: "Individual",
      nationality: "United Kingdom",
    });
  });

  it("flags PASSPORT-EXPIRED with severity High when expiry is in the past", () => {
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "passport",
      holder_name: "Jane Doe",
      expiry_date: "2020-01-01",
    });
    const r = validateDocument(c, doc, "doc1", "old-passport.pdf");
    expect(r.checklistAdditions[0].status).toBe("Attention required");
    expect(r.redFlagAdditions).toHaveLength(1);
    expect(r.redFlagAdditions[0].rule).toBe("PASSPORT-EXPIRED");
    expect(r.redFlagAdditions[0].severity).toBe("High");
  });
});

describe("validateDocument: proof_of_address", () => {
  it("creates a Received checklist item when POA is recent", () => {
    const today = new Date();
    const recent = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "proof_of_address",
      holder_name: "Jane Doe",
      issue_date: recent.toISOString().slice(0, 10),
      address: "123 Maple St",
    });
    const r = validateDocument(c, doc, "doc1", "utility.pdf");
    expect(r.checklistAdditions[0].status).toBe("Received");
    expect(r.redFlagAdditions.filter((f) => f.rule === "POA-AGE-6M")).toHaveLength(0);
    expect(
      r.extractedFieldAdditions.some((f) => f.label === "Residential address"),
    ).toBe(true);
  });

  it("flags POA-AGE-6M when POA is older than 6 months", () => {
    const today = new Date();
    const old = new Date(today.getTime() - 270 * 24 * 60 * 60 * 1000); // ~9 months ago
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "proof_of_address",
      holder_name: "Jane Doe",
      issue_date: old.toISOString().slice(0, 10),
    });
    const r = validateDocument(c, doc, "doc1", "utility.pdf");
    expect(r.checklistAdditions[0].status).toBe("Attention required");
    const poaFlag = r.redFlagAdditions.find((f) => f.rule === "POA-AGE-6M");
    expect(poaFlag).toBeDefined();
    expect(poaFlag?.severity).toBe("Medium");
  });

  it("flags Attention required when issue date is missing", () => {
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "proof_of_address",
      holder_name: "Jane Doe",
      issue_date: "",
    });
    const r = validateDocument(c, doc, "doc1", "utility.pdf");
    expect(r.checklistAdditions[0].status).toBe("Attention required");
  });
});

describe("validateDocument: certificate_of_incorporation", () => {
  it("does not flag when jurisdictions match", () => {
    const c = emptyCase({ jurisdiction: "Cayman Islands" });
    const doc = classifiedDoc({
      document_type: "certificate_of_incorporation",
      legal_name: "Horizon Capital Ltd.",
      jurisdiction: "Cayman Islands",
    });
    const r = validateDocument(c, doc, "doc1", "cert.pdf");
    expect(r.redFlagAdditions.find((f) => f.rule === "JURISDICTION-MISMATCH")).toBeUndefined();
  });

  it("flags JURISDICTION-MISMATCH when jurisdictions disagree", () => {
    const c = emptyCase({ jurisdiction: "Cayman Islands" });
    const doc = classifiedDoc({
      document_type: "certificate_of_incorporation",
      legal_name: "Horizon Capital Ltd.",
      jurisdiction: "Delaware, USA",
    });
    const r = validateDocument(c, doc, "doc1", "cert.pdf");
    const flag = r.redFlagAdditions.find((f) => f.rule === "JURISDICTION-MISMATCH");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("Medium");
  });
});

describe("validateDocument: articles_of_association", () => {
  it("does not flag when language is English", () => {
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "articles_of_association",
      language: "English",
    });
    const r = validateDocument(c, doc, "doc1", "articles.pdf");
    expect(r.checklistAdditions[0].status).toBe("Received");
    expect(r.redFlagAdditions.find((f) => f.rule === "DOC-LANG-EN")).toBeUndefined();
  });

  it("flags DOC-LANG-EN when document is in another language", () => {
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "articles_of_association",
      language: "French",
    });
    const r = validateDocument(c, doc, "doc1", "articles-fr.pdf");
    expect(r.checklistAdditions[0].status).toBe("Attention required");
    const flag = r.redFlagAdditions.find((f) => f.rule === "DOC-LANG-EN");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("Medium");
  });
});

describe("validateDocument: register of members", () => {
  it("captures all ownership holders as related parties with parsed percentages", () => {
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "register_of_members",
      ownership_holders: [
        { name: "Alice Smith", role: "Member", ownership_pct: "60", party_type: "Individual" },
        { name: "Bob Jones", role: "Member", ownership_pct: "40%", party_type: "Individual" },
      ],
    });
    const r = validateDocument(c, doc, "doc1", "register.pdf");
    expect(r.relatedPartyAdditions).toHaveLength(2);
    expect(r.relatedPartyAdditions[0].ownershipPct).toBe(60);
    expect(r.relatedPartyAdditions[1].ownershipPct).toBe(40);
  });
});

describe("validateDocument: low confidence", () => {
  it("emits CLS-LOW-CONFIDENCE flag when confidence is low", () => {
    const c = emptyCase();
    const doc = classifiedDoc({
      document_type: "passport",
      confidence: "low",
      holder_name: "Jane Doe",
    });
    const r = validateDocument(c, doc, "doc1", "blurry.pdf");
    expect(r.redFlagAdditions.find((f) => f.rule === "CLS-LOW-CONFIDENCE")).toBeDefined();
  });
});

describe("validateDocument: unclassified", () => {
  it("marks doc as unmatched_unknown_type with DOC-UNCLASSIFIED flag and no phantom checklist item", () => {
    const c = emptyCase();
    const doc = classifiedDoc({ document_type: "other", confidence: "medium" });
    const r = validateDocument(c, doc, "doc1", "random.pdf");
    expect(r.matchOutcome).toBe("unmatched_unknown_type");
    expect(r.checklistAdditions).toEqual([]);
    expect(r.redFlagAdditions.find((f) => f.rule === "DOC-UNCLASSIFIED")).toBeDefined();
  });
});

describe("validateDocument: wrong-form short-circuit", () => {
  it("Cert of Incorporation on an Individual case is unmatched_wrong_form, no checklist row", () => {
    const c = emptyCase({ legalForm: "Individual" });
    const doc = classifiedDoc({
      document_type: "certificate_of_incorporation",
      confidence: "high",
      legal_name: "Horizon Capital Holdings Ltd.",
    });
    const r = validateDocument(c, doc, "doc1", "cert.pdf");
    expect(r.matchOutcome).toBe("unmatched_wrong_form");
    expect(r.suggestedLegalForm).toBe("Corporation");
    expect(r.checklistAdditions).toEqual([]);
    expect(r.relatedPartyAdditions).toEqual([]);
    expect(r.extractedFieldAdditions).toEqual([]);
  });

  it("Cert of Incorporation on a Corporation case is matched", () => {
    const c = emptyCase({ legalForm: "Corporation" });
    const doc = classifiedDoc({
      document_type: "certificate_of_incorporation",
      confidence: "high",
      legal_name: "Horizon Capital Holdings Ltd.",
    });
    const r = validateDocument(c, doc, "doc1", "cert.pdf");
    expect(r.matchOutcome).toBe("matched");
    expect(r.checklistAdditions.length).toBeGreaterThan(0);
  });

  it("Passport is matched on every legal form", () => {
    for (const form of [
      "Individual",
      "Limited Partnership",
      "Corporation",
      "Trust",
      "Regulated or Listed Entity",
    ] as const) {
      const c = emptyCase({ legalForm: form });
      const doc = classifiedDoc({
        document_type: "passport",
        confidence: "high",
        holder_name: "Olivia Bennett",
      });
      const r = validateDocument(c, doc, "doc1", "passport.pdf");
      expect(r.matchOutcome, `form=${form}`).toBe("matched");
    }
  });
});
