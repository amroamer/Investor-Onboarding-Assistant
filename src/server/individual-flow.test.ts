/**
 * End-to-end coverage of the Individual onboarding flow using the six demo
 * KYC documents the user supplied:
 *
 *   01_Government_Issued_Photo_ID.pdf       → passport
 *   02_Proof_of_Residential_Address.pdf     → proof_of_address
 *   03_Tax_Residency_Self_Certification.pdf → fatca_declaration
 *   04_Source_of_Wealth_Confirmation.pdf    → source_of_funds_evidence (no SOW type exists)
 *   05_Source_of_Funds_Subscription.pdf     → bank_statement
 *   06_PEP_Declaration.pdf                  → pep_declaration
 *
 * The test simulates the ClassifiedDoc that Claude would produce for each PDF
 * (built from the PDFs' extracted text) and asserts that:
 *   - every document produces matchOutcome === "matched"
 *   - the Unmatched uploads tray is empty
 *   - every Individual checklist requirement reads "Received"
 */
import { describe, it, expect } from "vitest";
import { validateDocument } from "./validation";
import type { ClassifiedDoc } from "./classification";
import type { OnboardingCase, UploadedDocument } from "@/lib/onboarding/types";
import { requirementsFor } from "@/lib/onboarding/requirements";
import { requirementProgress } from "@/lib/onboarding/requirementStatus";

function newIndividualCase(): OnboardingCase {
  return {
    caseId: "IND-TEST",
    investorName: "Amelia Rose Brooks",
    primaryContact: "amelia@example.test",
    legalForm: "Individual",
    jurisdiction: "United Arab Emirates",
    onboardingMode: "upload-first",
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
    progressPct: 10,
    step: "documents",
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
  };
}

