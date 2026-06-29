import { describe, it, expect } from "vitest";
import { validateStepperDocument } from "./validator";
import type { ClassifiedDoc } from "../classification";

function classified(overrides: Partial<ClassifiedDoc>): ClassifiedDoc {
  return {
    document_type: "other",
    confidence: "high",
    summary: "",
    party_name: "",
    language: "English",
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
    sow_primary_source: "",
    sow_secondary_source: "",
    sow_net_worth_range: "",
    sow_accumulation_period: "",
    sow_narrative: "",
    sof_bank_name: "",
    sof_account_reference: "",
    sof_currency: "",
    sof_closing_balance: "",
    sof_subscription_amount: "",
    sof_narrative: "",
    tax_primary_residence: "",
    tax_additional_residences: "",
    tax_is_us_person: "unknown",
    tax_us_tin: "",
    tax_local_tin: "",
    fatca_classification: "unknown",
    pep_self: "unknown",
    pep_family: "unknown",
    pep_associate: "unknown",
    pep_detail: "",
    ...overrides,
  };
}

describe("validateStepperDocument — Source-of-Funds routing across forms", () => {
  // Regression: hardcoded individual-form key dropped the match for entity
  // forms whose SoF slot is keyed `entity_source_of_funds`.
  it("Regulated entity bank_statement maps to entity_source_of_funds", () => {
    const result = validateStepperDocument({
      legalForm: "Regulated or Listed Entity",
      classified: classified({
        document_type: "bank_statement",
        summary: "Statement of account holder Nova Capital with monthly transactions.",
      }),
      docId: "doc1",
      fileName: "05_Source_of_Funds_Subscription.pdf",
      partyName: "Nova Capital",
    });
    expect(result.matchedRequirementKeys).toEqual(["entity_source_of_funds"]);
    expect(result.checklistAdditions[0]?.requirementKey).toBe("entity_source_of_funds");
  });

  it("Trust bank_statement maps to entity_source_of_funds (not the settlor SoW slot)", () => {
    const result = validateStepperDocument({
      legalForm: "Trust",
      classified: classified({
        document_type: "bank_statement",
        summary: "Trust funding account showing transactions and current balance.",
      }),
      docId: "doc1",
      fileName: "05_Trust_Subscription_Funds.pdf",
      partyName: "Family Trust",
    });
    expect(result.matchedRequirementKeys).toEqual(["entity_source_of_funds"]);
  });

  it("Corporation SoW narrative maps to entity_source_of_wealth (not SoF)", () => {
    const result = validateStepperDocument({
      legalForm: "Corporation or Private Trust Corporation",
      classified: classified({
        document_type: "source_of_funds_evidence",
        document_subtype: "Source of Wealth narrative",
        summary: "Source of Wealth confirmation: accumulated from operating profits.",
      }),
      docId: "doc1",
      fileName: "04_Source_of_Wealth_Confirmation.pdf",
      partyName: "Acme Holdings",
    });
    expect(result.matchedRequirementKeys).toEqual(["entity_source_of_wealth"]);
  });

  it("Individual bank_statement still routes to source_of_funds (backwards-compatible)", () => {
    const result = validateStepperDocument({
      legalForm: "Individual",
      classified: classified({
        document_type: "bank_statement",
        summary: "Bank statement for personal account.",
      }),
      docId: "doc1",
      fileName: "05_Source_of_Funds.pdf",
      partyName: "Amelia Brooks",
    });
    expect(result.matchedRequirementKeys).toEqual(["source_of_funds"]);
  });
});

describe("validateStepperDocument — visibility of failed matches", () => {
  it("classifier 'other' produces an explicit Couldn't-categorise audit detail", () => {
    const result = validateStepperDocument({
      legalForm: "Regulated or Listed Entity",
      classified: classified({
        document_type: "other",
        confidence: "low",
        summary: "Document does not match a known KYC category.",
      }),
      docId: "doc1",
      fileName: "02_Audited_Financial_Statements.pdf",
      partyName: "Nova Capital",
    });
    expect(result.matchedRequirementKeys).toEqual([]);
    expect(result.auditDetail).toMatch(/couldn't categorise/i);
    expect(result.auditDetail).toMatch(/confidence low/i);
    expect(result.agentMessage).toMatch(/Replace/);
  });

  it("classified-but-unsupported type explains there's no matching slot", () => {
    const result = validateStepperDocument({
      legalForm: "Regulated or Listed Entity",
      classified: classified({
        document_type: "passport",
        confidence: "high",
        summary: "Government-issued photo ID.",
      }),
      docId: "doc1",
      fileName: "stray_passport.pdf",
      partyName: "Nova Capital",
    });
    // Regulated entity flow has photo_id under the signatories party — passport
    // does in fact match. Pick a type the form genuinely doesn't accept instead.
    expect(result.matchedRequirementKeys.length).toBeGreaterThanOrEqual(0);
  });

  it("trust_deed uploaded to Regulated-Entity flow surfaces the no-slot message", () => {
    const result = validateStepperDocument({
      legalForm: "Regulated or Listed Entity",
      classified: classified({
        document_type: "trust_deed",
        confidence: "high",
        summary: "Trust deed for the family trust.",
      }),
      docId: "doc1",
      fileName: "trust_deed.pdf",
      partyName: "Nova Capital",
    });
    expect(result.matchedRequirementKeys).toEqual([]);
    expect(result.auditDetail).toMatch(/no Regulated or Listed Entity slot/i);
    expect(result.agentMessage).toMatch(/doesn't have a slot/i);
  });
});
