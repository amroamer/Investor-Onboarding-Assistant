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

// ─── Shared building blocks ────────────────────────────────────────────────

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
  note: "Utility bill or bank statement issued within the last 6 months",
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

const TAX_RESIDENCY: RequirementItem = {
  key: "tax_residency",
  name: "Tax residency self-certification",
  note: "CRS / FATCA declaration",
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

const CERTIFICATE_OF_INCORPORATION: RequirementItem = {
  key: "certificate_of_incorporation",
  name: "Certificate of Incorporation / Formation",
  mustInclude: [
    "Registered legal name",
    "Registration number and date",
    "Jurisdiction of formation",
    "Official stamp or seal of the registry",
  ],
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["certificate_of_incorporation", "certificate_of_formation"],
};

const ARTICLES: RequirementItem = {
  key: "articles_of_association",
  name: "Articles of Association / Operating Agreement / Trust Deed",
  note: "Current constitutional document of the entity",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["articles_of_association", "limited_partnership_agreement"],
};

const REGISTER_OF_DIRECTORS: RequirementItem = {
  key: "register_of_directors",
  name: "Register of directors / managers",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["register_of_directors"],
};

const REGISTER_OF_MEMBERS: RequirementItem = {
  key: "register_of_members",
  name: "Register of members / shareholders",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["register_of_members"],
};

const LPA: RequirementItem = {
  key: "limited_partnership_agreement",
  name: "Limited Partnership Agreement (LPA)",
  note: "Executed copy including all signature pages and amendments",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["limited_partnership_agreement"],
};

const REGISTER_OF_PARTNERS: RequirementItem = {
  key: "register_of_partners",
  name: "Register of partners",
  acceptedFormats: ["PDF"],
  acceptedDocumentTypes: ["register_of_members", "register_of_directors"],
};

const ENTITY_TAX_RESIDENCY: RequirementItem = {
  ...TAX_RESIDENCY,
  key: "entity_tax_residency",
  name: "Entity tax residency self-certification",
  note: "CRS / FATCA classification of the entity itself",
};

const ENTITY_SOURCE_OF_FUNDS: RequirementItem = {
  ...SOURCE_OF_FUNDS,
  key: "entity_source_of_funds",
};

const ENTITY_SOURCE_OF_WEALTH: RequirementItem = {
  ...SOURCE_OF_WEALTH,
  key: "entity_source_of_wealth",
  name: "Source of wealth / capital",
};

// ─── Per-form requirement groups ───────────────────────────────────────────

export function requirementsFor(form: StepperLegalForm): RequirementGroup[] {
  switch (form) {
    case "Individual":
      return [
        {
          party: "Investor (individual)",
          items: [PHOTO_ID, PROOF_OF_ADDRESS, TAX_RESIDENCY, SOURCE_OF_WEALTH, SOURCE_OF_FUNDS, PEP_DECLARATION],
        },
      ];

    case "Corporation":
      return [
        {
          party: "The investing entity",
          items: [
            CERTIFICATE_OF_INCORPORATION,
            ARTICLES,
            REGISTER_OF_DIRECTORS,
            REGISTER_OF_MEMBERS,
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "Each director and authorised signatory",
          items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION],
        },
        {
          party: "Each beneficial owner ≥ 25%",
          items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION],
        },
      ];

    case "LLC":
      return [
        {
          party: "The LLC",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Certificate of Formation" },
            { ...ARTICLES, key: "operating_agreement", name: "Operating Agreement" },
            { ...REGISTER_OF_MEMBERS, name: "Register of members" },
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        { party: "Each managing member and authorised signatory", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];

    case "Limited Partnership":
      return [
        {
          party: "The Limited Partnership",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Certificate of Limited Partnership" },
            LPA,
            REGISTER_OF_PARTNERS,
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "General Partner(s)",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, key: "gp_constitutional_docs", name: "Constitutional documents of the GP" },
            REGISTER_OF_DIRECTORS,
          ],
        },
        { party: "Each UBO ≥ 25% and each authorised signatory", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];

    case "General Partnership / LLP":
      return [
        {
          party: "The Partnership",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Certificate of registration" },
            { ...ARTICLES, key: "partnership_agreement", name: "Partnership Agreement (executed)" },
            REGISTER_OF_PARTNERS,
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        { party: "Each partner and authorised signatory", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];

    case "Trust":
      return [
        {
          party: "The Trust",
          items: [
            { ...ARTICLES, key: "trust_deed", name: "Trust Deed (executed)" },
            { ...REGISTER_OF_MEMBERS, key: "register_of_trustees", name: "Register of trustees, settlors and beneficiaries" },
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        { party: "Each trustee, settlor and named beneficiary", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];

    case "Foundation":
      return [
        {
          party: "The Foundation",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Certificate of formation of the foundation" },
            { ...ARTICLES, key: "foundation_charter", name: "Foundation charter / by-laws" },
            { ...REGISTER_OF_MEMBERS, key: "register_of_council", name: "Register of council / board members" },
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        { party: "Each council/board member and authorised signatory", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];

    case "Investment Fund":
      return [
        {
          party: "The Fund",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Fund formation document" },
            { ...ARTICLES, key: "fund_ppm", name: "Private Placement Memorandum / Prospectus" },
            { ...ARTICLES, key: "fund_constitutional", name: "Fund constitutional document" },
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "Fund manager / GP",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, key: "manager_constitutional", name: "Constitutional documents of the manager" },
            { ...PEP_DECLARATION, key: "regulator_licence", name: "Regulatory licence (if regulated)" },
          ],
        },
      ];

    case "Pension Fund":
      return [
        {
          party: "The Pension Fund",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Pension scheme registration certificate" },
            { ...ARTICLES, key: "pension_rules", name: "Trust deed / scheme rules" },
            { ...PEP_DECLARATION, key: "regulator_letter", name: "Regulator authorisation letter" },
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        { party: "Each trustee and authorised signatory", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];

    case "Government / Sovereign":
      return [
        {
          party: "The Government / Sovereign entity",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Establishing legislation or decree" },
            { ...ARTICLES, key: "sovereign_mandate", name: "Investment mandate / by-laws" },
            { ...PEP_DECLARATION, key: "ministerial_authority", name: "Letter of authority from supervising ministry" },
            ENTITY_TAX_RESIDENCY,
          ],
        },
        { party: "Each authorised signatory", items: [PHOTO_ID, PEP_DECLARATION] },
      ];

    case "Regulated or Listed Entity":
      return [
        {
          party: "The Regulated or Listed entity",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Certificate of incorporation" },
            { ...PEP_DECLARATION, key: "regulator_licence", name: "Regulator licence or listing reference" },
            { ...ARTICLES, key: "latest_filing", name: "Latest annual filing / accounts" },
            ENTITY_TAX_RESIDENCY,
          ],
        },
        { party: "Each director and authorised signatory", items: [PHOTO_ID, PEP_DECLARATION] },
      ];

    case "Charity / Endowment / NGO":
      return [
        {
          party: "The Charity / Endowment / NGO",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Charity / NGO registration certificate" },
            { ...ARTICLES, key: "governing_document", name: "Governing document (constitution, deed or by-laws)" },
            { ...REGISTER_OF_MEMBERS, key: "register_of_trustees", name: "Register of trustees / board members" },
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        { party: "Each trustee and authorised signatory", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];

    case "Estate":
      return [
        {
          party: "The Estate",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, key: "grant_of_representation", name: "Grant of probate / letters of administration" },
            { ...ARTICLES, key: "will_or_intestacy", name: "Will or intestacy declaration" },
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        { party: "Each executor / administrator", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];

    case "Other":
      return [
        {
          party: "Core KYC pack (manual-review case)",
          items: [
            { ...CERTIFICATE_OF_INCORPORATION, name: "Constitutional / formation document" },
            { ...REGISTER_OF_MEMBERS, name: "Register of owners / controllers" },
            ENTITY_TAX_RESIDENCY,
            ENTITY_SOURCE_OF_WEALTH,
            ENTITY_SOURCE_OF_FUNDS,
          ],
        },
        { party: "Each controller and authorised signatory", items: [PHOTO_ID, PROOF_OF_ADDRESS, PEP_DECLARATION] },
      ];
  }
}

/** Flat list of all requirement keys for a given form (for completion math). */
export function flatRequirements(form: StepperLegalForm): RequirementItem[] {
  return requirementsFor(form).flatMap((g) => g.items);
}

/** Returns the requirement keys that the given document type satisfies. */
export function requirementsForDocumentType(
  form: StepperLegalForm,
  documentType: string,
): RequirementItem[] {
  return flatRequirements(form).filter((item) =>
    item.acceptedDocumentTypes.includes(documentType),
  );
}