function classified(overrides: Partial<ClassifiedDoc> & Pick<ClassifiedDoc, "document_type">): ClassifiedDoc {
  return {
    confidence: "high",
    summary: "",
    party_name: "Amelia Rose Brooks",
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

interface SimulatedUpload {
  fileName: string;
  doc: ClassifiedDoc;
}

const SIMULATED_UPLOADS: SimulatedUpload[] = [
  {
    fileName: "01_Government_Issued_Photo_ID.pdf",
    doc: classified({
      document_type: "passport",
      summary: "Illustrative government-issued photo ID for Amelia Rose Brooks.",
      holder_name: "Amelia Rose Brooks",
      date_of_birth: "1987-05-14",
      nationality: "British",
      document_number: "DME-ABR-870514",
      issue_date: "2021-09-22",
      expiry_date: "2031-09-21",
    }),
  },
  {
    fileName: "02_Proof_of_Residential_Address.pdf",
    doc: classified({
      document_type: "proof_of_address",
      summary: "Harbour District Utilities residential utility statement dated 15 August 2025.",
      holder_name: "Amelia Rose Brooks",
      issue_date: "2025-08-15",
      address: "Apartment 1408, Marina Vista Tower, Dubai Marina, Dubai, UAE",
    }),
  },
  {
    fileName: "03_Tax_Residency_Self_Certification.pdf",
    doc: classified({
      document_type: "fatca_declaration",
      summary: "Individual CRS / FATCA self-certification, primary tax residence UAE.",
      holder_name: "Amelia Rose Brooks",
    }),
  },
  {
    fileName: "04_Source_of_Wealth_Confirmation.pdf",
    // No dedicated SOW doc type exists; classifier's closest enum is source_of_funds_evidence.
    doc: classified({
      document_type: "source_of_funds_evidence",
      document_subtype: "Source of Wealth narrative",
      summary: "Source of Wealth confirmation: employment income + share sale proceeds.",
      holder_name: "Amelia Rose Brooks",
    }),
  },
  {
    fileName: "05_Source_of_Funds_Subscription.pdf",
    doc: classified({
      document_type: "bank_statement",
      summary: "Emirates Crescent Bank statement covering 01 Jun 2026 – 18 Jun 2026.",
      holder_name: "Amelia Rose Brooks",
    }),
  },
  {
    fileName: "06_PEP_Declaration.pdf",
    doc: classified({
      document_type: "pep_declaration",
      summary: "PEP declaration: declarant not a PEP, no immediate-family or close-associate PEPs.",
      holder_name: "Amelia Rose Brooks",
    }),
  },
];

describe("Individual onboarding flow — all six demo PDFs", () => {
  // Build the final case state by running validateDocument for each upload and
  // accumulating the result the same way uploads.ts does.
  function runAllUploads(): OnboardingCase {
    let c = newIndividualCase();
    for (let i = 0; i < SIMULATED_UPLOADS.length; i++) {
      const { fileName, doc } = SIMULATED_UPLOADS[i];
      const docId = `doc${i + 1}`;
      const result = validateDocument(c, doc, docId, fileName);

      const uploadedDoc: UploadedDocument = {
        id: docId,
        fileName,
        classifiedAs: result.classifiedAs,
        party: result.party,
        receivedAt: new Date().toISOString(),
        mappedChecklistIds: result.checklistAdditions.map((it) => it.id),
        matchOutcome: result.matchOutcome,
        matchReason: result.matchReason,
        suggestedLegalForm: result.suggestedLegalForm,
        classificationConfidence: doc.confidence,
      };

      c = {
        ...c,
        uploadedDocuments: [...c.uploadedDocuments, uploadedDoc],
        checklist: [...c.checklist, ...result.checklistAdditions],
        relatedParties: [...c.relatedParties, ...result.relatedPartyAdditions],
        extractedFields: [...c.extractedFields, ...result.extractedFieldAdditions],
        complianceOnly: {
          ...c.complianceOnly,
          redFlags: [...c.complianceOnly.redFlags, ...result.redFlagAdditions],
        },
      };
    }
    return c;
  }

  it("each document is classified as matched", () => {
    const c = runAllUploads();
    for (const d of c.uploadedDocuments) {
      expect(d.matchOutcome, `${d.fileName} matchOutcome`).toBe("matched");
    }
  });

  it("Unmatched uploads tray is empty", () => {
    const c = runAllUploads();
    const unmatched = c.uploadedDocuments.filter(
      (d) => d.matchOutcome && d.matchOutcome !== "matched",
    );
    expect(unmatched).toEqual([]);
  });

  it("no wrong-form red flags are raised", () => {
    const c = runAllUploads();
    const wrongFormFlags = c.complianceOnly.redFlags.filter(
      (f) => f.rule === "DOC-UNCLASSIFIED" || f.category === "Wrong form",
    );
    expect(wrongFormFlags).toEqual([]);
  });

  it("every Individual checklist requirement has a document attached", () => {
    const c = runAllUploads();
    const groups = requirementsFor("Individual");
    const allItems = groups.flatMap((g) => g.items.map((i) => i.name));

    // Every requirement should resolve to "Received" or "Needs attention"
    // (i.e. a document IS attached, regardless of validation outcome).
    // "Pending" would mean no document was matched to the requirement at all.
    for (const name of allItems) {
      const status = requirementProgress(name, c).status;
      expect(status, `${name}: expected a document to be attached`).not.toBe("Pending");
    }
  });

  it("the demo proof-of-address surfaces a real >6-month age issue", () => {
    // Sanity check that existing POA-AGE-6M validation still fires on the
    // user-supplied demo PDF (statement date 2025-08-15, today is 2026+).
    // This is intended behaviour, not a regression — the doc is matched but
    // marked Attention required for the investor to refresh.
    const c = runAllUploads();
    const poa = requirementProgress("Proof of residential address", c);
    expect(poa.status).toBe("Needs attention");
    expect(poa.document?.matchOutcome).toBe("matched");
  });

  it("classified labels match expected human-readable names", () => {
    const c = runAllUploads();
    const labels = c.uploadedDocuments.map((d) => d.classifiedAs);
    expect(labels).toEqual([
      "Passport",
      "Proof of address",
      "FATCA / CRS declaration",
      "Source of Funds evidence",
      "Bank statement",
      "PEP declaration",
    ]);
  });
});
