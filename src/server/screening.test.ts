import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OnboardingCase, NameToScreen } from "@/lib/onboarding/types";

// Stub the DB layer the same way rfi.test.ts does.
let currentCase: OnboardingCase;

vi.mock("./cases", () => ({
  loadCaseByCaseId: vi.fn(async () => ({ key: "new-corporate" as const, case: currentCase })),
  persistCase: vi.fn(async (_key: string, c: OnboardingCase) => c),
}));

import { searchOpenSanctions, syncNamesToScreen, runScreeningLogic } from "./screening";

function baseCase(overrides: Partial<OnboardingCase> = {}): OnboardingCase {
  return {
    caseId: "TEST-001",
    investorName: "Acme Holdings Ltd.",
    primaryContact: "Alice",
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

function mockFetchOnce(payload: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

function mockFetchSequence(payloads: { payload: unknown; ok?: boolean }[]): typeof fetch {
  let i = 0;
  return (async () => {
    const next = payloads[i] ?? payloads[payloads.length - 1];
    i++;
    return new Response(JSON.stringify(next.payload), {
      status: next.ok === false ? 503 : 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  // no-op; each test sets currentCase explicitly
});

describe("searchOpenSanctions", () => {
  it("returns empty list for blank input without calling the network", async () => {
    const fetchSpy = vi.fn();
    const result = await searchOpenSanctions("   ", { fetchFn: fetchSpy as unknown as typeof fetch });
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses OpenSanctions response into ScreeningMatch[]", async () => {
    const fakeResponse = {
      results: [
        {
          id: "Q123",
          schema: "Person",
          caption: "John Doe",
          score: 0.92,
          properties: {
            birthDate: ["1970-01-01"],
            country: ["us"],
            sourceUrl: ["https://example.test/123"],
          },
          datasets: ["us_ofac_sdn"],
          countries: ["us"],
          topics: ["sanction", "role.pep"],
        },
      ],
    };
    const matches = await searchOpenSanctions("John Doe", {
      schema: "Person",
      fetchFn: mockFetchOnce(fakeResponse),
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: "Q123",
      caption: "John Doe",
      score: 0.92,
      topics: ["sanction", "role.pep"],
      datasets: ["us_ofac_sdn"],
      birthDate: "1970-01-01",
      sourceUrl: "https://example.test/123",
    });
  });

  it("throws on non-2xx HTTP response", async () => {
    await expect(
      searchOpenSanctions("Test", { fetchFn: mockFetchOnce({}, false) }),
    ).rejects.toThrow(/OpenSanctions/);
  });

  it("falls back to a default sourceUrl when the provider doesn't supply one", async () => {
    const matches = await searchOpenSanctions("Alice", {
      fetchFn: mockFetchOnce({
        results: [
          {
            id: "ent-abc",
            schema: "Person",
            caption: "Alice",
            score: 0.5,
            properties: {},
            datasets: [],
            countries: [],
            topics: [],
          },
        ],
      }),
    });
    expect(matches[0].sourceUrl).toContain("opensanctions.org");
    expect(matches[0].sourceUrl).toContain("ent-abc");
  });
});

describe("syncNamesToScreen", () => {
  it("adds the investor entity and each related party with status 'Ready for screening'", () => {
    const c = baseCase({
      relatedParties: [
        { id: "rp1", name: "Alice Smith", role: "Director", partyType: "Individual", nationality: "GB" },
        { id: "rp2", name: "Subsidiary Ltd.", role: "Corporate shareholder", partyType: "Entity" },
      ],
    });
    const updated = syncNamesToScreen(c);
    const names = updated.complianceOnly.namesToScreen;
    expect(names).toHaveLength(3);
    expect(names.find((n) => n.name === "Acme Holdings Ltd.")?.relationship).toBe("Self");
    expect(names.find((n) => n.name === "Alice Smith")?.country).toBe("GB");
    expect(names.find((n) => n.name === "Subsidiary Ltd.")?.partyType).toBe("Entity");
    expect(names.every((n) => n.screeningStatus === "Ready for screening")).toBe(true);
  });

  it("is idempotent — re-running doesn't duplicate", () => {
    const c = baseCase({
      relatedParties: [
        { id: "rp1", name: "Alice Smith", role: "Director", partyType: "Individual" },
      ],
    });
    const once = syncNamesToScreen(c);
    const twice = syncNamesToScreen(once);
    expect(twice.complianceOnly.namesToScreen).toHaveLength(2);
    expect(twice).toBe(once); // returns the same object when nothing to add
  });

  it("marks related parties whose role contains 'Underlying' as Indirect UBO", () => {
    const c = baseCase({
      relatedParties: [
        { id: "rp1", name: "Hidden Owner", role: "Underlying owner via X Ltd.", partyType: "Individual" },
      ],
    });
    const updated = syncNamesToScreen(c);
    const ubo = updated.complianceOnly.namesToScreen.find((n) => n.name === "Hidden Owner");
    expect(ubo?.relationship).toBe("Indirect UBO");
  });
});

describe("runScreeningLogic", () => {
  it("screens every 'Ready for screening' entry, records matches, and adds audit events", async () => {
    currentCase = baseCase({
      relatedParties: [
        { id: "rp1", name: "Alice Smith", role: "Director", partyType: "Individual", nationality: "GB" },
      ],
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
    });
    // 2 names will be synced (investor + Alice), so 2 fetches.
    const fetchFn = mockFetchSequence([
      { payload: { results: [] } }, // Acme Holdings Ltd. — no hits
      {
        payload: {
          results: [
            {
              id: "Q-alice",
              schema: "Person",
              caption: "Alice Smith",
              score: 0.85,
              properties: { birthDate: ["1985-04-04"], country: ["gb"] },
              datasets: ["uk_hmt_sanc"],
              countries: ["gb"],
              topics: ["sanction"],
            },
          ],
        },
      },
    ]);
    const updated = await runScreeningLogic("TEST-001", { fetchFn });
    const names = updated.complianceOnly.namesToScreen;
    expect(names).toHaveLength(2);
    expect(names.every((n) => n.screeningStatus === "Screening completed")).toBe(true);
    expect(names.every((n) => n.provider === "OpenSanctions")).toBe(true);
    const alice = names.find((n) => n.name === "Alice Smith") as NameToScreen;
    expect(alice.matches).toHaveLength(1);
    expect(alice.matches?.[0].caption).toBe("Alice Smith");
    expect(updated.audit.filter((a) => a.type === "Screening completed")).toHaveLength(2);
  });

  it("records 'Screening failed' + error message when the provider errors", async () => {
    currentCase = baseCase();
    const fetchFn: typeof fetch = (async () =>
      new Response("Service Unavailable", { status: 503 })) as unknown as typeof fetch;
    const updated = await runScreeningLogic("TEST-001", { fetchFn });
    const investor = updated.complianceOnly.namesToScreen.find((n) => n.name === "Acme Holdings Ltd.") as NameToScreen;
    expect(investor.screeningStatus).toBe("Screening failed");
    expect(investor.error).toBeTruthy();
    expect(updated.audit.find((a) => a.type === "Screening failed")).toBeDefined();
  });

  it("does not re-screen entries already marked 'Screening completed'", async () => {
    const completed: NameToScreen = {
      name: "Acme Holdings Ltd.",
      partyType: "Entity",
      role: "Investor",
      relationship: "Self",
      pepProvisional: false,
      sourceDoc: "Investor profile",
      screeningStatus: "Screening completed",
      provider: "OpenSanctions",
      matches: [],
      screenedAt: "2026-01-01T00:00:00Z",
    };
    currentCase = baseCase({
      complianceOnly: {
        redFlags: [],
        suggestedOutcome: "PENDING",
        reasoning: [],
        riskScore: 0,
        riskBand: "Low",
        namesToScreen: [completed],
        furtherInfoRequests: [],
        reviewerNotes: [],
      },
    });
    const fetchFn = vi.fn();
    const updated = await runScreeningLogic("TEST-001", { fetchFn: fetchFn as unknown as typeof fetch });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(updated.complianceOnly.namesToScreen[0].screeningStatus).toBe("Screening completed");
  });
});
