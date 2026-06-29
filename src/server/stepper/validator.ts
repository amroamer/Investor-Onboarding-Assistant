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
  CrossDocFlag,
  StepperLegalForm,
  StepperUploadedDocument,
} from "@/lib/stepper/types";
import {
  flatRequirements,
  requirementsForDocumentType,
} from "@/lib/stepper/requirements";

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

/**
 * Human-readable label for a classifier document type. Exported so the
 * compliance cockpit can show the same vocabulary stamped into `classifiedAs`
 * — useful when the classifier slug ("trust_deed", "evidence_of_regulated_status")
 * leaks into rendered text.
 */
export function humanLabel(type: ClassifiedDoc["document_type"]): string {
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
    case "evidence_of_regulated_status": return "Evidence of regulated status";
    case "audited_financial_statements": return "Audited financial statements";
    case "authorised_signatory_list": return "Authorised signatory list";
    case "trust_deed": return "Trust Deed";
    case "schedule_of_trust_parties": return "Schedule of trust parties";
    case "authority_to_act": return "Authority to act";
    case "other": return "Uncategorised document";
  }
}

export function validateStepperDocument(opts: {
  legalForm: StepperLegalForm;
  classified: ClassifiedDoc;
  docId: string;
  fileName: string;
  partyName: string;
  /**
   * When the upload came from a per-slot Replace action, the requirement key
   * the investor explicitly chose. If the classifier can't categorise the file
   * (e.g. returns "other"), we honour the user's choice and force the match.
   */
  targetRequirementKey?: string;
}): StepperValidationResult {
  const { legalForm, classified, docId, fileName, partyName, targetRequirementKey } = opts;
  const now = new Date();
  let reqs = requirementsForDocumentType(legalForm, classified.document_type);

  // Replace-flow fallback: the user explicitly chose this slot, so trust their
  // intent even when the classifier punts on the doc type.
  if (reqs.length === 0 && targetRequirementKey) {
    const all = flatRequirements(legalForm);
    const forced = all.find((r) => r.key === targetRequirementKey);
    if (forced) reqs = [forced];
  }

  const checklist: ChecklistItem[] = [];
  const fields: Record<string, string> = {};
  const messages: string[] = [];

  // Heuristics for "Source of Wealth confirmation" vs "Bank statement" routing.
  // The classifier maps the SoW narrative PDF to `source_of_funds_evidence`
  // and the bank statement to `bank_statement`. Several forms expose both a
  // SoW slot and a SoF slot that BOTH accept these document types, so without
  // disambiguation a single SoW narrative would erroneously satisfy SoF too.
  // Disambiguate by document text and pick the matching slot from `reqs` —
  // the slot keys vary per form (`source_of_funds` for Individual,
  // `entity_source_of_funds` for entity forms, etc.), so we derive them from
  // the candidate requirements rather than hardcoding Individual-form keys.
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
    const sofKeys = reqs.filter((r) => r.key.toLowerCase().includes("fund")).map((r) => r.key);
    const sowKeys = reqs.filter((r) => r.key.toLowerCase().includes("wealth")).map((r) => r.key);
    if (looksLikeBankStmt && !looksLikeSowNarrative && sofKeys.length > 0) {
      matchedKeys = sofKeys;
    } else if (looksLikeSowNarrative && !looksLikeBankStmt && sowKeys.length > 0) {
      matchedKeys = sowKeys;
    } else {
      // Ambiguous, or only one slot exists for this form — map every candidate.
      matchedKeys = reqs.map((r) => r.key);
    }
  } else {
    matchedKeys = reqs.map((r) => r.key);
  }

  // Filter matchedKeys against actual requirements for the active form.
  const validRequirements = new Set(reqs.map((r) => r.key));
  matchedKeys = matchedKeys.filter((k) => validRequirements.has(k));

  if (matchedKeys.length === 0) {
    // Two distinct failure modes the investor needs to be able to tell apart:
    //   1. The classifier wasn't confident enough to pick a type (`other`).
    //      The investor's next move is to drop the file onto a specific slot
    //      manually using Replace.
    //   2. The classifier identified the type cleanly but no slot on the
    //      active form accepts that type (e.g. an investor uploads a passport
    //      to a Regulated-entity flow). Same recovery — drop onto a slot.
    const isUnclassified = classified.document_type === "other";
    const conf = classified.confidence;
    const summarySnippet = isPresent(classified.summary)
      ? ` We read it as: "${classified.summary.trim()}".`
      : "";
    const agentMessage = isUnclassified
      ? `Couldn't confidently identify ${fileName} (confidence: ${conf}).${summarySnippet} If this is a required document, use the Replace button on the matching slot to assign it.`
      : `Read ${fileName} as ${humanLabel(classified.document_type)}, but ${legalForm} doesn't have a slot that accepts that type. Use the Replace button on the matching slot if you want to keep this upload.`;
    const auditDetail = isUnclassified
      ? `Couldn't categorise ${fileName} — confidence ${conf}. Drop onto a specific slot using Replace.`
      : `${fileName} read as ${humanLabel(classified.document_type)} (confidence ${conf}) — no ${legalForm} slot accepts that type.`;
    return {
      classifiedAs: humanLabel(classified.document_type),
      checklistAdditions: [],
      matchedRequirementKeys: [],
      extractedFields: {},
      agentMessage,
      auditDetail,
    };
  }

  for (const r of reqs) {
    if (!matchedKeys.includes(r.key)) continue;

    let status: ChecklistItem["status"] = "received";
    let issue: string | undefined;
    let remedy: string | undefined;

    let suggestedFix: ChecklistItem["suggestedFix"];

    if (classified.document_type === "passport") {
      const expiry = tryDate(classified.expiry_date);
      if (expiry && expiry < now) {
        status = "attention";
        issue = `Document expired on ${classified.expiry_date}.`;
        remedy = "Please upload a current, in-date passport or ID.";
        suggestedFix = {
          hint: "Upload a current passport (any in-date government photo ID works too).",
          replacesRequirement: r.key,
        };
      }
    }

    if (classified.document_type === "proof_of_address") {
      const issued = tryDate(classified.issue_date);
      if (!issued) {
        status = "attention";
        issue = "Could not detect an issue date on the proof of address.";
        remedy = "Please upload a POA with a clearly visible issue date.";
        suggestedFix = {
          hint: "A recent utility bill or bank statement with a clear date works best.",
          replacesRequirement: r.key,
        };
      } else {
        const age = now.getTime() - issued.getTime();
        if (age > SIX_MONTHS_MS) {
          status = "attention";
          const months = Math.round(age / (30 * 24 * 60 * 60 * 1000));
          issue = `Document issued ${months} months ago.`;
          remedy = "Please provide a proof of address issued within the last six months.";
          suggestedFix = {
            hint: "Try a utility bill or bank statement from the last 6 months.",
            replacesRequirement: r.key,
          };
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
      suggestedFix,
    });
  }

  // Pull useful extracted fields onto the document.
  // Holders / signatories — persisted as JSON so derive.ts can rebuild the
  // related-parties list on the Ownership step. The classifier extracts these
  // for any document that lists multiple identifiable persons (registers,
  // authorised signatory lists, multi-holder photo-ID records, schedules of
  // trust parties). Without this line the array was dropped and the Ownership
  // step was always blank for entity forms.
  if (Array.isArray(classified.ownership_holders) && classified.ownership_holders.length > 0) {
    fields.ownership_holders = JSON.stringify(classified.ownership_holders);
  }
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
  // Source of Wealth / Source of Funds narrative fields — power the autofill on
  // the SoW/SoF step. Only present on the relevant document types.
  if (isPresent(classified.sow_primary_source)) fields.sow_primary_source = classified.sow_primary_source;
  if (isPresent(classified.sow_secondary_source)) fields.sow_secondary_source = classified.sow_secondary_source;
  if (isPresent(classified.sow_net_worth_range)) fields.sow_net_worth_range = classified.sow_net_worth_range;
  if (isPresent(classified.sow_accumulation_period)) fields.sow_accumulation_period = classified.sow_accumulation_period;
  if (isPresent(classified.sow_narrative)) fields.sow_narrative = classified.sow_narrative;
  if (isPresent(classified.sof_bank_name)) fields.sof_bank_name = classified.sof_bank_name;
  if (isPresent(classified.sof_account_reference)) fields.sof_account_reference = classified.sof_account_reference;
  if (isPresent(classified.sof_currency)) fields.sof_currency = classified.sof_currency;
  if (isPresent(classified.sof_closing_balance)) fields.sof_closing_balance = classified.sof_closing_balance;
  if (isPresent(classified.sof_subscription_amount)) fields.sof_subscription_amount = classified.sof_subscription_amount;
  if (isPresent(classified.sof_narrative)) fields.sof_narrative = classified.sof_narrative;
  // Tax residency self-certification — powers Declarations prefill.
  if (isPresent(classified.tax_primary_residence)) fields.tax_primary_residence = classified.tax_primary_residence;
  if (isPresent(classified.tax_additional_residences)) fields.tax_additional_residences = classified.tax_additional_residences;
  if (classified.tax_is_us_person !== "unknown") fields.tax_is_us_person = classified.tax_is_us_person;
  if (isPresent(classified.tax_us_tin)) fields.tax_us_tin = classified.tax_us_tin;
  if (isPresent(classified.tax_local_tin)) fields.tax_local_tin = classified.tax_local_tin;
  // FATCA / CRS entity classification — powers Declarations FATCA block for entities.
  if (classified.fatca_classification && classified.fatca_classification !== "unknown") {
    fields.fatca_classification = classified.fatca_classification;
  }
  // PEP self-declaration — powers Declarations PEP toggles.
  if (classified.pep_self !== "unknown") fields.pep_self = classified.pep_self;
  if (classified.pep_family !== "unknown") fields.pep_family = classified.pep_family;
  if (classified.pep_associate !== "unknown") fields.pep_associate = classified.pep_associate;
  if (isPresent(classified.pep_detail)) fields.pep_detail = classified.pep_detail;

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

/** Short, investor-facing summary line for the thumbnail card. */
export function buildThumbnailExcerpt(opts: { classified: ClassifiedDoc; fileName: string }): string {
  const { classified } = opts;
  const parts: string[] = [];
  if (isPresent(classified.holder_name)) parts.push(classified.holder_name);
  else if (isPresent(classified.legal_name)) parts.push(classified.legal_name);
  if (isPresent(classified.expiry_date)) parts.push(`expires ${classified.expiry_date}`);
  else if (isPresent(classified.issue_date)) parts.push(`issued ${classified.issue_date}`);
  if (isPresent(classified.address)) parts.push(classified.address.split(",")[0]);
  if (parts.length === 0 && isPresent(classified.summary)) return classified.summary;
  return parts.join(" · ") || humanLabel(classified.document_type);
}

/**
 * Recompute cross-document consistency flags.
 *
 * Today's check: holder names should agree across documents that mention a person
 * (passport, POA, tax residency, PEP declaration). Disagreement is surfaced to the
 * investor as an attention banner so they can replace the bad doc before submit.
 */
export function recomputeCrossDocFlags(uploads: StepperUploadedDocument[]): CrossDocFlag[] {
  const NAME_BEARING = new Set(["passport", "proof_of_address", "fatca_declaration", "pep_declaration"]);
  const docs = uploads.filter((u) => u.status === "ready");
  const namedDocs = docs.filter((d) => {
    // We don't have document_type on the uploaded doc; rely on classifiedAs label.
    return d.extractedFields["holder_name"] && d.extractedFields["holder_name"].length > 0;
  });

  const byNormalized = new Map<string, { name: string; docIds: string[] }>();
  for (const d of namedDocs) {
    const raw = d.extractedFields["holder_name"]!;
    const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!byNormalized.has(norm)) byNormalized.set(norm, { name: raw.trim(), docIds: [d.id] });
    else byNormalized.get(norm)!.docIds.push(d.id);
  }
  const distinctGroups = Array.from(byNormalized.values());
  if (distinctGroups.length < 2) return [];

  return [
    {
      kind: "name_mismatch" as const,
      detail: `Different holder names appear across your documents: ${distinctGroups.map((g) => g.name).join(", ")}.`,
      docIds: distinctGroups.flatMap((g) => g.docIds),
      values: distinctGroups.map((g) => g.name),
    },
  ];
}
