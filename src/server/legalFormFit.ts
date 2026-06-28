import type { DocumentType } from "./classification";
import type { LegalForm } from "@/lib/onboarding/types";

/**
 * Single source of truth for which document types are expected on which
 * legal form. Drives:
 *   1. Validator's match decision (matched vs unmatched_wrong_form)
 *   2. The "Switch to X onboarding" suggestion in the unmatched tray
 *   3. Tooltip hints on documents-required listings
 *
 * Keep this table conservative: a doc type listed for a form means it is
 * *plausibly expected* on that form, not that the form requires it.
 *
 * `other` is intentionally listed for every form — its match outcome is
 * decided separately (it becomes `unmatched_unknown_type`, not `wrong_form`).
 */
export const FORM_FIT: Record<DocumentType, LegalForm[]> = {
  passport: [
    "Individual",
    "Limited Partnership",
    "Corporation",
    "Trust",
    "Regulated or Listed Entity",
  ],
  proof_of_address: [
    "Individual",
    "Limited Partnership",
    "Corporation",
    "Trust",
    "Regulated or Listed Entity",
  ],
  pep_declaration: ["Individual", "Limited Partnership", "Corporation", "Trust"],
  fatca_declaration: [
    "Individual",
    "Limited Partnership",
    "Corporation",
    "Trust",
    "Regulated or Listed Entity",
  ],
  source_of_funds_evidence: [
    "Individual",
    "Limited Partnership",
    "Corporation",
    "Trust",
    "Regulated or Listed Entity",
  ],
  bank_statement: [
    "Individual",
    "Limited Partnership",
    "Corporation",
    "Trust",
    "Regulated or Listed Entity",
  ],
  certificate_of_incorporation: ["Corporation"],
  // Certificate of Formation covers LP/LLC formation; also accepted on Corporation
  // since some jurisdictions issue a "Certificate of Formation" for corporations.
  certificate_of_formation: ["Limited Partnership", "Corporation"],
  // The classifier currently treats Trust Deeds as `limited_partnership_agreement`,
  // so this type fits both LP and Trust until a dedicated trust_deed type exists.
  limited_partnership_agreement: ["Limited Partnership", "Trust"],
  articles_of_association: ["Corporation", "Limited Partnership"],
  register_of_directors: ["Corporation", "Limited Partnership"],
  register_of_members: ["Corporation", "Limited Partnership", "Trust"],
  // "other" is handled as unmatched_unknown_type — never wrong-form.
  other: [
    "Individual",
    "Limited Partnership",
    "Corporation",
    "Trust",
    "Regulated or Listed Entity",
  ],
};

/** Does the document type fit the active legal form? */
export function fitsLegalForm(
  type: DocumentType,
  form: LegalForm | undefined,
): boolean {
  if (!form) return true; // no form chosen yet → can't judge
  return FORM_FIT[type].includes(form);
}

/** First legal form a document type fits — used as the "Switch to X" suggestion. */
export function suggestLegalForm(type: DocumentType): LegalForm | undefined {
  const forms = FORM_FIT[type];
  if (forms.length === 0) return undefined;
  // Prefer the narrowest fit (fewer forms = more specific).
  return forms[0];
}
