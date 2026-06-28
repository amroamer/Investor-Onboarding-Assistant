import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentEvent, StreamChunk } from "@/lib/agent/types";
import type { OnboardingCase } from "@/lib/onboarding/types";

// Mock the Anthropic SDK before importing LLMAgent. We capture per-test the response
// the mock should return and any stream events for streaming tests.
let nextResponse: { content: Array<{ type: string; [k: string]: unknown }> } | null = null;
let nextStreamEvents: Array<Record<string, unknown>> = [];

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class BadRequestError extends APIError {}

  class MockAnthropic {
    messages = {
      create: vi.fn(async () => {
        if (!nextResponse) throw new Error("nextResponse not set by test");
        return nextResponse;
      }),
      stream: vi.fn(() => {
        const events = nextStreamEvents;
        return {
          async *[Symbol.asyncIterator]() {
            for (const e of events) yield e;
          },
        };
      }),
    };
  }

  return {
    default: MockAnthropic,
    Anthropic: MockAnthropic,
    APIError,
    RateLimitError,
    InternalServerError,
    AuthenticationError,
    PermissionDeniedError,
    BadRequestError,
  };
});

import { LLMAgent, __TOOL_SCHEMAS } from "./llm";

function emptyCase(): OnboardingCase {
  return {
    caseId: "TEST-001",
    investorName: "Test Investor",
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
  };
}

beforeEach(() => {
  nextResponse = null;
  nextStreamEvents = [];
});

describe("LLMAgent — tool schemas", () => {
  it("exposes every tool with strict schemas (no additionalProperties)", () => {
    const names = __TOOL_SCHEMAS.map((t) => t.name);
    expect(names).toEqual([
      "emit_message",
      "update_case",
      "add_related_party",
      "update_related_party",
      "remove_related_party",
      "add_audit_event",
    ]);
    for (const tool of __TOOL_SCHEMAS) {
      expect((tool.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(
        false,
      );
    }
  });

  it("stage_status is keyed by the 7 stage names with the 6-value status enum", () => {
    const updateCase = __TOOL_SCHEMAS.find((t) => t.name === "update_case")!;
    const stageStatus = (
      updateCase.input_schema as {
        properties: { stage_status: { properties: Record<string, { enum: string[] }> } };
      }
    ).properties.stage_status;
    expect(Object.keys(stageStatus.properties).sort()).toEqual(
      [
        "Declarations",
        "Documents",
        "Investor profile",
        "Ownership and related parties",
        "Review and confirmation",
        "Source of Wealth and Source of Funds",
        "Submitted to Compliance",
      ].sort(),
    );
    expect(stageStatus.properties["Investor profile"].enum).toEqual([
      "Not started",
      "In progress",
      "Action required",
      "Ready for review",
      "Confirmed",
      "Submitted",
    ]);
  });
});

describe("LLMAgent.respond — tool_use translation", () => {
  it("translates emit_message tool calls into ConversationMessage entries", async () => {
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "tool_1",
          name: "emit_message",
          input: {
            text: "Welcome.",
            component_kind: "choices",
            choices: [
              { id: "guided", label: "Guide me step by step" },
              { id: "upload-first", label: "I'll upload my documents first" },
            ],
          },
        },
      ],
    };
    const r = await new LLMAgent().respond(emptyCase(), { kind: "session_start" });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].author).toBe("agent");
    expect(r.messages[0].text).toBe("Welcome.");
    expect(r.messages[0].component?.kind).toBe("choices");
    if (r.messages[0].component?.kind === "choices") {
      expect(r.messages[0].component.choices).toHaveLength(2);
    }
  });

  it("translates update_case into a structured patch", async () => {
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "tool_1",
          name: "update_case",
          input: {
            stage_status: { "Ownership and related parties": "Confirmed" },
            ownership_confirmed: true,
          },
        },
      ],
    };
    const r = await new LLMAgent().respond(emptyCase(), { kind: "card_submit_ownership" });
    expect(r.patch?.ownershipConfirmed).toBe(true);
    expect(r.patch?.stageStatus?.["Ownership and related parties"]).toBe("Confirmed");
  });

  it("translates source_of_wealth from tool call into a typed object", async () => {
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "tool_1",
          name: "update_case",
          input: {
            source_of_wealth: {
              category: "Business proceeds",
              detail: "Sale of operating business",
            },
          },
        },
      ],
    };
    const r = await new LLMAgent().respond(emptyCase(), {
      kind: "card_submit_sow",
      category: "Business proceeds",
      detail: "Sale of operating business",
    });
    expect(r.patch?.sourceOfWealth).toEqual({
      category: "Business proceeds",
      detail: "Sale of operating business",
      source: "Provided by you",
    });
  });

  it("translates add_audit_event tool calls into audit entries", async () => {
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "tool_1",
          name: "add_audit_event",
          input: { actor: "Investor", type: "Mode selected", detail: "Guided" },
        },
      ],
    };
    const r = await new LLMAgent().respond(emptyCase(), {
      kind: "user_choice",
      choiceId: "guided",
      label: "Guide me step by step",
    });
    expect(r.audit).toHaveLength(1);
    expect(r.audit?.[0]).toMatchObject({
      actor: "Investor",
      type: "Mode selected",
      detail: "Guided",
    });
  });

  it("emits the investor echo first for user_choice events", async () => {
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "tool_1",
          name: "emit_message",
          input: { text: "Thanks." },
        },
      ],
    };
    const r = await new LLMAgent().respond(emptyCase(), {
      kind: "user_choice",
      choiceId: "guided",
      label: "Guide me step by step",
    });
    expect(r.messages[0].author).toBe("investor");
    expect(r.messages[0].text).toBe("Guide me step by step");
    expect(r.messages[1].author).toBe("agent");
  });

  it("falls back to plain text message if LLM emits a text block", async () => {
    nextResponse = {
      content: [{ type: "text", text: "Some stray text from the model." }],
    };
    const r = await new LLMAgent().respond(emptyCase(), { kind: "session_start" });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].text).toBe("Some stray text from the model.");
  });

  it("handles an empty response (no tool_use, no text)", async () => {
    nextResponse = { content: [] };
    const r = await new LLMAgent().respond(emptyCase(), { kind: "session_start" });
    expect(r.messages).toHaveLength(0);
    expect(r.patch).toEqual({});
    expect(r.audit).toHaveLength(0);
  });
});

