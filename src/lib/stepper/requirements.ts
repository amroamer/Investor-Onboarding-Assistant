import type { StepperLegalForm } from "./types";

export interface RequirementItem {
  /** Stable key — used to map uploaded documents to requirements. */
  key: string;
  name: string;
  note?: string;
  mustInclude?: string[];
  examples?: string[];
  acceptedFormats?: string[];
  rejectedIf?: string[];
  /** Document types (classifier output) that satisfy this requirement. */
  acceptedDocumentTypes: ReadonlyArray<string>;
}

export interface RequirementGroup {
  party: string;
  items: RequirementItem[];
}

// ─── Shared identity / per-person items ──────────────────────────────────

const PHOTO_ID: RequirementItem = {
  key: "photo_id",
  name: "Government-issued photo ID",
  note: "Passport, national ID card or driving licence",
  mustInclude: [
    "Full legal name",
    "Date of birth",
    "Clear photograph of the holder",
    "Document number and issuing authority",
    "Expiry date (must not be expired)",
  ],
  examples: ["Passport (photo page)", "National ID card (both sides)", "Driving licence (both sides)"],
  acceptedFormats: ["PDF", "PNG", "JPEG"],
  rejectedIf: ["Expired", "Photo or text is blurred or cropped"],
  acceptedDocumentTypes: ["passport"],
};

const PROOF_OF_ADDRESS: RequirementItem = {
  key: "proof_of_address",
  name: "Proof of residential address",
  note: "Issued within the last 6 months",
  mustInclude: [
    "Full name matching the photo ID",
    "Full residential address",
    "Issue date within the last 6 months",
    "Name and logo of the issuing organisation",
  ],
  examples: ["Utility bill", "Bank or credit card statement", "Tax authority correspondence"],
  acceptedFormats: ["PDF", "PNG", "JPEG"],
  rejectedIf: ["Older than 6 months", "Address differs from the ID without explanation"],
  acceptedDocumentTypes: ["proof_of_address"],
};

const PEP_DECLARATION: RequirementItem = {
  key: "pep_declaration",
  name: "PEP declaration",
  note: "Including immediate family and close associates",
  mustInclude: [
    "Statement of PEP status (self, family or close associates)",
    "Names and relationships of any disclosed PEPs",
    "Signature and date",
  ],
  examples: ["Signed PEP self-declaration form"],
  acceptedFormats: ["PDF"],
  rejectedIf: ["Unsigned", "PEP section left blank"],
  acceptedDocumentTypes: ["pep_declaration"],
};

// ─── Individual-only items ───────────────────────────────────────────────

const TAX_RESIDENCY_INDIVIDUAL: RequirementItem = {
  key: "tax_residency",
  name: "Tax residency self-certification",
  note: "CRS / FATCA for you",
  mustInclude: [
    "Country (or countries) of tax residency",
    "Taxpayer Identification Number(s) where applicable",
    "Signature and date of declarant",
  ],
  examples: ["Signed CRS self-certification form", "IRS Form W-9 or W-8BEN"],
  acceptedFormats: ["PDF"],
  rejectedIf: ["Unsigned", "Missing TIN where required by the jurisdiction"],
  acceptedDocumentTypes: ["fatca_declaration"],
};

const SOURCE_OF_WEALTH: RequirementItem = {
  key: "source_of_wealth",
  name: "Source of Wealth confirmation",
  note: "Short narrative plus supporting evidence",
  mustInclude: [
    "Primary source(s) of accumulated wealth",
    "Approximate timeframe over which the wealth was accumulated",
    "Order of magnitude or net-worth range",
  ],
  examples: ["Signed SoW letter", "Employer compensation letter", "Sale completion statement"],
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["source_of_funds_evidence", "bank_statement"],
};

const SOURCE_OF_FUNDS: RequirementItem = {
  key: "source_of_funds",
  name: "Source of Funds evidence",
  note: "Evidence that the subscription monies originate from a legitimate, declared account",
  mustInclude: [
    "Account holder name matching the investor",
    "Bank name and account reference",
    "Recent balance and transaction history covering the subscription amount",
  ],
  examples: ["Bank statement", "Subscription funding letter"],
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["bank_statement", "source_of_funds_evidence"],
};

// ─── Entity-level items (shared across LP / Corp / Trust / Regulated) ────

const TAX_RESIDENCY_ENTITY: RequirementItem = {
  key: "entity_tax_residency",
  name: "Tax residency self-certification",
  note: "CRS / FATCA for the entity",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["fatca_declaration"],
};

const ENTITY_SOURCE_OF_WEALTH: RequirementItem = {
  key: "entity_source_of_wealth",
  name: "Source of Wealth confirmation",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["source_of_funds_evidence", "bank_statement"],
};

