/**
 * Pure derivation of case-level facts from uploaded documents.
 *
 * The Documents step pushes each upload through extraction + classification
 * and stores `extractedFields: Record<string, string>` on the upload. The
 * later steps (Ownership, SoW/SoF, Declarations, Review) all need a single
 * coherent view of "what do we know about this investor from their docs"
 * — that lives here.
 *
 * Outputs are PrefillValue-wrapped so the UI can show provenance:
 *   { value: "British", sourceDocId: "...", sourceFileName: "01_Photo_ID.pdf" }
 *
 * Nothing here writes to the case — it's a pure function from a StepperCase
 * to a DerivedFacts snapshot. Each step decides how to apply the facts.
 */

import type { StepperCase, StepperUploadedDocument, RelatedParty } from "./types";
import { fatcaSectionFromClassification, type FatcaSection } from "./types";

export interface PrefillValue<T> {
  value: T;
  sourceDocId: string;
  sourceFileName: string;
}

export interface DerivedSelfParty {
  name?: PrefillValue<string>;
  nationality?: PrefillValue<string>;
  dob?: PrefillValue<string>;
  address?: PrefillValue<string>;
}

export interface DerivedFacts {
  identity: DerivedSelfParty;
  /** Director / shareholder rows derived from entity register documents. */
  entityHolders?: PrefillValue<RelatedParty[]>;
  sow: {
    category?: PrefillValue<string>;
    detail?: PrefillValue<string>;
    netWorthRange?: PrefillValue<string>;
    evidenceDocIds: string[];
  };
  sof: {
    category?: PrefillValue<string>;
    detail?: PrefillValue<string>;
    evidenceDocIds: string[];
  };
  declarations: {
    taxResidencyCountry?: PrefillValue<string>;
    taxResidencyAdditional?: PrefillValue<string>;
    isUsPerson?: PrefillValue<boolean>;
    usTin?: PrefillValue<string>;
    pepSelf?: PrefillValue<boolean>;
    pepFamily?: PrefillValue<boolean>;
    pepAssociate?: PrefillValue<boolean>;
    pepDetail?: PrefillValue<string>;
    fatcaSection?: PrefillValue<FatcaSection>;
    fatcaTin?: PrefillValue<string>;
  };
}

const readyOnly = (docs: StepperUploadedDocument[]) =>
  docs.filter((d) => d.status === "ready" && d.processingPhase === "ready");

/**
 * Pick the most recently received ready doc that satisfies one of the given
 * requirement keys.
 */
function pickByRequirement(
  docs: StepperUploadedDocument[],
  requirementKeys: string[],
): StepperUploadedDocument | undefined {
  const set = new Set(requirementKeys);
  const candidates = docs.filter((d) =>
    d.matchedRequirementKeys.some((k) => set.has(k)),
  );
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  return candidates[0];
}

function pv<T>(value: T, doc: StepperUploadedDocument): PrefillValue<T> {
  return { value, sourceDocId: doc.id, sourceFileName: doc.fileName };
}