describe("LLMAgent.streamRespond — chunk emission", () => {
  it("emits investor echo + each emit_message tool call as a message_complete chunk", async () => {
    nextStreamEvents = [
      // First tool_use block starts (emit_message)
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "emit_message", input: {} },
      },
      // Stream the JSON input in two chunks
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"text":"Hel' },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: 'lo there."}' },
      },
      { type: "content_block_stop", index: 0 },
    ];

    const chunks: StreamChunk[] = [];
    const r = await new LLMAgent().streamRespond(emptyCase(), { kind: "session_start" }, (c) =>
      chunks.push(c),
    );

    // session_start has no investor echo, so just the one message
    expect(chunks).toHaveLength(1);
    expect(chunks[0].kind).toBe("message_complete");
    if (chunks[0].kind === "message_complete") {
      expect(chunks[0].message.text).toBe("Hello there.");
    }
    expect(r.messages).toHaveLength(1);
  });

  it("emits an investor echo chunk first for events that need one", async () => {
    nextStreamEvents = [
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "emit_message", input: {} },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"text":"Got it."}' },
      },
      { type: "content_block_stop", index: 0 },
    ];

    const chunks: StreamChunk[] = [];
    await new LLMAgent().streamRespond(
      emptyCase(),
      { kind: "user_choice", choiceId: "guided", label: "Guide me step by step" },
      (c) => chunks.push(c),
    );

    expect(chunks).toHaveLength(2);
    if (chunks[0].kind === "message_complete") {
      expect(chunks[0].message.author).toBe("investor");
      expect(chunks[0].message.text).toBe("Guide me step by step");
    }
    if (chunks[1].kind === "message_complete") {
      expect(chunks[1].message.author).toBe("agent");
    }
  });

  it("emits patch + audit chunks separately when LLM uses those tools", async () => {
    nextStreamEvents = [
      // emit_message
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "emit_message", input: {} },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"text":"Done."}' },
      },
      { type: "content_block_stop", index: 0 },
      // update_case
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "t2", name: "update_case", input: {} },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"ownership_confirmed":true}' },
      },
      { type: "content_block_stop", index: 1 },
      // add_audit_event
      {
        type: "content_block_start",
        index: 2,
        content_block: { type: "tool_use", id: "t3", name: "add_audit_event", input: {} },
      },
      {
        type: "content_block_delta",
        index: 2,
        delta: {
          type: "input_json_delta",
          partial_json: '{"actor":"Investor","type":"Ownership confirmed","detail":"OK"}',
        },
      },
      { type: "content_block_stop", index: 2 },
    ];

    const chunks: StreamChunk[] = [];
    const r = await new LLMAgent().streamRespond(
      emptyCase(),
      { kind: "card_submit_ownership" },
      (c) => chunks.push(c),
    );

    const kinds = chunks.map((c) => c.kind);
    // investor echo + agent message + patch + audit = 4 chunks
    expect(kinds).toContain("patch");
    expect(kinds).toContain("audit");
    expect(r.patch?.ownershipConfirmed).toBe(true);
    expect(r.audit).toHaveLength(1);
  });

  it("ignores malformed tool input JSON without crashing", async () => {
    nextStreamEvents = [
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "emit_message", input: {} },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "this is { not valid json" },
      },
      { type: "content_block_stop", index: 0 },
    ];

    const chunks: StreamChunk[] = [];
    await new LLMAgent().streamRespond(emptyCase(), { kind: "session_start" }, (c) =>
      chunks.push(c),
    );
    expect(chunks).toHaveLength(0);
  });
});