const ENTITY_SOURCE_OF_FUNDS: RequirementItem = {
  key: "entity_source_of_funds",
  name: "Source of Funds for this subscription",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["bank_statement", "source_of_funds_evidence"],
};

const AUTHORISED_SIGNATORY_LIST: RequirementItem = {
  key: "authorised_signatory_list",
  name: "Authorised signatory list",
  note: "Or board resolution authorising the subscription",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["authorised_signatory_list", "authority_to_act"],
};

const AUTHORISED_SIGNATORY_LIST_SPECIMEN: RequirementItem = {
  ...AUTHORISED_SIGNATORY_LIST,
  note: "With specimen signatures",
};

// ─── Trust-specific items ────────────────────────────────────────────────

const TRUST_DEED: RequirementItem = {
  key: "trust_deed",
  name: "Trust Deed",
  note: "Including any deeds of variation or appointment",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["trust_deed", "articles_of_association"],
};

const SCHEDULE_OF_TRUST_PARTIES: RequirementItem = {
  key: "schedule_of_trust_parties",
  name: "Schedule of trustees, settlor(s), protector(s) and named beneficiaries",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["schedule_of_trust_parties", "register_of_members", "register_of_directors"],
};

const TAX_RESIDENCY_TRUST: RequirementItem = {
  ...TAX_RESIDENCY_ENTITY,
  note: "CRS / FATCA for the trust",
};

const SOURCE_OF_WEALTH_SETTLOR: RequirementItem = {
  key: "source_of_wealth_settlor",
  name: "Source of Wealth of the settlor",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["source_of_funds_evidence", "bank_statement"],
};

const AUTHORITY_TO_ACT_TRUST: RequirementItem = {
  key: "authority_to_act_trust",
  name: "Authority to act for the trust",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["authority_to_act", "authorised_signatory_list"],
};

// ─── Corporation / Private Trust Corporation items ───────────────────────

const CERTIFICATE_OF_INCORPORATION: RequirementItem = {
  key: "certificate_of_incorporation",
  name: "Certificate of Incorporation",
  mustInclude: [
    "Registered legal name",
    "Registration number and date",
    "Jurisdiction of formation",
    "Official stamp or seal of the registry",
  ],
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["certificate_of_incorporation", "certificate_of_formation"],
};

const MEMORANDUM_AND_ARTICLES: RequirementItem = {
  key: "memorandum_and_articles",
  name: "Memorandum and Articles of Association",
  note: "Certified English translation if not in English",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["articles_of_association"],
};

const REGISTER_OF_DIRECTORS: RequirementItem = {
  key: "register_of_directors",
  name: "Register of directors",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["register_of_directors"],
};

const REGISTER_OF_SHAREHOLDERS: RequirementItem = {
  key: "register_of_shareholders",
  name: "Register of shareholders / members",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["register_of_members"],
};

const TAX_RESIDENCY_CORP: RequirementItem = {
  ...TAX_RESIDENCY_ENTITY,
  note: "CRS / FATCA for the entity",
};

const INTERMEDIATE_REGISTER_OF_MEMBERS: RequirementItem = {
  key: "intermediate_register_of_members",
  name: "Register of members / equivalent ownership evidence",
  note: "For every intermediate entity",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["register_of_members"],
};

// ─── Limited Partnership items ───────────────────────────────────────────

const CERTIFICATE_OF_LIMITED_PARTNERSHIP: RequirementItem = {
  key: "certificate_of_limited_partnership",
  name: "Certificate of Limited Partnership",
  note: "Or equivalent registration certificate",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["certificate_of_incorporation", "certificate_of_formation"],
};

const LIMITED_PARTNERSHIP_AGREEMENT: RequirementItem = {
  key: "limited_partnership_agreement",
  name: "Limited Partnership Agreement",
  note: "Executed version, including any amendments",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["limited_partnership_agreement", "articles_of_association"],
};

const REGISTER_OF_PARTNERS: RequirementItem = {
  key: "register_of_partners",
  name: "Register of partners",
  note: "Identifying all general and limited partners",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["register_of_members", "register_of_directors"],
};

const TAX_RESIDENCY_LP: RequirementItem = {
  ...TAX_RESIDENCY_ENTITY,
  note: "CRS / FATCA for the partnership",
};

const GP_CONSTITUTIONAL_DOCS: RequirementItem = {
  key: "gp_constitutional_docs",
  name: "Constitutional documents of the GP",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["certificate_of_incorporation", "certificate_of_formation", "articles_of_association"],
};

