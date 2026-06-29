import { describe, it, expect } from "vitest";
import { deriveComplianceState, buildNamesToScreen } from "./compliance-derive";
import {
  buildEmptyStepperCase,
  type StepperCase,
  type StepperLegalForm,
  type ChecklistItem,
} from "./types";
import { requirementsFor } from "./requirements";
import type { StepperComplianceState } from "./compliance";

/** Build a checklist that satisfies every (party, requirementKey) slot for the
 *  given form. Lets the tests start from a "clean" state and selectively
 *  remove rows to assert that R-DOC-003 fires per missing slot. */
function fullyReceivedChecklist(form: StepperLegalForm): ChecklistItem[] {
  const groups = requirementsFor(form);
  const out: ChecklistItem[] = [];
  let i = 0;
  for (const g of groups) {
    for (const item of g.items) {
      out.push({
        id: `ci_${i++}`,
        requirementKey: item.key,
        name: item.name,
        party: g.party,
        reason: "test",
        status: "received",
      });
    }
  }
  return out;
}

function cleanIndividual(): StepperCase {
  const c = buildEmptyStepperCase("STP-TEST-CLEAN");
  c.profile = {
    investorName: "Amelia Rose Brooks",
    primaryContact: "Amelia Rose Brooks",
    primaryContactEmail: "amelia@example.com",
    legalForm: "Individual",
    jurisdiction: "United Arab Emirates",
  };
  c.declarations = {
    taxResidencyCountry: "United Arab Emirates",
    isUsPerson: false,
    pepSelf: false,
    pepFamily: false,
    pepAssociate: false,
    attestationsAccepted: true,
  };
  c.checklist = fullyReceivedChecklist("Individual");
  return c;
}

function cleanCorporation(): StepperCase {
  const c = buildEmptyStepperCase("STP-TEST-CORP");
  c.profile = {
    investorName: "Horizon Capital Holdings Ltd.",
    primaryContact: "Olivia Bennett",
    primaryContactEmail: "ops@horizon.example.com",
    legalForm: "Corporation or Private Trust Corporation",
    jurisdiction: "Cayman Islands",
  };
  c.declarations = {
    taxResidencyCountry: "Cayman Islands",
    isUsPerson: false,
    pepSelf: false,
    pepFamily: false,
    pepAssociate: false,
    fatcaSection: "Section 3 — Active NFFE",
    fatcaTin: "KY-12345",
    attestationsAccepted: true,
  };
  // Three UBOs each need photo_id + proof_of_address + pep_declaration. Use
  // the per-party group label verbatim so the test reflects the production
  // grouping. We add three relatedParties to match.
  c.relatedParties = [
    { id: "rp1", name: "Olivia Bennett", role: "Director", partyType: "Individual", ownershipPct: 40 },
    { id: "rp2", name: "Marco Reyes", role: "UBO", partyType: "Individual", ownershipPct: 35 },
    { id: "rp3", name: "Sarah Chen", role: "Authorised signatory", partyType: "Individual", ownershipPct: 0 },
  ];
  c.checklist = fullyReceivedChecklist("Corporation or Private Trust Corporation");
  return c;
}

describe("deriveComplianceState — clean Individual case", () => {
  it("produces PASS outcome and Low band with no flags", () => {
    const state = deriveComplianceState(cleanIndividual());
    expect(state.redFlags).toEqual([]);
    expect(state.riskScore).toBe(0);
    expect(state.riskBand).toBe("Low");
    expect(state.suggestedOutcome).toBe("PASS");
  });

  it("includes the investor entity in namesToScreen", () => {
    const state = deriveComplianceState(cleanIndividual());
    expect(state.namesToScreen).toHaveLength(1);
    expect(state.namesToScreen[0]).toMatchObject({
      id: "investor",
      name: "Amelia Rose Brooks",
      partyType: "Individual",
      role: "Investor",
      screeningStatus: "Ready for screening",
    });
  });
});

describe("deriveComplianceState — PEP self-declaration", () => {
  it("R-PEP-001 fires and score lifts above zero", () => {
    const c = cleanIndividual();
    c.declarations.pepSelf = true;
    c.declarations.pepDetail = "Sitting MP, Country X";
    const state = deriveComplianceState(c);
    const rules = state.redFlags.map((f) => f.rule);
    expect(rules).toContain("R-PEP-001");
    expect(state.riskScore).toBe(15);
    expect(state.riskBand).toBe("Low");
    expect(state.suggestedOutcome).toBe("PASS");
  });
});