describe("LLMAgent.respond — new tool surface (identity, FATCA, PEP marks, party CRUD)", () => {
  it("update_case persists identity fields + identity_confirmed", async () => {
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "update_case",
          input: {
            investor_name: "Amelia Rose Brooks",
            primary_contact: "amelia@example.test",
            jurisdiction: "United Arab Emirates",
            dob: "1987-05-14",
            identity_confirmed: true,
          },
        },
      ],
    };
    const r = await new LLMAgent().respond(emptyCase(), {
      kind: "card_submit_identity",
      legalName: "Amelia Rose Brooks",
      primaryContact: "amelia@example.test",
      jurisdiction: "United Arab Emirates",
      dob: "1987-05-14",
    });
    expect(r.patch?.investorName).toBe("Amelia Rose Brooks");
    expect(r.patch?.primaryContact).toBe("amelia@example.test");
    expect(r.patch?.jurisdiction).toBe("United Arab Emirates");
    expect(r.patch?.dob).toBe("1987-05-14");
    expect(r.patch?.sectionConfirmations?.identity).toBe(true);
  });

  it("update_case persists fatca { tin, section }", async () => {
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "update_case",
          input: {
            fatca_confirmed: true,
            fatca: { tin: "98-7654321", section: "Section 2 — Passive NFFE" },
          },
        },
      ],
    };
    const r = await new LLMAgent().respond(emptyCase(), {
      kind: "card_submit_fatca",
      tin: "98-7654321",
      section: "Section 2 — Passive NFFE",
    });
    expect(r.patch?.fatcaConfirmed).toBe(true);
    expect(r.patch?.fatca?.tin).toBe("98-7654321");
    expect(r.patch?.fatca?.section).toBe("Section 2 — Passive NFFE");
  });

  it("update_case pep_marks writes pepStatus + pepProvisional onto matched parties", async () => {
    const base = emptyCase();
    base.relatedParties = [
      { id: "p1", name: "A", role: "Director", partyType: "Individual" },
      { id: "p2", name: "B", role: "Director", partyType: "Individual" },
    ];
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "update_case",
          input: { pep_confirmed: true, pep_marks: { p1: "foreign", p2: "no" } },
        },
      ],
    };
    const r = await new LLMAgent().respond(base, { kind: "card_submit_pep" });
    expect(r.patch?.pepConfirmed).toBe(true);
    const p1 = r.patch?.relatedParties?.find((p) => p.id === "p1");
    const p2 = r.patch?.relatedParties?.find((p) => p.id === "p2");
    expect(p1?.pepStatus).toBe("foreign");
    expect(p1?.pepProvisional).toBe(true);
    expect(p2?.pepStatus).toBe("no");
    expect(p2?.pepProvisional).toBe(false);
  });

  it("add_related_party appends a new party with a generated id", async () => {
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "add_related_party",
          input: {
            name: "Jane Doe",
            role: "Beneficial Owner",
            party_type: "Individual",
            ownership_pct: 30,
            nationality: "British",
          },
        },
      ],
    };
    const r = await new LLMAgent().respond(emptyCase(), {
      kind: "related_party_add",
      party: {
        name: "Jane Doe",
        role: "Beneficial Owner",
        partyType: "Individual",
        ownershipPct: 30,
      },
    });
    expect(r.patch?.relatedParties).toHaveLength(1);
    expect(r.patch?.relatedParties?.[0].name).toBe("Jane Doe");
    expect(r.patch?.relatedParties?.[0].ownershipPct).toBe(30);
    expect(r.patch?.relatedParties?.[0].id).toBeTruthy();
  });

  it("update_related_party modifies fields on the matched party only", async () => {
    const base = emptyCase();
    base.relatedParties = [
      { id: "p1", name: "Original", role: "Director", partyType: "Individual" },
      { id: "p2", name: "Untouched", role: "Director", partyType: "Individual" },
    ];
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "update_related_party",
          input: { party_id: "p1", name: "Renamed", ownership_pct: 51 },
        },
      ],
    };
    const r = await new LLMAgent().respond(base, {
      kind: "related_party_update",
      partyId: "p1",
      changes: { name: "Renamed", ownershipPct: 51 },
    });
    const p1 = r.patch?.relatedParties?.find((p) => p.id === "p1");
    const p2 = r.patch?.relatedParties?.find((p) => p.id === "p2");
    expect(p1?.name).toBe("Renamed");
    expect(p1?.ownershipPct).toBe(51);
    expect(p1?.role).toBe("Director"); // unchanged
    expect(p2?.name).toBe("Untouched");
  });

  it("remove_related_party drops the matched party", async () => {
    const base = emptyCase();
    base.relatedParties = [
      { id: "p1", name: "A", role: "Director", partyType: "Individual" },
      { id: "p2", name: "B", role: "Director", partyType: "Individual" },
    ];
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "remove_related_party",
          input: { party_id: "p1" },
        },
      ],
    };
    const r = await new LLMAgent().respond(base, {
      kind: "related_party_remove",
      partyId: "p1",
    });
    expect(r.patch?.relatedParties).toHaveLength(1);
    expect(r.patch?.relatedParties?.[0].id).toBe("p2");
  });

  it("multiple related-party tools compose in one turn", async () => {
    const base = emptyCase();
    base.relatedParties = [{ id: "p_old", name: "Old", role: "Director", partyType: "Individual" }];
    nextResponse = {
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "add_related_party",
          input: { name: "New", role: "Director", party_type: "Individual" },
        },
        {
          type: "tool_use",
          id: "t2",
          name: "remove_related_party",
          input: { party_id: "p_old" },
        },
      ],
    };
    const r = await new LLMAgent().respond(base, {
      kind: "related_party_add",
      party: { name: "New", role: "Director", partyType: "Individual" },
    });
    expect(r.patch?.relatedParties).toHaveLength(1);
    expect(r.patch?.relatedParties?.[0].name).toBe("New");
  });
});

describe("LLMAgent — describeRole / describeTools", () => {
  it("describeRole returns a meaningful system prompt", () => {
    expect(new LLMAgent().describeRole().length).toBeGreaterThan(100);
  });

  it("describeTools mirrors the wire tools (name + description)", () => {
    const tools = new LLMAgent().describeTools();
    expect(tools.map((t) => t.name)).toEqual([
      "emit_message",
      "update_case",
      "add_related_party",
      "update_related_party",
      "remove_related_party",
      "add_audit_event",
    ]);
    expect(tools.every((t) => t.description.length > 0)).toBe(true);
  });
});
