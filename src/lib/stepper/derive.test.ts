import { describe, it, expect } from "vitest";
import { deriveFactsFromUploads, summariseSources } from "./derive";
import { buildEmptyStepperCase, type StepperUploadedDocument } from "./types";

function readyDoc(opts: {
  id: string;
  fileName: string;
  matchedRequirementKeys: string[];
  extractedFields: Record<string, string>;
  receivedAt?: string;
}): StepperUploadedDocument {
  return {
    id: opts.id,
    fileName: opts.fileName,
    mimeType: "application/pdf",
    byteSize: 1024,
    classifiedAs: "Test",
    receivedAt: opts.receivedAt ?? new Date().toISOString(),
    status: "ready",
    matchedRequirementKeys: opts.matchedRequirementKeys,
    extractedFields: opts.extractedFields,
    processingPhase: "ready",
  };
}

function caseWith(uploads: StepperUploadedDocument[]) {
  const c = buildEmptyStepperCase("STP-TEST");
  c.uploadedDocuments = uploads;
  return c;
}

describe("deriveFactsFromUploads — Individual sample case (Amelia Rose Brooks)", () => {
  const passport = readyDoc({
    id: "doc-passport",
    fileName: "01_Government_Issued_Photo_ID.pdf",
    matchedRequirementKeys: ["photo_id"],
    extractedFields: {
      holder_name: "Amelia Rose Brooks",
      date_of_birth: "1987-05-14",
      nationality: "British",
      address: "United Arab Emirates",
    },
  });
  const poa = readyDoc({
    id: "doc-poa",
    fileName: "02_Proof_of_Residential_Address.pdf",
    matchedRequirementKeys: ["proof_of_address"],
    extractedFields: {
      address: "Apartment 1408, Marina Vista Tower, Dubai Marina, Dubai, UAE",
    },
  });
  const tax = readyDoc({
    id: "doc-tax",
    fileName: "03_Tax_Residency_Self_Certification.pdf",
    matchedRequirementKeys: ["tax_residency"],
    extractedFields: {
      tax_primary_residence: "United Arab Emirates",
      tax_additional_residences: "None declared",
      tax_is_us_person: "no",
    },
  });
  const sow = readyDoc({
    id: "doc-sow",
    fileName: "04_Source_of_Wealth_Confirmation.pdf",
    matchedRequirementKeys: ["source_of_wealth"],
    extractedFields: {
      sow_primary_source: "Employment income and accumulated savings",
      sow_secondary_source: "Proceeds from sale of minority shares in Brightlake Consulting Ltd.",
      sow_net_worth_range: "USD 1.5 million - USD 2.0 million",
      sow_accumulation_period: "2012 - 2026",
      sow_narrative:
        "The investor states that her wealth was accumulated through senior technology consulting employment between 2012 and 2025, together with proceeds received in December 2024 from the sale of a 12% interest in Brightlake Consulting Ltd.",
    },
  });
  const sof = readyDoc({
    id: "doc-sof",
    fileName: "05_Source_of_Funds_Subscription.pdf",
    matchedRequirementKeys: ["source_of_funds"],
    extractedFields: {
      sof_bank_name: "Emirates Crescent Bank",
      sof_account_reference: "ECB-USD-XXXX4412",
      sof_currency: "USD",
      sof_closing_balance: "USD 382,745.18",
      sof_subscription_amount: "USD 250,000",
    },
  });
  const pep = readyDoc({
    id: "doc-pep",
    fileName: "06_PEP_Declaration.pdf",
    matchedRequirementKeys: ["pep_declaration"],
    extractedFields: {
      pep_self: "no",
      pep_family: "no",
      pep_associate: "no",
    },
  });

  const c = caseWith([passport, poa, tax, sow, sof, pep]);
  const facts = deriveFactsFromUploads(c);

  it("extracts identity from passport", () => {
    expect(facts.identity.name?.value).toBe("Amelia Rose Brooks");
    expect(facts.identity.name?.sourceFileName).toBe("01_Government_Issued_Photo_ID.pdf");
    expect(facts.identity.nationality?.value).toBe("British");
    expect(facts.identity.dob?.value).toBe("1987-05-14");
  });

  it("extracts address from the proof of address (preferring POA over tax doc)", () => {
    expect(facts.identity.address?.value).toContain("Marina Vista Tower");
    expect(facts.identity.address?.sourceDocId).toBe("doc-poa");
  });

  it("maps SoW primary source to a canonical category", () => {
    expect(facts.sow.category?.value).toBe("Employment income");
    expect(facts.sow.category?.sourceFileName).toBe("04_Source_of_Wealth_Confirmation.pdf");
  });

  it("composes SoW detail from narrative and structured fields", () => {
    expect(facts.sow.detail?.value).toContain("senior technology consulting");
    expect(facts.sow.detail?.value).toContain("USD 1.5 million");
    expect(facts.sow.evidenceDocIds).toEqual(["doc-sow"]);
  });

  it("composes SoF detail from bank statement structured fields", () => {
    expect(facts.sof.category?.value).toBe("Personal bank account");
    expect(facts.sof.detail?.value).toContain("USD 250,000");
    expect(facts.sof.detail?.value).toContain("Emirates Crescent Bank");
    expect(facts.sof.detail?.value).toContain("ECB-USD-XXXX4412");
    expect(facts.sof.detail?.value).toContain("USD 382,745.18");
    expect(facts.sof.evidenceDocIds).toEqual(["doc-sof"]);
  });

  it("extracts tax residency and US-person flag", () => {
    expect(facts.declarations.taxResidencyCountry?.value).toBe("United Arab Emirates");
    // Normaliser preserves the human-readable "None declared" sentinel for any
    // of the equivalent free-text inputs (none / none declared / n/a / not
    // applicable). It must NOT be `undefined` — that would lose the agent's
    // provenance — and it must NOT be the literal raw string before
    // normalisation.
    expect(facts.declarations.taxResidencyAdditional?.value).toBe("None declared");
    expect(facts.declarations.isUsPerson?.value).toBe(false);
  });

  it("extracts PEP triple from the declaration", () => {
    expect(facts.declarations.pepSelf?.value).toBe(false);
    expect(facts.declarations.pepFamily?.value).toBe(false);
    expect(facts.declarations.pepAssociate?.value).toBe(false);
  });

  it("leaves FATCA section unset for an individual case", () => {
    expect(facts.declarations.fatcaSection).toBeUndefined();
  });

  it("summarises sources without duplicating docs", () => {
    const sources = summariseSources(facts);
    const ids = sources.map((s) => s.docId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("doc-passport");
    expect(ids).toContain("doc-tax");
    expect(ids).toContain("doc-sow");
    expect(ids).toContain("doc-sof");
    expect(ids).toContain("doc-pep");
  });
});

describe("deriveFactsFromUploads — FATCA section mapping", () => {
  it("maps active_nffe to the section label", () => {
    const tax = readyDoc({
      id: "doc-tax-entity",
      fileName: "Entity_Tax_Residency.pdf",
      matchedRequirementKeys: ["entity_tax_residency"],
      extractedFields: {
        tax_primary_residence: "Cayman Islands",
        fatca_classification: "active_nffe",
        tax_local_tin: "TIN-123",
      },
    });
    const facts = deriveFactsFromUploads(caseWith([tax]));
    expect(facts.declarations.fatcaSection?.value).toBe("Section 3 — Active NFFE");
    expect(facts.declarations.fatcaTin?.value).toBe("TIN-123");
  });
});

describe("deriveFactsFromUploads — empty / no docs", () => {
  it("returns an empty facts shape when no docs are ready", () => {
    const facts = deriveFactsFromUploads(caseWith([]));
    expect(facts.identity.name).toBeUndefined();
    expect(facts.sow.category).toBeUndefined();
    expect(facts.sof.detail).toBeUndefined();
    expect(facts.declarations.taxResidencyCountry).toBeUndefined();
    expect(facts.declarations.fatcaSection).toBeUndefined();
  });
});