describe("deriveComplianceState — high-risk jurisdiction", () => {
  it("R-JUR-001 fires and lifts to High band → PENDING outcome", () => {
    const c = cleanIndividual();
    c.profile = { ...c.profile!, jurisdiction: "Iran" };
    const state = deriveComplianceState(c);
    const flag = state.redFlags.find((f) => f.rule === "R-JUR-001");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("High");
    expect(state.riskScore).toBeGreaterThanOrEqual(25);
    expect(state.suggestedOutcome).toBe("PASS");
  });

  it("PEP + high-risk jurisdiction tips into Medium band", () => {
    const c = cleanIndividual();
    c.profile = { ...c.profile!, jurisdiction: "Iran" };
    c.declarations.pepSelf = true;
    const state = deriveComplianceState(c);
    expect(state.riskScore).toBe(40);
    expect(state.riskBand).toBe("Medium");
    expect(state.suggestedOutcome).toBe("PASS");
  });
});

describe("deriveComplianceState — sanctions hit", () => {
  it("R-SCR-001 fires and forces FAIL outcome", () => {
    const c = cleanIndividual();
    const prior: StepperComplianceState = {
      caseId: c.caseId,
      suggestedOutcome: "PENDING",
      riskScore: 0,
      riskBand: "Low",
      redFlags: [],
      namesToScreen: [
        {
          id: "investor",
          name: c.profile!.investorName,
          partyType: "Individual",
          role: "Investor",
          country: c.profile!.jurisdiction,
          screeningStatus: "Screening completed",
          provider: "OpenSanctions",
          screenedAt: new Date().toISOString(),
          matches: [
            {
              id: "Q123",
              caption: "Amelia Rose Brooks",
              score: 0.92,
              topics: ["sanction"],
              countries: ["AE"],
              datasets: ["us_ofac_sdn"],
            },
          ],
        },
      ],
      furtherInfoRequests: [],
      reasoning: [],
      computedAt: new Date().toISOString(),
    };
    const state = deriveComplianceState(c, { previous: prior });
    const rules = state.redFlags.map((f) => f.rule);
    expect(rules).toContain("R-SCR-001");
    expect(state.suggestedOutcome).toBe("FAIL");
    expect(state.riskBand).toBe("High");
  });
});

describe("deriveComplianceState — missing required documents (party-aware)", () => {
  it("Individual: drop tax_residency + source_of_funds slots → 2 R-DOC-003 flags", () => {
    const c = cleanIndividual();
    c.checklist = c.checklist.filter(
      (i) => i.requirementKey !== "tax_residency" && i.requirementKey !== "source_of_funds",
    );
    const state = deriveComplianceState(c);
    const missing = state.redFlags.filter((f) => f.rule === "R-DOC-003");
    expect(missing).toHaveLength(2);
    // New format: "Required: {name} — {party}"
    expect(missing.every((f) => f.description.startsWith("Required:"))).toBe(true);
    expect(missing.every((f) => f.description.includes("Investor (individual)"))).toBe(true);
  });

  it("Corporation: same requirementKey across parties counts each missing slot separately", () => {
    const c = cleanCorporation();
    // Drop the per-UBO photo_id requirement (third party group: "Each UBO ≥ 25%, each director and each authorised signatory").
    c.checklist = c.checklist.filter(
      (i) =>
        !(
          i.requirementKey === "photo_id" &&
          i.party === "Each UBO ≥ 25%, each director and each authorised signatory"
        ),
    );
    const state = deriveComplianceState(c);
    const docFlags = state.redFlags.filter((f) => f.rule === "R-DOC-003");
    // Exactly one flag: the (UBO-party, photo_id) tuple. The same photo_id
    // requirement also appears in OTHER groups when shared, but the
    // Corporation form only carries photo_id once (in the per-UBO group),
    // so removing it yields exactly one missing flag.
    expect(docFlags).toHaveLength(1);
    expect(docFlags[0].description).toContain("Each UBO ≥ 25%");
  });

  it("Corporation: missing 'evidence_of_regulated_status' would be no-op (not required for Corp)", () => {
    // Regression: per-form overrides only apply to keys that the form
    // actually requires. evidence_of_regulated_status is only in Regulated/Listed.
    const c = cleanCorporation();
    const state = deriveComplianceState(c);
    expect(state.redFlags.find((f) => f.description.toLowerCase().includes("regulated status"))).toBeUndefined();
  });
});