const GP_REGISTER_OF_DIRECTORS: RequirementItem = {
  key: "gp_register_of_directors",
  name: "Register of directors / managers of the GP",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["register_of_directors"],
};

const EVIDENCE_OF_AUTHORITY_PARTNERSHIP: RequirementItem = {
  key: "evidence_of_authority_partnership",
  name: "Evidence of authority to act for the partnership",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["authority_to_act", "authorised_signatory_list"],
};

// ─── Regulated / Listed Entity items ─────────────────────────────────────

const EVIDENCE_OF_REGULATED_STATUS: RequirementItem = {
  key: "evidence_of_regulated_status",
  name: "Evidence of regulated status",
  note: "Regulator name, licence number and licence scope, or stock exchange listing reference",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["evidence_of_regulated_status"],
};

const AUDITED_FINANCIAL_STATEMENTS: RequirementItem = {
  key: "audited_financial_statements",
  name: "Most recent audited financial statements",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["audited_financial_statements"],
};

const TAX_RESIDENCY_REGULATED: RequirementItem = {
  ...TAX_RESIDENCY_ENTITY,
  note: "CRS / FATCA for the entity",
};

// ─── Per-form requirement bundles ────────────────────────────────────────

export function requirementsFor(form: StepperLegalForm): RequirementGroup[] {
  switch (form) {
    case "Individual":
      return [
        {
          party: "Investor (individual)",
          items: [
            PHOTO_ID,
            PROOF_OF_ADDRESS,
            TAX_RESIDENCY_INDIVIDUAL,
            SOURCE_OF_WEALTH,
            SOURCE_OF_FUNDS,
            PEP_DECLARATION,
          ],
        },
      ];

    case "Regulated or Listed Entity":
      return [
        {
          party: "The Regulated or Listed Entity",
          items: [
            EVIDENCE_OF_REGULATED_STATUS,
            AUDITED_FINANCIAL_STATEMENTS,
            AUTHORISED_SIGNATORY_LIST,
            TAX_RESIDENCY_REGULATED,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "Authorised signatories acting on this subscription",
          items: [PHOTO_ID, PROOF_OF_ADDRESS],
        },
      ];

    case "Trust":
      return [
        {
          party: "The Trust",
          items: [
            TRUST_DEED,
            SCHEDULE_OF_TRUST_PARTIES,
            TAX_RESIDENCY_TRUST,
            SOURCE_OF_WEALTH_SETTLOR,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "Each trustee (if a corporate trustee, also its constitutional documents)",
          items: [PHOTO_ID, PROOF_OF_ADDRESS, AUTHORITY_TO_ACT_TRUST],
        },
        {
          party: "Settlor, protector and each named beneficiary ≥ 25%",
          items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION],
        },
      ];

    case "Corporation or Private Trust Corporation":
      return [
        {
          party: "The Investing Entity",
          items: [
            CERTIFICATE_OF_INCORPORATION,
            MEMORANDUM_AND_ARTICLES,
            REGISTER_OF_DIRECTORS,
            REGISTER_OF_SHAREHOLDERS,
            AUTHORISED_SIGNATORY_LIST,
            TAX_RESIDENCY_CORP,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "Each ownership layer up to ultimate beneficial owners",
          items: [INTERMEDIATE_REGISTER_OF_MEMBERS],
        },
        {
          party: "Each UBO ≥ 25%, each director and each authorised signatory",
          items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION],
        },
      ];

    case "Limited Partnership":
      return [
        {
          party: "The Limited Partnership",
          items: [
            CERTIFICATE_OF_LIMITED_PARTNERSHIP,
            LIMITED_PARTNERSHIP_AGREEMENT,
            REGISTER_OF_PARTNERS,
            AUTHORISED_SIGNATORY_LIST_SPECIMEN,
            TAX_RESIDENCY_LP,
          ],
        },
        {
          party: "General Partner(s)",
          items: [
            GP_CONSTITUTIONAL_DOCS,
            GP_REGISTER_OF_DIRECTORS,
            EVIDENCE_OF_AUTHORITY_PARTNERSHIP,
          ],
        },
        {
          party: "Each Beneficial Owner ≥ 25% and each Authorised Signatory",
          items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION],
        },
      ];
  }
}

/** Flat list of all requirement keys for a given form (for completion math). */
export function flatRequirements(form: StepperLegalForm): RequirementItem[] {
  return requirementsFor(form).flatMap((g) => g.items);
}

/** Returns the requirements satisfied by a given document type for the active form. */
export function requirementsForDocumentType(
  form: StepperLegalForm,
  documentType: string,
): RequirementItem[] {
  return flatRequirements(form).filter((item) =>
    item.acceptedDocumentTypes.includes(documentType),
  );
}
