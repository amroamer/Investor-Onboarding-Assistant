import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withAnthropicRetry } from "./anthropic-errors";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";

export const DOCUMENT_TYPES = [
  "passport",
  "proof_of_address",
  "certificate_of_incorporation",
  "certificate_of_formation",
  "limited_partnership_agreement",
  "register_of_members",
  "register_of_directors",
  "articles_of_association",
  "pep_declaration",
  "fatca_declaration",
  "source_of_funds_evidence",
  "bank_statement",
  // New types introduced for the 5-form taxonomy.
  "evidence_of_regulated_status",
  "audited_financial_statements",
  "authorised_signatory_list",
  "trust_deed",
  "schedule_of_trust_parties",
  "authority_to_act",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Soft enums — when the model returns an unknown / empty value we want a safe
// default, not a parse failure. `.catch(default)` makes zod swap the bad input
// for the fallback instead of throwing. This is the trick that keeps the whole
// classification call resilient across the long-tail of doc types Claude sees.
const yesNoUnknown = z
  .enum(["yes", "no", "unknown"])
  .catch("unknown");

const fatcaClass = z
  .enum(["financial_institution", "active_nffe", "passive_nffe", "direct_reporting_nffe", "unknown"])
  .catch("unknown");

const Holder = z.object({
  name: z.string().catch(""),
  role: z.string().catch("").describe('Role/title. Use "" if not present.'),
  ownership_pct: z.string().catch("").describe('Percentage as numeric string, e.g. "42.5". Use "" if not stated.'),
  party_type: z.enum(["Individual", "Entity", "Unknown"]).catch("Unknown"),
});

/**
 * IMPORTANT: this schema avoids nullable fields because the Anthropic structured-output
 * compiler limits a schema to 16 nullable/union-typed parameters. We use "" as the
 * sentinel for "not present" on string fields, [] on arrays, and the explicit "Unknown"
 * enum value where applicable.
 *
 * Every enum + boolean has a `.catch(default)` clause so that if Claude returns
 * a value outside the union (e.g. "" on a non-PEP doc) the parse still succeeds —
 * zod swaps the bad input for the safe default and we move on. This is the
 * single biggest reason older versions of this schema would fail.
 */
export const ClassifiedDocSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES).catch("other"),
  confidence: z.enum(["low", "medium", "high"]).catch("low"),
  summary: z.string().catch("").describe("One concise sentence describing the document"),
  party_name: z.string().catch("").describe('Primary individual or entity. Use "" if not extractable.'),
  language: z.string().catch("").describe('Document language, e.g. "English", "French". Use "" if not detectable.'),
  appears_certified: z.boolean().catch(false).describe("True if the document appears certified, notarised, or officially stamped"),
  document_subtype: z.string().catch("").describe('Free-form subtype label, e.g. "utility bill". Use "" if not applicable.'),
  // Individual identity
  holder_name: z.string().catch("").describe('Use "" if not present.'),
  date_of_birth: z.string().catch("").describe('ISO 8601 (YYYY-MM-DD) or "" if not present.'),
  nationality: z.string().catch("").describe('Use "" if not present.'),
  document_number: z.string().catch("").describe('Passport/ID number. Use "" if not present.'),
  issue_date: z.string().catch("").describe('ISO 8601 (YYYY-MM-DD) or "" if not present.'),
  expiry_date: z.string().catch("").describe('ISO 8601 (YYYY-MM-DD) or "" if not present.'),
  address: z.string().catch("").describe('Use "" if not present.'),
  // Entity identity
  legal_name: z.string().catch("").describe('Entity legal name. Use "" if not present.'),
  jurisdiction: z.string().catch("").describe('Country or state of formation. Use "" if not present.'),
  registration_number: z.string().catch("").describe('Use "" if not present.'),
  incorporation_date: z.string().catch("").describe('ISO 8601 (YYYY-MM-DD) or "" if not present.'),
  general_partner: z.string().catch("").describe('For LPAs only. Use "" otherwise.'),
  ownership_holders: z.array(Holder).catch([]).describe("All identifiable persons listed in the document. Populate for registers (members/directors/partners/trustees), authorised signatory lists, schedules of trust parties, and multi-person photo-ID records (e.g. a single PDF listing two signatories with their DOBs/nationalities). Empty array if the document only describes one person already captured in holder_name."),
  // Source of Wealth narrative — populated on SoW confirmation documents.
  sow_primary_source: z.string().catch("").describe('Primary source of wealth, e.g. "Employment income and accumulated savings". "" if not a SoW document.'),
  sow_secondary_source: z.string().catch("").describe('Secondary source of wealth, e.g. "Proceeds from sale of shares in X". "" if not present.'),
  sow_net_worth_range: z.string().catch("").describe('Estimated total net worth range, e.g. "USD 1.5 million - USD 2.0 million". "" if not present.'),
  sow_accumulation_period: z.string().catch("").describe('Period over which wealth was accumulated, e.g. "2012 - 2026". "" if not present.'),
  sow_narrative: z.string().catch("").describe('Full narrative paragraph describing how wealth was accumulated. "" if not a SoW document.'),
  // Source of Funds — populated on bank statements / subscription funding evidence.
  sof_bank_name: z.string().catch("").describe('Bank name from the bank statement. "" if not present.'),
  sof_account_reference: z.string().catch("").describe('Account reference / number (may be masked). "" if not present.'),
  sof_currency: z.string().catch("").describe('Account currency, e.g. "USD". "" if not present.'),
  sof_closing_balance: z.string().catch("").describe('Closing balance with currency, e.g. "USD 382,745.18". "" if not present.'),
  sof_subscription_amount: z.string().catch("").describe('Proposed subscription amount with currency, e.g. "USD 250,000". "" if not present.'),
  sof_narrative: z.string().catch("").describe('Short description of the funds origin/purpose. "" if not a SoF document.'),
  // Tax residency self-certification (CRS / FATCA) — populated on tax-residency docs.
  tax_primary_residence: z.string().catch("").describe('Primary tax residence country. "" if not a tax-residency document.'),
  tax_additional_residences: z.string().catch("").describe('Additional tax residences as a free-text list (e.g. "France, Italy"). "" or "None" if none declared.'),
  tax_is_us_person: yesNoUnknown.describe('Whether the declarant is a US citizen or US tax resident.'),
  tax_us_tin: z.string().catch("").describe('US Taxpayer Identification Number. "" if not present or marked "Not applicable".'),
  tax_local_tin: z.string().catch("").describe('Local (non-US) Taxpayer Identification Number, e.g. UAE TIN. "" if not present or marked not issued.'),
  // FATCA / CRS entity classification — populated on entity tax self-certifications.
  fatca_classification: fatcaClass.describe('FATCA / CRS classification of the entity. "unknown" if not classified or not an entity tax doc.'),
  // PEP declaration — populated on PEP self-declarations.
  pep_self: yesNoUnknown.describe('Does the declarant currently or formerly hold a prominent public function?'),
  pep_family: yesNoUnknown.describe('Is an immediate family member of the declarant a PEP?'),
  pep_associate: yesNoUnknown.describe('Is a known close associate of the declarant a PEP?'),
  pep_detail: z.string().catch("").describe('Additional explanation about PEP exposure. "" if not present or "None".'),
});

