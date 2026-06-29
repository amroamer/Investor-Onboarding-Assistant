import { describe, it, expect } from "vitest";
import {
  applyAddRfiDraft,
  applySendRfis,
  applyRespondToRfi,
  applyMarkRfiResolved,
} from "./compliance";
import { emptyStepperComplianceState } from "@/lib/stepper/compliance";

describe("RFI lifecycle helpers", () => {
  it("addRfiDraft pushes a new draft", () => {
    const state = emptyStepperComplianceState("STP-RFI");
    const next = applyAddRfiDraft(state, "  Please upload a current passport.  ");
    expect(next.furtherInfoRequests).toHaveLength(1);
    expect(next.furtherInfoRequests[0]).toMatchObject({
      text: "Please upload a current passport.",
      status: "draft",
      selected: true,
    });
  });

  it("addRfiDraft rejects empty text", () => {
    const state = emptyStepperComplianceState("STP-RFI");
    expect(() => applyAddRfiDraft(state, "  ")).toThrow();
  });

  it("sendRfis flips selected drafts to sent and stamps sentAt", () => {
    let state = emptyStepperComplianceState("STP-RFI");
    state = applyAddRfiDraft(state, "Doc A");
    state = applyAddRfiDraft(state, "Doc B");
    const ids = state.furtherInfoRequests.map((r) => r.id);
    state = applySendRfis(state, ids);
    expect(state.furtherInfoRequests.every((r) => r.status === "sent")).toBe(true);
    expect(state.furtherInfoRequests.every((r) => !!r.sentAt)).toBe(true);
  });

  it("sendRfis rejects an empty selection", () => {
    const state = emptyStepperComplianceState("STP-RFI");
    expect(() => applySendRfis(state, [])).toThrow();
  });

  it("respondToRfi only updates rows currently sent", () => {
    let state = emptyStepperComplianceState("STP-RFI");
    state = applyAddRfiDraft(state, "Doc A");
    state = applyAddRfiDraft(state, "Doc B");
    const [a, b] = state.furtherInfoRequests.map((r) => r.id);
    state = applySendRfis(state, [a]);
    state = applyRespondToRfi(state, a, "Here it is.");
    state = applyRespondToRfi(state, b, "should not apply"); // b is still draft
    const rowA = state.furtherInfoRequests.find((r) => r.id === a)!;
    const rowB = state.furtherInfoRequests.find((r) => r.id === b)!;
    expect(rowA.status).toBe("responded");
    expect(rowA.investorResponseText).toBe("Here it is.");
    expect(rowB.status).toBe("draft");
    expect(rowB.investorResponseText).toBeUndefined();
  });

  it("markRfiResolved sets status + resolvedAt + note", () => {
    let state = emptyStepperComplianceState("STP-RFI");
    state = applyAddRfiDraft(state, "Doc A");
    const id = state.furtherInfoRequests[0].id;
    state = applySendRfis(state, [id]);
    state = applyMarkRfiResolved(state, id, "Confirmed via call");
    const row = state.furtherInfoRequests[0];
    expect(row.status).toBe("resolved");
    expect(row.resolvedAt).toBeTruthy();
    expect(row.resolutionNote).toBe("Confirmed via call");
  });

  it("respondToRfi rejects empty response text", () => {
    let state = emptyStepperComplianceState("STP-RFI");
    state = applyAddRfiDraft(state, "Doc A");
    const id = state.furtherInfoRequests[0].id;
    state = applySendRfis(state, [id]);
    expect(() => applyRespondToRfi(state, id, "   ")).toThrow();
  });
});
