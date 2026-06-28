/**
 * End-to-end integration test for the Amelia Rose Brooks happy-path flow.
 *
 * Drives the rule-based agent through every stage of the new Individual onboarding flow,
 * using the actual 6 demo PDFs the user supplied as the document fixtures:
 *
 *   01_Government_Issued_Photo_ID.pdf       → passport (Amelia Rose Brooks)
 *   02_Proof_of_Residential_Address.pdf     → proof_of_address (issued 2025-08-15)
 *   03_Tax_Residency_Self_Certification.pdf → fatca_declaration
 *   04_Source_of_Wealth_Confirmation.pdf    → source_of_funds_evidence (SOW narrative)
 *   05_Source_of_Funds_Subscription.pdf     → bank_statement (Emirates Crescent Bank)
 *   06_PEP_Declaration.pdf                  → pep_declaration
 *
 * Exercises every fix from this session:
 *   - Identity card capture (name + DOB + jurisdiction collected through chat)
 *   - Related-party add / update / remove
 *   - PEP per-person marks persisted to RelatedParty.pepStatus
 *   - FATCA TIN + section persisted to case.fatca
 *   - Live risk recompute (suggestedOutcome + riskScore + riskBand) at every persist
 *   - Full chat → patch → persist loop, ending with finalConfirmation=true
 */
import { describe, it, expect } from "vitest";
import { RuleBasedAgent } from "./agent/rule-based";
import { validateDocument } from "./validation";
import { recomputeRisk, withRecomputedRisk } from "@/lib/onboarding/engine";
import type { ClassifiedDoc } from "./classification";
import type { OnboardingCase, UploadedDocument, PepStatus } from "@/lib/onboarding/types";
import type { AgentEvent } from "@/lib/agent/types";

/* ---------- Fixtures: Amelia's 6 demo PDFs as ClassifiedDoc shapes ---------- */

function classified(
  overrides: Partial<ClassifiedDoc> & Pick<ClassifiedDoc, "document_type">,
): ClassifiedDoc {
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
    ...overrides,
  };
}

const AMELIA_UPLOADS: { fileName: string; doc: ClassifiedDoc }[] = [
  {
    fileName: "01_Government_Issued_Photo_ID.pdf",
    doc: classified({
      document_type: "passport",
      summary: "Illustrative government-issued photo ID record for Amelia Rose Brooks.",
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
      summary:
        "Individual CRS / FATCA self-certification — primary tax residence UAE; not a US person.",
      holder_name: "Amelia Rose Brooks",
    }),
  },
  {
    fileName: "04_Source_of_Wealth_Confirmation.pdf",
    doc: classified({
      document_type: "source_of_funds_evidence",
      document_subtype: "Source of Wealth narrative",
      summary:
        "SOW: employment income + USD 640k proceeds from Brightlake Consulting share sale (Dec 2024).",
      holder_name: "Amelia Rose Brooks",
    }),
  },
  {
    fileName: "05_Source_of_Funds_Subscription.pdf",
    doc: classified({
      document_type: "bank_statement",
      summary:
        "Emirates Crescent Bank USD statement 01 Jun 2026 – 18 Jun 2026, closing balance USD 382,745.18.",
      holder_name: "Amelia Rose Brooks",
    }),
  },
  {
    fileName: "06_PEP_Declaration.pdf",
    doc: classified({
      document_type: "pep_declaration",
      summary:
        "PEP declaration — declarant not a PEP and no immediate-family or close-associate PEPs.",
      holder_name: "Amelia Rose Brooks",
    }),
  },
];

/* ---------- Helpers ---------- */