export type ClassifiedDoc = z.infer<typeof ClassifiedDocSchema>;
export type ClassifiedHolder = z.infer<typeof Holder>;

/** Treat both null and empty-string as "absent" — schema uses "" as the sentinel. */
export function isPresent(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const SYSTEM_PROMPT = `You are a KYC document classifier for investor onboarding.

Given the Markdown content of a document, classify it and extract structured fields.

Document type guide (pick the single best match; use "other" only as a last resort):
- "passport": government-issued photo ID (passport, national ID card, driving licence).
- "proof_of_address": utility bill, bank statement, tax-authority letter showing a residential address.
- "certificate_of_incorporation" / "certificate_of_formation": registry extract proving an entity's existence.
- "limited_partnership_agreement": executed LPA for a Limited Partnership.
- "register_of_members": register of shareholders/members of a company, or schedule of trust beneficiaries/settlors.
- "register_of_directors": register of directors / managers (of a corporation, GP, or trustees of a trust).
- "articles_of_association": Memorandum & Articles, by-laws, operating agreement, or other constitutional document.
- "pep_declaration": signed politically-exposed-person self-declaration.
- "fatca_declaration": CRS / FATCA tax-residency self-certification (individual or entity).
- "source_of_funds_evidence": Source-of-Wealth or Source-of-Funds narrative letter.
- "bank_statement": account statement showing balance and transactions.
- "evidence_of_regulated_status": regulator licence, listing reference, or letter confirming an entity is regulated / listed.
- "audited_financial_statements": signed-off audited financial statements (annual report / accounts).
- "authorised_signatory_list": list of authorised signatories, optionally with specimen signatures, OR a board resolution authorising a subscription.
- "trust_deed": trust deed including any deeds of variation, appointment or amendment.
- "schedule_of_trust_parties": schedule of trustees, settlor(s), protector(s) and named beneficiaries of a trust.
- "authority_to_act": resolution / power of attorney / authority document giving a person power to act for the partnership, trust or entity.

Rules:
- confidence reflects how certain you are: "high" only when the document type is unmistakable.
- party_name is the primary individual or entity the document is about.
- Every string field is REQUIRED. Use empty string "" when the information is not present in the document — do NOT omit fields, do NOT use null.
- For all dates, use ISO 8601 format (YYYY-MM-DD), or "" if not extractable.
- issue_date for a "proof_of_address" doc = the statement date / bill date / billing-period end date (whichever is the most recent date that establishes when the document was produced). For other doc types issue_date is the literal issuance date if present.
- For ownership_holders, include all individuals/entities listed; use an empty array [] if none.
- language: a short label like "English", "French", "German". If multiple, pick the dominant one. Use "" if not detectable.
- appears_certified: true if there is a stamp, seal, notary signature block, or a "CERTIFIED" marking. Otherwise false.
- party_type for each holder: "Individual" for natural persons, "Entity" for companies/funds/partnerships, "Unknown" if unclear.
- SoW fields (sow_*): only populate when the document explicitly describes a source of wealth (e.g. a "Source of Wealth Confirmation" / wealth declaration). Leave "" for every other document type.
- SoF fields (sof_*): only populate when the document is a bank statement or subscription-funding evidence showing the account that will fund the subscription. Leave "" for every other document type.
- sow_narrative / sof_narrative: copy the relevant paragraph verbatim (keep it concise — one paragraph max). Do not paraphrase.
- Tax fields (tax_*): only populate when the document is a CRS / FATCA tax-residency self-certification. tax_is_us_person should be "no" when (a) the document explicitly states the entity/person is not a US specified person, OR (b) the document classifies the entity as a "Foreign Financial Institution", "Participating FFI", "Active NFFE" or "Passive NFFE" — those categorisations are by definition non-US — OR (c) the only declared tax residence is a non-US jurisdiction and no US TIN appears. Use "unknown" only when the document is genuinely silent on US status AND no inference can be made from FATCA classification or jurisdiction. Leave all fields default for non-tax documents.
- fatca_classification: only set for entity tax self-certifications or constitutional documents that explicitly classify the entity. Use "unknown" for all individual documents and any entity doc where the class isn't stated.
- PEP fields (pep_*): only populate from an explicit PEP self-declaration. pep_self / pep_family / pep_associate use "unknown" only when the document is silent — most PEP declarations explicitly state Yes or No for each.

CRITICAL — enum field constraints (parse failures will reject the whole response):
- pep_self, pep_family, pep_associate, tax_is_us_person: MUST be exactly one of "yes", "no", or "unknown". NEVER use empty string, NEVER omit the field, NEVER use Yes/No/N/A. For any document that isn't a PEP / tax declaration, return "unknown".
- fatca_classification: MUST be exactly one of "financial_institution", "active_nffe", "passive_nffe", "direct_reporting_nffe", or "unknown". For any non-entity-tax document return "unknown".
- confidence: MUST be exactly one of "low", "medium", or "high".
- document_type: MUST be exactly one of the values listed in the type guide above. If nothing fits, return "other".
- party_type (in ownership_holders): MUST be exactly "Individual", "Entity", or "Unknown".`;

/**
 * Returns a safe default ClassifiedDoc that the validator can consume. Used as
 * a fallback when Claude's structured output fails to parse — the upload still
 * lands in the case as "Uncategorised document — no requirement matched" so the
 * investor can replace it without us throwing away the file entirely.
 */
function emptyClassification(reason: string): ClassifiedDoc {
  return {
    document_type: "other",
    confidence: "low",
    summary: `Classification failed (${reason}).`,
    party_name: "",
    language: "",
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
  };
}

export async function classifyDocument(opts: {
  markdown: string;
  fileName: string;
}): Promise<ClassifiedDoc> {
  // Structured-output parse failures are recoverable for our purposes — we'd
  // rather record the upload as "Uncategorised" than throw and abort the whole
  // step. The wrapper handles transport-level retries; this try/catch handles
  // the case where Claude returns content that doesn't conform to the schema
  // (long docs, edge content, occasional bad JSON, etc.).
  let response: Awaited<ReturnType<typeof client.messages.parse>> | undefined;
  try {
    response = await withAnthropicRetry(
      () =>
        client.messages.parse({
          model: MODEL,
          // 8192 gives the model enough headroom for the larger schema we
          // expanded for the 5-form taxonomy. Most responses use < 1k tokens
          // but the cap protects against truncated JSON that fails to parse.
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `File: ${opts.fileName}\n\n---\nDocument content (Markdown):\n\n${opts.markdown}`,
            },
          ],
          output_config: {
            format: zodOutputFormat(ClassifiedDocSchema),
          },
        }),
      { label: `Classification of "${opts.fileName}"` },
    );
  } catch (err) {
    // Log to server stderr so we can diagnose recurring failures, then return
    // a safe fallback so the upload pipeline can continue.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[classification] ${opts.fileName} failed: ${msg}`,
      err instanceof Error && err.stack ? `\n${err.stack}` : "",
    );
    return emptyClassification(msg);
  }

  const parsed = response.parsed_output as ClassifiedDoc | null;
  if (!parsed) {
    console.error(
      `[classification] ${opts.fileName} returned no parsed output. Raw text:`,
      // Surface the raw text the model returned so we can see what went wrong.
      JSON.stringify(response).slice(0, 2000),
    );
    return emptyClassification("model returned no parsed output");
  }
  return parsed;
}

export function humanLabelFor(t: DocumentType): string {
  switch (t) {
    case "passport": return "Passport";
    case "proof_of_address": return "Proof of address";
    case "certificate_of_incorporation": return "Certificate of Incorporation";
    case "certificate_of_formation": return "Certificate of Formation";
    case "limited_partnership_agreement": return "Limited Partnership Agreement";
    case "register_of_members": return "Register of Members";
    case "register_of_directors": return "Register of Directors";
    case "articles_of_association": return "Articles of Association";
    case "pep_declaration": return "PEP declaration";
    case "fatca_declaration": return "FATCA / CRS declaration";
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