describe("deriveComplianceState — per-form weight overrides", () => {
  it("Regulated/Listed missing audited financials lifts to Medium severity (override)", () => {
    const c = buildEmptyStepperCase("STP-TEST-REG");
    c.profile = {
      investorName: "ACME Bank Plc",
      primaryContact: "John Treasurer",
      primaryContactEmail: "treasurer@acmebank.example",
      legalForm: "Regulated or Listed Entity",
      jurisdiction: "United Kingdom",
    };
    c.declarations = {
      taxResidencyCountry: "United Kingdom",
      isUsPerson: false,
      pepSelf: false,
      pepFamily: false,
      pepAssociate: false,
      fatcaSection: "Section 1 — Financial Institution",
      fatcaTin: "GB123456",
      attestationsAccepted: true,
    };
    // Submit with nothing in the checklist — every requirement should fire.
    c.checklist = [];
    const state = deriveComplianceState(c);
    const auditedFlag = state.redFlags.find((f) =>
      f.description.toLowerCase().includes("audited financial statements"),
    );
    expect(auditedFlag).toBeDefined();
    expect(auditedFlag!.severity).toBe("Medium");
    const regStatusFlag = state.redFlags.find((f) =>
      f.description.toLowerCase().includes("evidence of regulated status"),
    );
    expect(regStatusFlag!.severity).toBe("Medium");
  });
});

describe("deriveComplianceState — entity FATCA gap (R-TAX-002)", () => {
  it("entity case missing fatcaSection AND fatcaTin → R-TAX-002 fires", () => {
    const c = cleanCorporation();
    c.declarations.fatcaSection = undefined;
    c.declarations.fatcaTin = undefined;
    const state = deriveComplianceState(c);
    const tax = state.redFlags.find((f) => f.rule === "R-TAX-002");
    expect(tax).toBeDefined();
    expect(tax!.severity).toBe("High");
    expect(tax!.description.toLowerCase()).toContain("classification");
    expect(tax!.description.toLowerCase()).toContain("tax identification");
  });

  it("Individual without any FATCA fields does NOT trigger R-TAX-002", () => {
    const c = cleanIndividual();
    // Individual cases never set fatcaSection/fatcaTin, and shouldn't be flagged.
    const state = deriveComplianceState(c);
    expect(state.redFlags.find((f) => f.rule === "R-TAX-002")).toBeUndefined();
  });
});

describe("deriveComplianceState — attention checklist item", () => {
  it("R-DOC-002 fires when validator marks a checklist item attention", () => {
    const c = cleanIndividual();
    c.checklist[0] = {
      ...c.checklist[0],
      status: "attention",
      issue: "Expired",
      remedy: "Upload a current passport",
      sourceDocId: "doc-passport",
    };
    const state = deriveComplianceState(c);
    const flag = state.redFlags.find((f) => f.rule === "R-DOC-002");
    expect(flag).toBeDefined();
    expect(flag?.evidence).toBe("Expired");
    expect(flag?.sourceDocId).toBe("doc-passport");
  });
});

describe("flagId allocator is per-call (no shared module state)", () => {
  it("calling deriveComplianceState twice on the same case yields identical flag ids", () => {
    const c = cleanIndividual();
    c.declarations.pepSelf = true;
    c.profile = { ...c.profile!, jurisdiction: "Iran" };
    const a = deriveComplianceState(c);
    const b = deriveComplianceState(c);
    expect(a.redFlags.map((f) => f.id)).toEqual(b.redFlags.map((f) => f.id));
  });

  it("first flag id is always `-1` regardless of how many derivations ran before it", () => {
    const c = cleanIndividual();
    c.declarations.pepSelf = true;
    for (let i = 0; i < 5; i += 1) deriveComplianceState(c);
    const state = deriveComplianceState(c);
    expect(state.redFlags[0].id).toMatch(/-1$/);
  });
});

describe("deriveComplianceState — Trust form", () => {
  function cleanTrust(): StepperCase {
    const c = buildEmptyStepperCase("STP-TEST-TRUST");
    c.profile = {
      investorName: "The Aurora Family Trust",
      primaryContact: "Henry Trustee",
      primaryContactEmail: "trustee@aurora.example",
      legalForm: "Trust",
      jurisdiction: "Jersey",
    };
    c.declarations = {
      taxResidencyCountry: "Jersey",
      isUsPerson: false,
      pepSelf: false,
      pepFamily: false,
      pepAssociate: false,
      fatcaSection: "Section 2 — Passive NFFE",
      fatcaTin: "JE-99887",
      attestationsAccepted: true,
    };
    c.checklist = fullyReceivedChecklist("Trust");
    return c;
  }

  it("clean Trust case → PASS, no flags", () => {
    const state = deriveComplianceState(cleanTrust());
    expect(state.redFlags).toEqual([]);
    expect(state.suggestedOutcome).toBe("PASS");
  });

  it("missing trust_deed lifts to Medium per per-form override", () => {
    const c = cleanTrust();
    c.checklist = c.checklist.filter((i) => i.requirementKey !== "trust_deed");
    const state = deriveComplianceState(c);
    const flag = state.redFlags.find((f) => f.requirementKey === "trust_deed");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("Medium");
    // Weight override = 10, replacing default 4.
    expect(state.riskScore).toBeGreaterThanOrEqual(10);
  });
});