function blankCase(): OnboardingCase {
  return {
    caseId: "AMELIA-E2E",
    investorName: "(unset)",
    primaryContact: "(unset)",
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

/** Apply an agent response to the case the same way sendAgentEvent + persistCase would. */
async function step(
  agent: RuleBasedAgent,
  c: OnboardingCase,
  event: AgentEvent,
): Promise<OnboardingCase> {
  const resp = await agent.respond(c, event);
  const patched: OnboardingCase = {
    ...c,
    ...(resp.patch ?? {}),
    conversation: [...c.conversation, ...resp.messages],
    audit: [...c.audit, ...(resp.audit ?? [])],
    lastSavedAt: new Date().toISOString(),
  };
  // Mimic persistCase's risk recompute
  return withRecomputedRisk(patched);
}

/** Run the upload pipeline (validateDocument loop) on the case, accumulating state. */
function applyUploads(
  c: OnboardingCase,
  uploads: { fileName: string; doc: ClassifiedDoc }[],
): OnboardingCase {
  let next = c;
  for (let i = 0; i < uploads.length; i++) {
    const { fileName, doc } = uploads[i];
    const docId = `doc${i + 1}`;
    const r = validateDocument(next, doc, docId, fileName);
    const uploaded: UploadedDocument = {
      id: docId,
      fileName,
      classifiedAs: r.classifiedAs,
      party: r.party,
      receivedAt: new Date().toISOString(),
      mappedChecklistIds: r.checklistAdditions.map((it) => it.id),
      matchOutcome: r.matchOutcome,
      matchReason: r.matchReason,
      suggestedLegalForm: r.suggestedLegalForm,
      classificationConfidence: doc.confidence,
    };
    next = {
      ...next,
      uploadedDocuments: [...next.uploadedDocuments, uploaded],
      checklist: [...next.checklist, ...r.checklistAdditions],
      relatedParties: [...next.relatedParties, ...r.relatedPartyAdditions],
      extractedFields: [...next.extractedFields, ...r.extractedFieldAdditions],
      complianceOnly: {
        ...next.complianceOnly,
        redFlags: [...next.complianceOnly.redFlags, ...r.redFlagAdditions],
      },
    };
  }
  return withRecomputedRisk(next);
}

/* ---------- The end-to-end happy path ---------- */

describe("Amelia Rose Brooks — full Individual onboarding happy path", () => {
  async function runFullFlow() {
    const agent = new RuleBasedAgent();
    let c = blankCase();

    // 1. Session start — agent greets + emits legal form picker
    c = await step(agent, c, { kind: "session_start" });

    // 2. Investor picks Individual
    c = await step(agent, c, {
      kind: "user_choice",
      choiceId: "Individual",
      label: "Individual",
    });

    // 3. Identity card submission — this is the NEW step where investor types her details
    c = await step(agent, c, {
      kind: "card_submit_identity",
      legalName: "Amelia Rose Brooks",
      primaryContact: "amelia@example.test",
      jurisdiction: "United Arab Emirates",
      dob: "1987-05-14",
      nationality: "British",
    });

    // 4. Investor uploads all 6 PDFs — pipeline runs (validation + classification)
    c = applyUploads(c, AMELIA_UPLOADS);
    c = await step(agent, c, {
      kind: "documents_uploaded",
      classifications: c.uploadedDocuments.map((d) => ({
        fileName: d.fileName,
        classifiedAs: d.classifiedAs,
      })),
    });

    // 5. Ownership — Amelia (an Individual) IS the related party, validation already added
    // her from the passport. We also exercise add/update/remove to prove the new card works.
    c = await step(agent, c, {
      kind: "related_party_add",
      party: {
        name: "Brightlake Consulting Ltd.",
        role: "Underlying business interest",
        partyType: "Entity",
        ownershipPct: 12,
      },
    });
    // ...then change our mind and remove it (it's a past-sold business)
    const brightlake = c.relatedParties.find((p) => p.name.startsWith("Brightlake"));
    if (!brightlake) throw new Error("Brightlake party should exist after add");
    c = await step(agent, c, {
      kind: "related_party_remove",
      partyId: brightlake.id,
    });
    // ...edit Amelia's row to show ownership %
    const amelia = c.relatedParties.find((p) => p.name === "Amelia Rose Brooks");
    if (!amelia) throw new Error("Amelia should be on related parties from passport extraction");
    c = await step(agent, c, {
      kind: "related_party_update",
      partyId: amelia.id,
      changes: { role: "Investor (sole)", ownershipPct: 100 },
    });

    // 6. Confirm ownership — advances to Source of Wealth
    c = await step(agent, c, { kind: "card_submit_ownership" });

    // 7. Source of Wealth submitted
    c = await step(agent, c, {
      kind: "card_submit_sow",
      category: "Employment income",
      detail:
        "Senior technology consulting (2012–2025) plus Brightlake share sale (Dec 2024, USD 640k).",
    });

    // 8. Source of Funds submitted
    c = await step(agent, c, {
      kind: "card_submit_sof",
      category: "Personal bank account",
      detail:
        "Emirates Crescent Bank USD account ECB-USD-XXXX4412, closing balance USD 382,745.18.",
    });

    // 9. PEP declaration WITH per-person marks — the NEW field-level persistence
    const marks: Record<string, PepStatus> = {};
    for (const p of c.relatedParties) {
      if (p.partyType === "Individual") marks[p.id] = "no";
    }
    c = await step(agent, c, { kind: "card_submit_pep", marks });

    // 10. FATCA declaration WITH TIN + section — the NEW field-level persistence
    c = await step(agent, c, {
      kind: "card_submit_fatca",
      tin: "UAE-IND-NOT-ISSUED",
      section: "Section 3 — Active NFFE",
    });

    // 11. Final review + submit
    c = await step(agent, c, { kind: "card_submit_review" });

    return c;
  }

  it("agent greets and emits the legal form chooser on session_start", async () => {
    const agent = new RuleBasedAgent();
    const c = await step(agent, blankCase(), { kind: "session_start" });
    const lastAgent = c.conversation.filter((m) => m.author === "agent").at(-1);
    expect(lastAgent?.component?.kind).toBe("choices");
    expect(c.stageStatus["Investor profile"]).toBe("In progress");
  });

  it("legal form choice triggers the identity card BEFORE upload (regression: gap #1)", async () => {
    const agent = new RuleBasedAgent();
    let c = await step(agent, blankCase(), { kind: "session_start" });
    c = await step(agent, c, {
      kind: "user_choice",
      choiceId: "Individual",
      label: "Individual",
    });
    const lastAgent = c.conversation.filter((m) => m.author === "agent").at(-1);
    expect(lastAgent?.component?.kind).toBe("identity");
    expect(c.legalForm).toBe("Individual");
    expect(c.step).toBe("awaiting_identity");
  });

  it("identity submission persists name/DOB/jurisdiction and advances to Documents", async () => {
    const c = await runFullFlow();
    expect(c.investorName).toBe("Amelia Rose Brooks");
    expect(c.primaryContact).toBe("amelia@example.test");
    expect(c.jurisdiction).toBe("United Arab Emirates");
    expect(c.dob).toBe("1987-05-14");
    expect(c.sectionConfirmations.identity).toBe(true);
    expect(c.stageStatus["Investor profile"]).toBe("Confirmed");
  });

  it("all 6 demo PDFs reach matched status and populate the Individual checklist", async () => {
    const c = await runFullFlow();
    expect(c.uploadedDocuments).toHaveLength(6);
    for (const d of c.uploadedDocuments) {
      expect(d.matchOutcome).toBe("matched");
    }
    // Classifier labels (regression — already covered in individual-flow.test.ts but worth re-asserting)
    expect(c.uploadedDocuments.map((d) => d.classifiedAs)).toEqual([
      "Passport",
      "Proof of address",
      "FATCA / CRS declaration",
      "Source of Funds evidence",
      "Bank statement",
      "PEP declaration",
    ]);
  });

  it("validation correctly flags the >6-month-old proof of address (POA-AGE-6M)", async () => {
    const c = await runFullFlow();
    const poaFlag = c.complianceOnly.redFlags.find((f) => f.rule === "POA-AGE-6M");
    expect(poaFlag).toBeDefined();
    expect(poaFlag?.severity).toBe("Medium");
    expect(poaFlag?.relatedParty).toBe("Amelia Rose Brooks");
  });

  it("related party add / update / remove all persist and audit (gap #2)", async () => {
    const c = await runFullFlow();
    // Brightlake was added then removed
    expect(c.relatedParties.find((p) => p.name.startsWith("Brightlake"))).toBeUndefined();
    // Amelia was edited
    const amelia = c.relatedParties.find((p) => p.name === "Amelia Rose Brooks");
    expect(amelia).toBeDefined();
    expect(amelia?.role).toBe("Investor (sole)");
    expect(amelia?.ownershipPct).toBe(100);
    // Audit must contain entries for add/update/remove
    const auditTypes = c.audit.map((a) => a.type);
    expect(auditTypes).toContain("Related party added");
    expect(auditTypes).toContain("Related party updated");
    expect(auditTypes).toContain("Related party removed");
  });

  it("PEP per-person marks are written to RelatedParty.pepStatus (gap #3)", async () => {
    const c = await runFullFlow();
    const amelia = c.relatedParties.find((p) => p.name === "Amelia Rose Brooks");
    expect(c.pepConfirmed).toBe(true);
    expect(amelia?.pepStatus).toBe("no");
    expect(amelia?.pepProvisional).toBe(false);
  });

  it("FATCA TIN + section are persisted on case.fatca (gap #4)", async () => {
    const c = await runFullFlow();
    expect(c.fatcaConfirmed).toBe(true);
    expect(c.fatca?.tin).toBe("UAE-IND-NOT-ISSUED");
    expect(c.fatca?.section).toBe("Section 3 — Active NFFE");
  });

  it("submit advances every stage and stamps submittedAt", async () => {
    const c = await runFullFlow();
    expect(c.finalConfirmation).toBe(true);
    expect(c.submittedAt).toBeTruthy();
    expect(c.stageStatus["Investor profile"]).toBe("Confirmed");
    expect(c.stageStatus.Documents).toBe("In progress");
    expect(c.stageStatus["Ownership and related parties"]).toBe("Confirmed");
    expect(c.stageStatus["Source of Wealth and Source of Funds"]).toBe("Confirmed");
    expect(c.stageStatus.Declarations).toBe("Confirmed");
    expect(c.stageStatus["Review and confirmation"]).toBe("Confirmed");
    expect(c.stageStatus["Submitted to Compliance"]).toBe("Submitted");
  });

  it("risk recompute runs at every persist and reflects the POA-AGE-6M flag (gap #5)", async () => {
    const c = await runFullFlow();
    // Manually recompute from the same case and compare — the live values must match.
    const computed = recomputeRisk(c);
    expect(c.complianceOnly.riskScore).toBe(computed.riskScore);
    expect(c.complianceOnly.riskBand).toBe(computed.riskBand);
    expect(c.complianceOnly.suggestedOutcome).toBe(computed.suggestedOutcome);
    // POA flag (Medium = 10) + 1 attention-required checklist (5) + 0 PEP = 15 → Low band, PENDING outcome.
    expect(c.complianceOnly.riskScore).toBe(15);
    expect(c.complianceOnly.riskBand).toBe("Low");
    // No screening run yet, so even with finalConfirmation we should NOT see PASS — must be PENDING.
    expect(c.complianceOnly.suggestedOutcome).toBe("PENDING");
  });

  it("audit log accumulates every meaningful step", async () => {
    const c = await runFullFlow();
    const types = c.audit.map((a) => a.type);
    expect(types).toContain("Identity confirmed");
    expect(types).toContain("Related party added");
    expect(types).toContain("Related party updated");
    expect(types).toContain("Related party removed");
    expect(types).toContain("Ownership confirmed");
    expect(types).toContain("PEP declarations recorded");
    expect(types).toContain("FATCA / CRS recorded");
    expect(types).toContain("Case submitted");
  });

  it("conversation feed contains every interactive card the investor used", async () => {
    const c = await runFullFlow();
    const componentKinds = c.conversation
      .filter((m) => m.author === "agent" && m.component)
      .map((m) => m.component!.kind);
    // Every step of the chat-driven flow must surface its card
    expect(componentKinds).toContain("choices"); // legal form picker
    expect(componentKinds).toContain("identity"); // NEW: identity capture
    expect(componentKinds).toContain("requirements");
    expect(componentKinds).toContain("upload");
    expect(componentKinds).toContain("sourceOfWealth");
    expect(componentKinds).toContain("sourceOfFunds");
    expect(componentKinds).toContain("pep");
    expect(componentKinds).toContain("fatca");
    expect(componentKinds).toContain("review");
    expect(componentKinds).toContain("receipt");
  });
});
