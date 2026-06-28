/**
 * Stepper-specific document validator.
 *
 * Takes the structured output of the shared classifier and maps it onto the
 * stepper checklist for the active legal form. Returns checklist additions
 * and any attention notes the investor should resolve.
 *
 * This is intentionally NOT shared with src/server/validation.ts — the
 * stepper checklist has its own ID space (`requirementKey`) and its own
 * status enum.
 */
import { randomUUID } from "node:crypto";
import type { ClassifiedDoc } from "../classification";
import { isPresent } from "../classification";
import type {
  ChecklistItem,
  StepperLegalForm,
  StepperUploadedDocument,
} from "@/lib/stepper/types";
import { requirementsForDocumentType } from "@/lib/stepper/requirements";

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

function tryDate(s: string | null | undefined): Date | null {
  if (!isPresent(s ?? "")) return null;
  const d = new Date(s as string);
  return isNaN(d.getTime()) ? null : d;
}

export interface StepperValidationResult {
  classifiedAs: string;
  checklistAdditions: ChecklistItem[];
  matchedRequirementKeys: string[];
  extractedFields: Record<string, string>;
  agentMessage: string;
  auditDetail: string;
}

function humanLabel(type: ClassifiedDoc["document_type"]): string {
  switch (type) {
    case "passport": return "Passport / Photo ID";
    case "proof_of_address": return "Proof of address";
    case "certificate_of_incorporation": return "Certificate of Incorporation";
    case "certificate_of_formation": return "Certificate of Formation";
    case "limited_partnership_agreement": return "Constitutional document";
    case "register_of_members": return "Register of members";
    case "register_of_directors": return "Register of directors";
    case "articles_of_association": return "Articles of Association";
    case "pep_declaration": return "PEP declaration";
    case "fatca_declaration": return "Tax residency declaration";
    case "source_of_funds_evidence": return "Source of Funds evidence";
    case "bank_statement": return "Bank statement";
    case "other": return "Uncategorised document";
  }
}

export function validateStepperDocument(opts: {
  legalForm: StepperLegalForm;
  classified: ClassifiedDoc;
  docId: string;
  fileName: string;
  partyName: string;
}): StepperValidationResult {
  const { legalForm, classified, docId, fileName, partyName } = opts;
  const now = new Date();
  const reqs = requirementsForDocumentType(legalForm, classified.document_type);
  const checklist: ChecklistItem[] = [];
  const fields: Record<string, string> = {};
  const messages: string[] = [];

  // Heuristics for "Source of Wealth confirmation" vs "Bank statement" routing.
  // The classifier maps the SoW narrative PDF to `source_of_funds_evidence`
  // and the bank statement to `bank_statement`. For Individual, both
  // requirement keys (source_of_wealth, source_of_funds) accept both types
  // — so without disambiguation a single SoW narrative would erroneously
  // satisfy SoF too. Disambiguate by document text.
  const subtypeLc = (classified.document_subtype ?? "").toLowerCase();
  const summaryLc = (classified.summary ?? "").toLowerCase();
  const looksLikeBankStmt =
    classified.document_type === "bank_statement" ||
    subtypeLc.includes("bank statement") ||
    summaryLc.includes("bank statement") ||
    summaryLc.includes("account holder") && summaryLc.includes("transaction");
  const looksLikeSowNarrative =
    summaryLc.includes("source of wealth") || subtypeLc.includes("source of wealth");

  let matchedKeys: string[];
  if (classified.document_type === "bank_statement" || classified.document_type === "source_of_funds_evidence") {
    if (looksLikeBankStmt && !looksLikeSowNarrative) {
      matchedKeys = ["source_of_funds"];
    } else if (looksLikeSowNarrative && !looksLikeBankStmt) {
      matchedKeys = ["source_of_wealth"];
    } else {
      // Map both candidate requirement keys when ambiguous.
      matchedKeys = reqs.map((r) => r.key);
    }
  } else {
    matchedKeys = reqs.map((r) => r.key);
  }

  // Filter matchedKeys against actual requirements for the active form.
  const validRequirements = new Set(reqs.map((r) => r.key));
  matchedKeys = matchedKeys.filter((k) => validRequirements.has(k));

  if (matchedKeys.length === 0) {
    return {
      classifiedAs: humanLabel(classified.document_type),
      checklistAdditions: [],
      matchedRequirementKeys: [],
      extractedFields: {},
      agentMessage: `Received ${humanLabel(classified.document_type)} but it didn't match any required item for ${legalForm}.`,
      auditDetail: `Uploaded ${fileName}: ${humanLabel(classified.document_type)} — no requirement matched`,
    };
  }

  for (const r of reqs) {
    if (!matchedKeys.includes(r.key)) continue;

    let status: ChecklistItem["status"] = "received";
    let issue: string | undefined;
    let remedy: string | undefined;

    if (classified.document_type === "passport") {
      const expiry = tryDate(classified.expiry_date);
      if (expiry && expiry < now) {
        status = "attention";
        issue = `Document expired on ${classified.expiry_date}.`;
        remedy = "Please upload a current, in-date passport or ID.";
      }
    }

    if (classified.document_type === "proof_of_address") {
      const issued = tryDate(classified.issue_date);
      if (!issued) {
        status = "attention";
        issue = "Could not detect an issue date on the proof of address.";
        remedy = "Please upload a POA with a clearly visible issue date.";
      } else {
        const age = now.getTime() - issued.getTime();
        if (age > SIX_MONTHS_MS) {
          status = "attention";
          const months = Math.round(age / (30 * 24 * 60 * 60 * 1000));
          issue = `Document issued ${months} months ago.`;
          remedy = "Please provide a proof of address issued within the last six months.";
        }
      }
    }

    checklist.push({
      id: id("cl"),
      requirementKey: r.key,
      name: r.name,
      party: partyName,
      reason: r.note ?? "",
      status,
      receivedAt: now.toISOString(),
      sourceDocId: docId,
      issue,
      remedy,
    });
  }

  // Pull useful extracted fields onto the document.
  if (isPresent(classified.holder_name)) fields.holder_name = classified.holder_name;
  if (isPresent(classified.date_of_birth)) fields.date_of_birth = classified.date_of_birth;
  if (isPresent(classified.nationality)) fields.nationality = classified.nationality;
  if (isPresent(classified.document_number)) fields.document_number = classified.document_number;
  if (isPresent(classified.issue_date)) fields.issue_date = classified.issue_date;
  if (isPresent(classified.expiry_date)) fields.expiry_date = classified.expiry_date;
  if (isPresent(classified.address)) fields.address = classified.address;
  if (isPresent(classified.legal_name)) fields.legal_name = classified.legal_name;
  if (isPresent(classified.jurisdiction)) fields.jurisdiction = classified.jurisdiction;
  if (isPresent(classified.registration_number)) fields.registration_number = classified.registration_number;
  if (isPresent(classified.incorporation_date)) fields.incorporation_date = classified.incorporation_date;

  messages.push(
    `Identified ${humanLabel(classified.document_type)} — mapped to ${checklist.map((c) => c.name).join(", ")}.`,
  );

  return {
    classifiedAs: humanLabel(classified.document_type),
    checklistAdditions: checklist,
    matchedRequirementKeys: checklist.map((c) => c.requirementKey),
    extractedFields: fields,
    agentMessage: messages.join(" "),
    auditDetail: `Processed ${fileName}: ${humanLabel(classified.document_type)}`,
  };
}
