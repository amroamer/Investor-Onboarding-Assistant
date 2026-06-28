import { randomUUID } from "node:crypto";
import type { Agent, AgentEvent, AgentResponse, AgentToolDef } from "@/lib/agent/types";
import type {
  OnboardingCase,
  ConversationMessage,
  EmbeddedComponent,
  LegalForm,
  AuditEvent,
  PepStatus,
  RelatedParty,
} from "@/lib/onboarding/types";
import { requirementsFor } from "@/lib/onboarding/requirements";

const id = () => randomUUID().slice(0, 8);
const now = () => new Date().toISOString();

function agentMsg(text: string, component?: EmbeddedComponent): ConversationMessage {
  return { id: id(), author: "agent", text, at: now(), component };
}
function investorMsg(text: string): ConversationMessage {
  return { id: id(), author: "investor", text, at: now() };
}
function auditEvt(actor: AuditEvent["actor"], type: string, detail: string): AuditEvent {
  return { id: id(), at: now(), actor, type, detail };
}

const CONTROLLED_DEFLECTION =
  "I can help you complete your onboarding information and resolve any outstanding document requirements. Internal compliance assessments and review criteria are handled separately by the Compliance team and are not disclosed.";

const TRIGGERS = [
  /risk\s*score|risk\s*rating|risk\s*band/i,
  /how\s+is.*calculat|formula|threshold/i,
  /pass(ed)?\s*kyc|have\s+i\s+passed/i,
  /red\s*flag|why.*flagged/i,
  /system\s+prompt|internal\s+(rules|instructions|methodolog)/i,
  /ignore\s+(your\s+)?previous\s+instructions/i,
  /mark\s+me\s+(low|high)\s+risk/i,
  /avoid\s+being\s+flagged/i,
  /compliance\s+(rules|methodolog|scoring)/i,
];

const LEGAL_FORMS: readonly LegalForm[] = [
  "Individual",
  "Limited Partnership",
  "Corporation",
  "Trust",
  "Regulated or Listed Entity",
];

function isLegalForm(s: string): s is LegalForm {
  return (LEGAL_FORMS as readonly string[]).includes(s);
}

/**
 * Deterministic agent. Same surface as a future LLMAgent — given a case and an event,
 * returns messages + a structured patch. No backend state lives here; the server fn
 * applies the patch and persists.
 */
export class RuleBasedAgent implements Agent {
  describeRole(): string {
    return `You are the MGX investor onboarding agent.
Help the investor complete KYC onboarding. Adapt requested documents to their legal form. Acknowledge uploads after the extraction+classification+validation pipeline. Walk through Source of Wealth, Source of Funds, PEP and FATCA declarations. Prepare a review summary before final submission.

Constraints:
- Never disclose internal compliance assessments or review criteria.
- Pass/fail decisions are made by the human Compliance team, never by you.
- Stay focused on the investor's onboarding.`;
  }