function field(doc: StepperUploadedDocument | undefined, key: string): string | undefined {
  if (!doc) return undefined;
  const v = doc.extractedFields[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function yesNoBool(s: string | undefined): boolean | undefined {
  if (s === "yes") return true;
  if (s === "no") return false;
  return undefined;
}

/**
 * Normalise a free-text "Additional tax residences" value. The fixture form
 * says "None declared" — that should mean "no additional residences", not a
 * literal string in the input.
 */
function normaliseAdditionalResidences(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const lc = s.toLowerCase().trim();
  // Preserve a human-readable "None declared" rather than collapsing to "" —
  // the empty string was indistinguishable from "no extraction attempted" and
  // left the Declarations field looking blank with a misleading "From ‹tax
  // doc›" chip. Investors can clear it if they need to add a residence.
  if (lc === "none" || lc === "none declared" || lc === "n/a" || lc === "not applicable") {
    return "None declared";
  }
  return s;
}

const SOW_CATEGORY_PATTERNS: Array<{ match: RegExp; category: string }> = [
  { match: /employment|salary|consult/i, category: "Employment income" },
  { match: /sale of (business|company|shares|minority)|business sale|exit/i, category: "Sale of business" },
  { match: /invest(ment)? (income|portfolio|gains)|dividend/i, category: "Investment income" },
  { match: /inherit/i, category: "Inheritance" },
  { match: /family (wealth|trust|office)/i, category: "Family wealth" },
];

function mapSowCategory(primary: string | undefined): string | undefined {
  if (!primary) return undefined;
  for (const { match, category } of SOW_CATEGORY_PATTERNS) {
    if (match.test(primary)) return category;
  }
  return "Other";
}

function buildSowNarrative(doc: StepperUploadedDocument): string | undefined {
  const narrative = field(doc, "sow_narrative");
  const primary = field(doc, "sow_primary_source");
  const secondary = field(doc, "sow_secondary_source");
  const netWorth = field(doc, "sow_net_worth_range");
  const period = field(doc, "sow_accumulation_period");

  if (narrative) {
    const tail: string[] = [];
    if (netWorth) tail.push(`Estimated net worth: ${netWorth}.`);
    if (period && !narrative.includes(period)) tail.push(`Wealth accumulation period: ${period}.`);
    return [narrative, ...tail].join(" ").trim();
  }
  if (!primary && !secondary && !netWorth) return undefined;
  const parts: string[] = [];
  if (primary) parts.push(`Primary source: ${primary}.`);
  if (secondary) parts.push(`Secondary source: ${secondary}.`);
  if (period) parts.push(`Accumulation period: ${period}.`);
  if (netWorth) parts.push(`Estimated net worth: ${netWorth}.`);
  return parts.join(" ").trim();
}

function defaultSofCategoryFor(form: string | undefined): string {
  switch (form) {
    case "Individual":
      return "Personal bank account";
    case "Trust":
      return "Trust bank account";
    case "Regulated or Listed Entity":
    case "Corporation or Private Trust Corporation":
    case "Limited Partnership":
      return "Corporate bank account";
    default:
      return "Personal bank account";
  }
}

function buildSofNarrative(doc: StepperUploadedDocument): string | undefined {
  const narrative = field(doc, "sof_narrative");
  const bank = field(doc, "sof_bank_name");
  const account = field(doc, "sof_account_reference");
  const balance = field(doc, "sof_closing_balance");
  const subscription = field(doc, "sof_subscription_amount");
  // Account holder + statement date matter for compliance — they confirm the
  // account name agrees with the investing party and the statement is recent.
  const accountHolder = field(doc, "holder_name") ?? field(doc, "legal_name");
  const issueDate = field(doc, "issue_date");

  const composed: string[] = [];
  if (subscription) {
    composed.push(`Subscription of ${subscription} will be remitted`);
  } else {
    composed.push(`Subscription funds will be remitted`);
  }
  if (bank || account) {
    const parts: string[] = [];
    if (bank) parts.push(bank);
    if (account) parts.push(`account ${account}`);
    composed[0] += ` from ${parts.join(" ")}`;
  }
  if (accountHolder) {
    composed[0] += ` held in the name of ${accountHolder}`;
  }
  composed[0] += ".";
  if (balance) {
    const datedBalance = issueDate
      ? `Closing available balance ${balance} as of ${issueDate}.`
      : `Closing available balance ${balance}.`;
    composed.push(datedBalance);
  }
  if (narrative && !narrative.toLowerCase().includes("subscription")) {
    composed.push(narrative);
  } else if (narrative && !subscription && !bank) {
    return narrative;
  }
  // If we have neither structured fields nor a narrative, abort.
  if (!bank && !account && !balance && !subscription && !narrative) return undefined;
  return composed.join(" ").trim();
}

function holdersFromDoc(doc: StepperUploadedDocument | undefined): RelatedParty[] | undefined {
  // We persist holders inside extractedFields as a JSON string under
  // `ownership_holders` only when the validator chooses to (TODO if we ever
  // surface them). For now the validator does not store the array; this is a
  // placeholder for the entity flow.
  if (!doc) return undefined;
  const raw = doc.extractedFields["ownership_holders"];
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Array<{
      name: string;
      role: string;
      ownership_pct: string;
      party_type: "Individual" | "Entity" | "Unknown";
    }>;
    return parsed
      .filter((h) => h.name && h.name.trim().length > 0)
      .map((h) => ({
        id: `rp_${Math.random().toString(36).slice(2, 10)}`,
        name: h.name.trim(),
        role: h.role || "Director",
        partyType: h.party_type === "Entity" ? "Entity" : "Individual",
        ownershipPct: h.ownership_pct ? Number(h.ownership_pct) || undefined : undefined,
      }));
  } catch {
    return undefined;
  }
}

export function deriveFactsFromUploads(c: StepperCase): DerivedFacts {
  const docs = readyOnly(c.uploadedDocuments);

  const photoIdDoc = pickByRequirement(docs, ["photo_id"]);
  const poaDoc = pickByRequirement(docs, ["proof_of_address"]);
  const taxDoc = pickByRequirement(docs, ["tax_residency", "entity_tax_residency"]);
  const pepDoc = pickByRequirement(docs, ["pep_declaration"]);
  const sowDoc = pickByRequirement(docs, ["source_of_wealth", "entity_source_of_wealth"]);
  const sofDoc = pickByRequirement(docs, ["source_of_funds", "entity_source_of_funds"]);
  // Source of "related parties" varies per form. Registers (corp / LP /
  // trust) carry holders explicitly. Regulated/Listed entities don't have a
  // register requirement — the signatory list IS the source. Photo-ID docs
  // that list multiple signatories also surface holders. We pick the most
  // recently uploaded doc among any of these slots so the Ownership step
  // can pre-fill names for the user to confirm.
  const registerDoc = pickByRequirement(docs, [
    "register_of_members",
    "register_of_directors",
    "register_of_partners",
    "register_of_trustees",
    "register_of_council",
    "authorised_signatory_list",
    "schedule_of_trust_parties",
    "photo_id",
  ]);

  const identity: DerivedSelfParty = {};
  const fullName = field(photoIdDoc, "holder_name");
  if (photoIdDoc && fullName) identity.name = pv(fullName, photoIdDoc);
  const nationality = field(photoIdDoc, "nationality");
  if (photoIdDoc && nationality) identity.nationality = pv(nationality, photoIdDoc);
  const dob = field(photoIdDoc, "date_of_birth");
  if (photoIdDoc && dob) identity.dob = pv(dob, photoIdDoc);
  const address = field(poaDoc, "address") ?? field(taxDoc, "address");
  const addressSourceDoc = field(poaDoc, "address") ? poaDoc : taxDoc;
  if (addressSourceDoc && address) identity.address = pv(address, addressSourceDoc);

  const holders = holdersFromDoc(registerDoc);

  const sowCategoryRaw = field(sowDoc, "sow_primary_source");
  const sowCategory = mapSowCategory(sowCategoryRaw);
  const sowDetail = sowDoc ? buildSowNarrative(sowDoc) : undefined;
  const sowNetWorth = field(sowDoc, "sow_net_worth_range");

  // Default SoF category by form — a Regulated Entity's subscription account
  // is corporate, a Trust's is a trust account. Mislabelling as "Personal"
  // (the prior hardcode) misrepresents the case to compliance and to the
  // investor reviewing the draft.
  const sofCategory = sofDoc ? defaultSofCategoryFor(c.profile?.legalForm) : undefined;
  const sofDetail = sofDoc ? buildSofNarrative(sofDoc) : undefined;

  const taxPrimary = field(taxDoc, "tax_primary_residence");
  const taxAdditional = normaliseAdditionalResidences(field(taxDoc, "tax_additional_residences"));
  let isUsPerson = yesNoBool(field(taxDoc, "tax_is_us_person"));
  const usTin = field(taxDoc, "tax_us_tin");

  // Entity self-certifications rarely include an explicit "US specified
  // person: Yes/No" line — instead they declare a non-US jurisdiction and a
  // Foreign-Financial-Institution FATCA class. When the doc is silent but
  // the jurisdiction + FATCA classification both say "non-US", default the
  // answer to "No" so the investor isn't asked an already-answered question.
  if (isUsPerson === undefined && taxDoc) {
    const lc = (taxPrimary ?? "").toLowerCase();
    const fatcaRawRaw = (field(taxDoc, "fatca_classification") ?? "").toLowerCase();
    const isUsResidence = /\b(united states|u\.?s\.?a|u\.?s\.?)\b/.test(lc);
    const isForeignFatca =
      fatcaRawRaw === "financial_institution" ||
      fatcaRawRaw === "active_nffe" ||
      fatcaRawRaw === "passive_nffe";
    if (!isUsResidence && (isForeignFatca || taxPrimary)) {
      isUsPerson = false;
    }
  }

  let pepSelf = yesNoBool(field(pepDoc, "pep_self"));
  let pepFamily = yesNoBool(field(pepDoc, "pep_family"));
  let pepAssociate = yesNoBool(field(pepDoc, "pep_associate"));
  let pepDetail = field(pepDoc, "pep_detail");

  // For entity forms (Regulated, Corporation, Trust, LP) there's no PEP
  // declaration requirement — the entity itself cannot be a PEP. Controlling
  // persons (signatories, UBOs) are screened separately during compliance
  // review. Pre-default to "No" with the tax doc as the inference source so
  // the user isn't blocked on a question that has a single correct answer.
  const isEntity = !!c.profile?.legalForm && c.profile.legalForm !== "Individual";
  const pepSourceDoc = pepDoc ?? (isEntity ? taxDoc : undefined);
  if (isEntity && !pepDoc) {
    pepSelf = pepSelf ?? false;
    pepFamily = pepFamily ?? false;
    pepAssociate = pepAssociate ?? false;
    pepDetail = pepDetail ?? "None — entity-level declaration (controlling persons screened separately).";
  }

  const fatcaRaw = field(taxDoc, "fatca_classification");
  const fatcaSection = fatcaSectionFromClassification(fatcaRaw);
  const fatcaTin = field(taxDoc, "tax_local_tin") ?? field(taxDoc, "registration_number");

  return {
    identity,
    entityHolders: holders && registerDoc ? pv(holders, registerDoc) : undefined,
    sow: {
      category: sowCategory && sowDoc ? pv(sowCategory, sowDoc) : undefined,
      detail: sowDetail && sowDoc ? pv(sowDetail, sowDoc) : undefined,
      netWorthRange: sowNetWorth && sowDoc ? pv(sowNetWorth, sowDoc) : undefined,
      evidenceDocIds: sowDoc ? [sowDoc.id] : [],
    },
    sof: {
      category: sofCategory && sofDoc ? pv(sofCategory, sofDoc) : undefined,
      detail: sofDetail && sofDoc ? pv(sofDetail, sofDoc) : undefined,
      evidenceDocIds: sofDoc ? [sofDoc.id] : [],
    },
    declarations: {
      taxResidencyCountry: taxPrimary && taxDoc ? pv(taxPrimary, taxDoc) : undefined,
      taxResidencyAdditional: taxAdditional !== undefined && taxDoc ? pv(taxAdditional, taxDoc) : undefined,
      isUsPerson: isUsPerson !== undefined && taxDoc ? pv(isUsPerson, taxDoc) : undefined,
      usTin: usTin && taxDoc ? pv(usTin, taxDoc) : undefined,
      pepSelf: pepSelf !== undefined && pepSourceDoc ? pv(pepSelf, pepSourceDoc) : undefined,
      pepFamily: pepFamily !== undefined && pepSourceDoc ? pv(pepFamily, pepSourceDoc) : undefined,
      pepAssociate: pepAssociate !== undefined && pepSourceDoc ? pv(pepAssociate, pepSourceDoc) : undefined,
      pepDetail: pepDetail && pepSourceDoc ? pv(pepDetail, pepSourceDoc) : undefined,
      fatcaSection: fatcaSection && taxDoc ? pv(fatcaSection, taxDoc) : undefined,
      fatcaTin: fatcaTin && taxDoc ? pv(fatcaTin, taxDoc) : undefined,
    },
  };
}

/** Convenience: short list of unique source-doc summaries for the agent banner. */
export function summariseSources(facts: DerivedFacts): Array<{ docId: string; fileName: string }> {
  const seen = new Map<string, string>();
  const push = (pv?: PrefillValue<unknown>) => {
    if (pv) seen.set(pv.sourceDocId, pv.sourceFileName);
  };
  push(facts.identity.name);
  push(facts.identity.nationality);
  push(facts.identity.dob);
  push(facts.identity.address);
  push(facts.entityHolders);
  push(facts.sow.category);
  push(facts.sow.detail);
  push(facts.sof.category);
  push(facts.sof.detail);
  push(facts.declarations.taxResidencyCountry);
  push(facts.declarations.isUsPerson);
  push(facts.declarations.pepSelf);
  push(facts.declarations.fatcaSection);
  return Array.from(seen, ([docId, fileName]) => ({ docId, fileName }));
}
