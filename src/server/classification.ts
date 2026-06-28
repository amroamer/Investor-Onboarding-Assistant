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
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const Holder = z.object({
  name: z.string(),
  role: z.string().describe('Role/title. Use "" if not present.'),
  ownership_pct: z.string().describe('Percentage as numeric string, e.g. "42.5". Use "" if not stated.'),
  party_type: z.enum(["Individual", "Entity", "Unknown"]),
});

/**
 * IMPORTANT: this schema avoids nullable fields because the Anthropic structured-output
 * compiler limits a schema to 16 nullable/union-typed parameters. We use "" as the
 * sentinel for "not present" on string fields, [] on arrays, and the explicit "Unknown"
 * enum value where applicable.
 */
export const ClassifiedDocSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  confidence: z.enum(["low", "medium", "high"]),
  summary: z.string().describe("One concise sentence describing the document"),
  party_name: z.string().describe('Primary individual or entity. Use "" if not extractable.'),
  language: z.string().describe('Document language, e.g. "English", "French". Use "" if not detectable.'),
  appears_certified: z.boolean().describe("True if the document appears certified, notarised, or officially stamped"),
  document_subtype: z.string().describe('Free-form subtype label, e.g. "utility bill". Use "" if not applicable.'),
  // Individual identity
  holder_name: z.string().describe('Use "" if not present.'),
  date_of_birth: z.string().describe('ISO 8601 (YYYY-MM-DD) or "" if not present.'),
  nationality: z.string().describe('Use "" if not present.'),
  document_number: z.string().describe('Passport/ID number. Use "" if not present.'),
  issue_date: z.string().describe('ISO 8601 (YYYY-MM-DD) or "" if not present.'),
  expiry_date: z.string().describe('ISO 8601 (YYYY-MM-DD) or "" if not present.'),
  address: z.string().describe('Use "" if not present.'),
  // Entity identity
  legal_name: z.string().describe('Entity legal name. Use "" if not present.'),
  jurisdiction: z.string().describe('Country or state of formation. Use "" if not present.'),
  registration_number: z.string().describe('Use "" if not present.'),
  incorporation_date: z.string().describe('ISO 8601 (YYYY-MM-DD) or "" if not present.'),
  general_partner: z.string().describe('For LPAs only. Use "" otherwise.'),
  ownership_holders: z.array(Holder).describe("For registers: all holders/directors. Empty array if not applicable."),
});

export type ClassifiedDoc = z.infer<typeof ClassifiedDocSchema>;
export type ClassifiedHolder = z.infer<typeof Holder>;

/** Treat both null and empty-string as "absent" — schema uses "" as the sentinel. */
export function isPresent(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const SYSTEM_PROMPT = `You are a KYC document classifier for investor onboarding.

Given the Markdown content of a document, classify it and extract structured fields.

Rules:
- Pick the single best document_type from the enum. If unsure, use "other".
- confidence reflects how certain you are: "high" only when the document type is unmistakable.
- party_name is the primary individual or entity the document is about.
- Every string field is REQUIRED. Use empty string "" when the information is not present in the document — do NOT omit fields, do NOT use null.
- For all dates, use ISO 8601 format (YYYY-MM-DD), or "" if not extractable.
- For ownership_holders, include all individuals/entities listed; use an empty array [] if none.
- language: a short label like "English", "French", "German". If multiple, pick the dominant one. Use "" if not detectable.
- appears_certified: true if there is a stamp, seal, notary signature block, or a "CERTIFIED" marking. Otherwise false.
- party_type for each holder: "Individual" for natural persons, "Entity" for companies/funds/partnerships, "Unknown" if unclear.`;

export async function classifyDocument(opts: {
  markdown: string;
  fileName: string;
}): Promise<ClassifiedDoc> {
  const response = await withAnthropicRetry(
    () =>
      client.messages.parse({
        model: MODEL,
        max_tokens: 4096,
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

  const parsed = response.parsed_output as ClassifiedDoc | null;
  if (!parsed) {
    throw new Error("Classification returned no parsed output.");
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
    case "other": return "Uncategorised document";
  }
}