  describeTools(): AgentToolDef[] {
    return [
      {
        name: "emit_message",
        description:
          "Append an agent message to the conversation. Optionally attach an interactive component card (kind: choices | upload | checklist | ownership | sourceOfWealth | sourceOfFunds | pep | fatca | review | receipt | extracted | requirements).",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" }, component: { type: "object" } },
          required: ["text"],
        },
      },
      {
        name: "update_case",
        description:
          "Apply a structured patch to the case (stageStatus, legalForm, sourceOfWealth, sourceOfFunds, pepConfirmed, fatcaConfirmed, etc.).",
        inputSchema: {
          type: "object",
          properties: { patch: { type: "object" } },
          required: ["patch"],
        },
      },
      {
        name: "add_audit_event",
        description: "Append a single event to the audit log.",
        inputSchema: {
          type: "object",
          properties: {
            actor: { type: "string", enum: ["Investor", "Agent", "Compliance"] },
            type: { type: "string" },
            detail: { type: "string" },
          },
          required: ["actor", "type", "detail"],
        },
      },
    ];
  }

  async respond(c: OnboardingCase, event: AgentEvent): Promise<AgentResponse> {
    switch (event.kind) {
      case "session_start":
        return this.sessionStart(c);
      case "user_choice":
        return this.userChoice(c, event.choiceId, event.label);
      case "user_text":
        return this.userText(event.text);
      case "card_submit_identity":
        return this.submitIdentity(c, event);
      case "card_submit_ownership":
        return this.confirmOwnership(c);
      case "related_party_add":
        return this.addRelatedParty(c, event.party);
      case "related_party_update":
        return this.updateRelatedParty(c, event.partyId, event.changes);
      case "related_party_remove":
        return this.removeRelatedParty(c, event.partyId);
      case "card_submit_sow":
        return this.setSoW(event.category, event.detail);
      case "card_submit_sof":
        return this.setSoF(c, event.category, event.detail);
      case "card_submit_pep":
        return this.confirmPEP(c, event.marks);
      case "card_submit_fatca":
        return this.confirmFATCA(c, event.tin, event.section);
      case "card_submit_review":
        return this.finalSubmit(c);
      case "checklist_provide":
        return this.provideMissingItem(c, event.itemId);
      case "checklist_replace":
        return this.replaceChecklistItem(c, event.itemId);
      case "documents_uploaded":
        return this.documentsUploaded(c, event.classifications);
    }
  }

  /* ---------- branches ---------- */

  private sessionStart(c: OnboardingCase): AgentResponse {
    if (c.conversation.length > 0) return { messages: [] };
    return {
      messages: [
        agentMsg(
          "Welcome. I'll help you complete your investor onboarding step by step — first I'll learn who's investing, then we'll work through documents, declarations and a final review. Your progress is saved at every step.",
        ),
        agentMsg(
          "To prepare your document checklist, please tell me the legal form of the investing party.",
          {
            kind: "choices",
            choices: LEGAL_FORMS.map((f) => ({
              id: f,
              label: f === "Corporation" ? "Corporation or Private Trust Corporation" : f,
            })),
          },
        ),
      ],
      patch: {
        step: "awaiting_legal_form",
        stageStatus: { ...c.stageStatus, "Investor profile": "In progress" },
      },
    };
  }

  private userChoice(c: OnboardingCase, choiceId: string, label?: string): AgentResponse {
    if (isLegalForm(choiceId)) {
      return this.selectLegalForm(choiceId, label ?? choiceId);
    }
    if (choiceId === "confirm_entity") return this.confirmEntity(c);
    if (choiceId === "open_ownership") return this.openOwnership();
    if (choiceId === "show_outstanding") {
      return {
        messages: [
          investorMsg(label ?? "Show outstanding items"),
          agentMsg("Here are the items that currently require your attention.", {
            kind: "checklist",
          }),
        ],
      };
    }
    if (choiceId === "review_info") {
      return {
        messages: [
          investorMsg(label ?? "Review extracted information"),
          agentMsg(
            "Here is the information already on file. You can correct anything before submission.",
            {
              kind: "extracted",
              title: "Information on file",
              fields: c.extractedFields,
            },
          ),
        ],
      };
    }
    if (choiceId === "correct_entity") {
      return {
        messages: [
          investorMsg(label ?? "Correct this information"),
          agentMsg("Please describe the correction below, or upload a clarifying document."),
        ],
      };
    }
    return { messages: [investorMsg(label ?? choiceId)] };
  }

  private selectLegalForm(form: LegalForm, label: string): AgentResponse {
    const introCopy =
      form === "Individual"
        ? "Thanks. Before we move to documents, please confirm your identity details so I can prepare your file."
        : `Thanks. For a ${label.toLowerCase()}, please confirm the entity's identity details so I can prepare the file.`;
    return {
      messages: [investorMsg(label), agentMsg(introCopy, { kind: "identity", legalForm: form })],
      patch: { legalForm: form, step: "awaiting_identity" },
    };
  }

  private submitIdentity(
    c: OnboardingCase,
    event: Extract<AgentEvent, { kind: "card_submit_identity" }>,
  ): AgentResponse {
    const form = c.legalForm;
    if (!form) {
      return {
        messages: [
          agentMsg(
            "I don't have a legal form on file yet — please pick one before submitting identity.",
          ),
        ],
      };
    }
    const groups = requirementsFor(form);
    const patch: Partial<OnboardingCase> = {
      investorName: event.legalName.trim() || c.investorName,
      primaryContact: event.primaryContact.trim() || c.primaryContact,
      jurisdiction: event.jurisdiction.trim() || c.jurisdiction,
      step: "guided_upload",
      stageStatus: {
        ...c.stageStatus,
        "Investor profile": "Confirmed",
        Documents: "In progress",
      },
      sectionConfirmations: {
        ...c.sectionConfirmations,
        identity: true,
      },
    };
    if (event.dob && event.dob.trim()) patch.dob = event.dob.trim();
    return {
      messages: [
        investorMsg(`Identity confirmed: ${event.legalName.trim() || c.investorName}`),
        agentMsg(
          "Identity recorded. Here are the documents we will need to complete onboarding. You can upload everything now, or work through them one at a time.",
          { kind: "requirements", legalForm: form, groups },
        ),
        agentMsg("When you're ready, you can upload any of these documents here.", {
          kind: "upload",
        }),
      ],
      patch,
      audit: [
        auditEvt(
          "Investor",
          "Identity confirmed",
          `Confirmed identity for ${event.legalName.trim() || c.investorName}`,
        ),
      ],
    };
  }

  private confirmEntity(c: OnboardingCase): AgentResponse {
    return {
      messages: [
        investorMsg("Yes, confirm"),
        agentMsg(
          "Thank you. I have completed the company profile and mapped the current document requirements. A few items may need your attention before submission.",
          { kind: "checklist" },
        ),
        agentMsg("When you're ready, please review the ownership structure I identified.", {
          kind: "choices",
          choices: [
            { id: "open_ownership", label: "Review ownership structure" },
            { id: "show_outstanding", label: "Show outstanding items" },
          ],
        }),
      ],
      patch: {
        step: "post_entity_confirm",
        sectionConfirmations: {
          ...c.sectionConfirmations,
          investorProfile: true,
        },
        stageStatus: {
          ...c.stageStatus,
          "Investor profile": "Confirmed",
          "Ownership and related parties": "In progress",
        },
      },
    };
  }

  private openOwnership(): AgentResponse {
    return {
      messages: [
        investorMsg("Review ownership structure"),
        agentMsg(
          "Here is the ownership structure I identified from your registers. Please correct any details and confirm when complete.",
          { kind: "ownership" },
        ),
      ],
      patch: { step: "ownership_review" },
    };
  }

  private confirmOwnership(c: OnboardingCase): AgentResponse {
    return {
      messages: [
        investorMsg("Confirm ownership structure"),
        agentMsg(
          "Ownership structure confirmed. Next, please confirm the Source of Wealth for the investing entity. This describes how the entity accumulated its overall wealth.",
          { kind: "sourceOfWealth" },
        ),
      ],
      patch: {
        ownershipConfirmed: true,
        step: "sow",
        stageStatus: {
          ...c.stageStatus,
          "Ownership and related parties": "Confirmed",
          "Source of Wealth and Source of Funds": "In progress",
        },
      },
      audit: [
        auditEvt("Investor", "Ownership confirmed", "Investor confirmed ownership structure"),
      ],
    };
  }

  private setSoW(category: string, detail: string): AgentResponse {
    return {
      messages: [
        investorMsg(`Source of Wealth: ${category}`),
        agentMsg(
          "Recorded. Next, please confirm the Source of Funds — where the specific subscription monies will come from.",
          { kind: "sourceOfFunds" },
        ),
      ],
      patch: {
        sourceOfWealth: { category, detail, source: "Provided by you" },
        step: "sof",
      },
    };
  }

  private setSoF(c: OnboardingCase, category: string, detail: string): AgentResponse {
    return {
      messages: [
        investorMsg(`Source of Funds: ${category}`),
        agentMsg(
          "Thank you. Please complete the PEP declaration for individuals identified through the ownership and control structure.",
          { kind: "pep" },
        ),
      ],
      patch: {
        sourceOfFunds: { category, detail, source: "Provided by you" },
        step: "pep",
        stageStatus: {
          ...c.stageStatus,
          "Source of Wealth and Source of Funds": "Confirmed",
          Declarations: "In progress",
        },
      },
    };
  }

  private confirmPEP(c: OnboardingCase, marks?: Record<string, PepStatus>): AgentResponse {
    const audits: AuditEvent[] = [];
    let relatedParties: RelatedParty[] | undefined;
    let pepMatches = 0;
    if (marks && Object.keys(marks).length > 0) {
      relatedParties = c.relatedParties.map((p) => {
        const m = marks[p.id];
        if (!m) return p;
        return { ...p, pepStatus: m, pepProvisional: m !== "no" };
      });
      pepMatches = relatedParties.filter((p) => p.pepStatus && p.pepStatus !== "no").length;
    }
    audits.push(
      auditEvt(
        "Investor",
        "PEP declarations recorded",
        pepMatches > 0
          ? `${pepMatches} individual(s) marked as PEP / connected party.`
          : "Declaration submitted — no PEP / connected party indicated.",
      ),
    );
    const patch: Partial<OnboardingCase> = { pepConfirmed: true, step: "fatca" };
    if (relatedParties) patch.relatedParties = relatedParties;
    return {
      messages: [
        investorMsg("PEP declaration submitted"),
        agentMsg("Recorded. Now please complete the FATCA / CRS section.", { kind: "fatca" }),
      ],
      patch,
      audit: audits,
    };
  }

  private confirmFATCA(c: OnboardingCase, tin?: string, section?: string): AgentResponse {
    const patch: Partial<OnboardingCase> = {
      fatcaConfirmed: true,
      step: "review",
      stageStatus: {
        ...c.stageStatus,
        Declarations: "Confirmed",
        "Review and confirmation": "In progress",
      },
    };
    if (tin && tin.trim()) {
      patch.fatca = {
        tin: tin.trim(),
        section: section?.trim() || c.fatca?.section || "Section 3 — Active NFFE",
      };
    } else if (section && section.trim()) {
      patch.fatca = {
        tin: c.fatca?.tin ?? "",
        section: section.trim(),
      };
    }
    return {
      messages: [
        investorMsg("FATCA / CRS responses confirmed"),
        agentMsg(
          "I have prepared your onboarding information using the documents and responses provided. Please review the highlighted sections before confirming submission to the Compliance team.",
          { kind: "review" },
        ),
      ],
      patch,
      audit: [
        auditEvt(
          "Investor",
          "FATCA / CRS recorded",
          patch.fatca
            ? `Classification: ${patch.fatca.section}${patch.fatca.tin ? ` · TIN on file` : ""}.`
            : "Declaration submitted without TIN.",
        ),
      ],
    };
  }

  private addRelatedParty(
    c: OnboardingCase,
    party: Omit<RelatedParty, "id" | "pepProvisional" | "pepStatus">,
  ): AgentResponse {
    if (!party.name.trim() || !party.role.trim()) {
      return {
        messages: [
          agentMsg(
            "I need at least a name and a role to add a related party. Please retry with both fields filled in.",
          ),
        ],
      };
    }
    const newParty: RelatedParty = {
      ...party,
      name: party.name.trim(),
      role: party.role.trim(),
      id: id(),
    };
    return {
      messages: [],
      patch: { relatedParties: [...c.relatedParties, newParty] },
      audit: [
        auditEvt(
          "Investor",
          "Related party added",
          `Added ${newParty.name} (${newParty.role}${newParty.ownershipPct != null ? `, ${newParty.ownershipPct}%` : ""}).`,
        ),
      ],
    };
  }

  private updateRelatedParty(
    c: OnboardingCase,
    partyId: string,
    changes: Partial<Omit<RelatedParty, "id">>,
  ): AgentResponse {
    const idx = c.relatedParties.findIndex((p) => p.id === partyId);
    if (idx < 0) {
      return {
        messages: [agentMsg("I couldn't find that party in the ownership list.")],
      };
    }
    const before = c.relatedParties[idx];
    const after: RelatedParty = {
      ...before,
      ...changes,
      id: before.id,
    };
    const relatedParties = [...c.relatedParties];
    relatedParties[idx] = after;
    return {
      messages: [],
      patch: { relatedParties },
      audit: [
        auditEvt(
          "Investor",
          "Related party updated",
          `Updated ${after.name} (${after.role}${after.ownershipPct != null ? `, ${after.ownershipPct}%` : ""}).`,
        ),
      ],
    };
  }

  private removeRelatedParty(c: OnboardingCase, partyId: string): AgentResponse {
    const party = c.relatedParties.find((p) => p.id === partyId);
    if (!party) {
      return {
        messages: [agentMsg("That party isn't on the ownership list.")],
      };
    }
    return {
      messages: [],
      patch: { relatedParties: c.relatedParties.filter((p) => p.id !== partyId) },
      audit: [
        auditEvt("Investor", "Related party removed", `Removed ${party.name} (${party.role}).`),
      ],
    };
  }

  private finalSubmit(c: OnboardingCase): AgentResponse {
    const submittedAt = now();
    return {
      messages: [
        investorMsg("Confirm all and submit"),
        agentMsg(
          "Your onboarding information has been submitted to the Compliance team for review. Submission does not constitute approval. We will contact you if further information is required.",
          { kind: "receipt" },
        ),
      ],
      patch: {
        finalConfirmation: true,
        submittedAt,
        step: "submitted",
        stageStatus: {
          ...c.stageStatus,
          "Review and confirmation": "Confirmed",
          "Submitted to Compliance": "Submitted",
        },
      },
      audit: [
        auditEvt("Investor", "Case submitted", "Investor confirmed and submitted onboarding pack"),
      ],
    };
  }

  private userText(text: string): AgentResponse {
    const inv = investorMsg(text);
    let reply: string;
    let component: EmbeddedComponent | undefined;

    if (TRIGGERS.some((r) => r.test(text))) {
      if (/have\s+i\s+passed|pass(ed)?\s*kyc/i.test(text)) {
        reply =
          "Your information has not yet received final Compliance approval. I can show you what is complete and whether any investor action is still required.";
      } else if (/system\s+prompt|ignore\s+(your\s+)?previous\s+instructions/i.test(text)) {
        reply =
          "I'm unable to provide internal compliance rules or system instructions. I can assist with your onboarding requirements and submission status.";
      } else {
        reply = CONTROLLED_DEFLECTION;
      }
    } else if (/outstanding|what.*left|remaining|still\s+need/i.test(text)) {
      reply = "Here are the items that currently require your attention.";
      component = { kind: "checklist" };
    } else if (/why.*proof\s+of\s+address|why.*poa/i.test(text)) {
      reply =
        "It is used to verify your current residential address as part of the onboarding review. Please provide a recent document showing your name, residential address and issue date.";
    } else {
      reply =
        "I'm here to assist with your investor onboarding. I can help with the information, documents and declarations required for this application.";
    }
    return { messages: [inv, agentMsg(reply, component)] };
  }

  private provideMissingItem(c: OnboardingCase, itemId: string): AgentResponse {
    const checklist = c.checklist.map((item) =>
      item.id === itemId ? { ...item, status: "Received" as const, receivedAt: now() } : item,
    );
    return {
      messages: [],
      patch: { checklist },
      audit: [auditEvt("Investor", "Document uploaded", itemId)],
    };
  }

  private replaceChecklistItem(c: OnboardingCase, itemId: string): AgentResponse {
    const checklist = c.checklist.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status: "Replaced" as const,
            investorIssue: undefined,
            remedy: undefined,
            receivedAt: now(),
          }
        : item,
    );
    return {
      messages: [
        agentMsg(
          "Replacement received. I've updated the requirement. The new document will be included in the submission to Compliance.",
        ),
      ],
      patch: { checklist },
      audit: [auditEvt("Investor", "Document replaced", itemId)],
    };
  }

  private documentsUploaded(
    c: OnboardingCase,
    classifications: { fileName: string; classifiedAs: string }[],
  ): AgentResponse {
    if (classifications.length === 0) return { messages: [] };
    const failed = new Set(["Pending", "Processing failed", "Unsupported"]);
    const okCount = classifications.filter((d) => !failed.has(d.classifiedAs)).length;

    let summary: string;
    if (okCount === 0) {
      summary =
        "I couldn't process any of the documents you uploaded. Please review the errors next to each file and try again.";
    } else if (okCount === classifications.length) {
      summary = `I've processed ${okCount} document${okCount === 1 ? "" : "s"}. You can review the classification and the extracted Markdown for each in the file list.`;
    } else {
      summary = `I've processed ${okCount} of ${classifications.length} documents. The others could not be processed — see their entries in the file list.`;
    }

    const messages = [agentMsg(summary)];
    if (okCount > 0 && c.legalForm) {
      // Emit a fresh, fully interactive RequirementsCard as the post-upload status snapshot.
      // The card already has per-row Upload buttons for Pending items and View / Download /
      // Markdown actions for Received items, so the investor gets every action they need
      // without scrolling back up the chat.
      const groups = requirementsFor(c.legalForm);
      messages.push(
        agentMsg(
          "Updated checklist — upload the remaining items directly, or view / download what's already been received:",
          { kind: "requirements", legalForm: c.legalForm, groups },
        ),
      );

      // Offer a handoff to the ownership stage once at least one entity-tier doc
      // has been processed — gives the user a clear way to leave the document
      // stage without having to upload absolutely everything first.
      if (this.hasEntityTierDoc(c) && !c.sectionConfirmations?.investorProfile) {
        messages.push(
          agentMsg("Ready to move on?", {
            kind: "choices",
            choices: [{ id: "confirm_entity", label: "Continue to ownership review" }],
          }),
        );
      }
    }

    return {
      messages,
      patch: {
        stageStatus: {
          ...c.stageStatus,
          Documents:
            c.stageStatus.Documents === "Not started" ? "In progress" : c.stageStatus.Documents,
        },
      },
    };
  }

  private hasEntityTierDoc(c: OnboardingCase): boolean {
    const entityTier = new Set([
      "Certificate of Incorporation",
      "Certificate of Formation",
      "Articles of Association",
      "Limited Partnership Agreement",
      "Register of Members",
      "Register of Directors",
    ]);
    return c.uploadedDocuments.some((d) => entityTier.has(d.classifiedAs));
  }
}

export const agent: Agent = new RuleBasedAgent();