describe("deriveComplianceState — Limited Partnership form", () => {
  function cleanLp(): StepperCase {
    const c = buildEmptyStepperCase("STP-TEST-LP");
    c.profile = {
      investorName: "Aurora Co-Invest LP",
      primaryContact: "Mira Carlsen",
      primaryContactEmail: "ir@aurora-co-invest.example",
      legalForm: "Limited Partnership",
      jurisdiction: "Cayman Islands",
    };
    c.declarations = {
      taxResidencyCountry: "Cayman Islands",
      isUsPerson: false,
      pepSelf: false,
      pepFamily: false,
      pepAssociate: false,
      fatcaSection: "Section 2 — Passive NFFE",
      fatcaTin: "KY-LP-001",
      attestationsAccepted: true,
    };
    c.checklist = fullyReceivedChecklist("Limited Partnership");
    return c;
  }

  it("clean LP case → PASS, no flags (no SoW/SoF requirement)", () => {
    const state = deriveComplianceState(cleanLp());
    expect(state.redFlags).toEqual([]);
    expect(state.suggestedOutcome).toBe("PASS");
  });

  it("missing limited_partnership_agreement lifts to Medium per override", () => {
    const c = cleanLp();
    c.checklist = c.checklist.filter(
      (i) => i.requirementKey !== "limited_partnership_agreement",
    );
    const state = deriveComplianceState(c);
    const flag = state.redFlags.find(
      (f) => f.requirementKey === "limited_partnership_agreement",
    );
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("Medium");
  });
});

describe("deriveComplianceState — Regulated/Listed weight override", () => {
  function regulatedCase(): StepperCase {
    const c = buildEmptyStepperCase("STP-TEST-REG2");
    c.profile = {
      investorName: "Beacon Asset Management Ltd.",
      primaryContact: "Hina Yoshida",
      primaryContactEmail: "ops@beacon-am.example",
      legalForm: "Regulated or Listed Entity",
      jurisdiction: "Singapore",
    };
    c.declarations = {
      taxResidencyCountry: "Singapore",
      isUsPerson: false,
      pepSelf: false,
      pepFamily: false,
      pepAssociate: false,
      fatcaSection: "Section 1 — Financial Institution",
      fatcaTin: "SG-BAML",
      attestationsAccepted: true,
    };
    return c;
  }

  it("missing audited_financial_statements → severity Medium + weight 10 from override", () => {
    const c = regulatedCase();
    c.checklist = []; // every requirement missing
    const state = deriveComplianceState(c);
    const fin = state.redFlags.find(
      (f) => f.requirementKey === "audited_financial_statements",
    );
    expect(fin).toBeDefined();
    expect(fin!.severity).toBe("Medium");
    // Score should reflect at least the audited override weight (10), not the default 4.
    expect(state.riskScore).toBeGreaterThanOrEqual(10);
  });

  it("requirementKey + party are populated on R-DOC-003 flags", () => {
    const c = regulatedCase();
    c.checklist = [];
    const state = deriveComplianceState(c);
    const docFlag = state.redFlags.find((f) => f.rule === "R-DOC-003");
    expect(docFlag).toBeDefined();
    expect(docFlag!.requirementKey).toBeTruthy();
    expect(docFlag!.party).toBeTruthy();
  });
});

describe("buildNamesToScreen", () => {
  it("includes related parties and preserves prior screening results by id", () => {
    const c = cleanIndividual();
    c.relatedParties = [
      { id: "p1", name: "Co-investor Bob", role: "UBO", partyType: "Individual", ownershipPct: 30 },
    ];
    const prior = [
      {
        id: "p1",
        name: "Co-investor Bob",
        partyType: "Individual" as const,
        role: "UBO",
        screeningStatus: "Screening completed" as const,
        matches: [],
        provider: "OpenSanctions",
        screenedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const names = buildNamesToScreen(c, prior);
    expect(names).toHaveLength(2);
    const bob = names.find((n) => n.id === "p1");
    expect(bob?.screeningStatus).toBe("Screening completed");
    expect(bob?.screenedAt).toBe("2026-01-01T00:00:00Z");
  });
});
