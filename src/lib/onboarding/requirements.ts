import type { LegalForm } from "./types";

export interface RequirementItem {
  name: string;
  note?: string;
  /** Bulleted list of things the document must clearly show. */
  mustInclude?: string[];
  /** Concrete example documents that satisfy the requirement. */
  examples?: string[];
  /** Accepted file formats. */
  acceptedFormats?: string[];
  /** Conditions under which the document will be rejected. */
  rejectedIf?: string[];
}

export interface RequirementGroup {
  party: string;
  items: RequirementItem[];
}

const PHOTO_ID: RequirementItem = {
  name: "Government-issued photo ID",
  note: "Passport, national ID card or driving licence",
  mustInclude: [
    "Full legal name",
    "Date of birth",
    "Clear photograph of the holder",
    "Document number and issuing authority",
    "Expiry date (must not be expired)",
  ],
  examples: [
    "Passport (photo page)",
    "National ID card (both sides)",
    "Driving licence (both sides)",
  ],
  acceptedFormats: ["PDF", "PNG", "JPEG"],
  rejectedIf: [
    "Expired",
    "Photo or text is blurred or cropped",
    "Document is not in English (provide a certified translation)",
  ],
};

const PROOF_OF_ADDRESS: RequirementItem = {
  name: "Proof of residential address",
  note: "Utility bill or bank statement issued within the last 6 months",
  mustInclude: [
    "Full name matching the photo ID",
    "Full residential address",
    "Issue date within the last 6 months",
    "Name and logo of the issuing organisation",
  ],
  examples: [
    "Utility bill (electricity, water, gas, internet)",
    "Bank or credit card statement",
    "Tax authority correspondence",
  ],
  acceptedFormats: ["PDF", "PNG", "JPEG"],
  rejectedIf: [
    "Older than 6 months",
    "Address differs from the one on the ID without explanation",
    "Mobile phone bills or handwritten letters",
  ],
};

const PEP_DECLARATION: RequirementItem = {
  name: "PEP declaration",
  note: "Including immediate family and close associates",
  mustInclude: [
    "Statement of PEP status (self, family or close associates)",
    "Names and relationships of any disclosed PEPs",
    "Signature and date",
  ],
  examples: [
    "Signed PEP self-declaration form",
    "Compliance questionnaire with PEP section completed",
  ],
  acceptedFormats: ["PDF"],
  rejectedIf: ["Unsigned", "PEP section left blank"],
};

const TAX_RESIDENCY: RequirementItem = {
  name: "Tax residency self-certification",
  note: "CRS / FATCA declaration",
  mustInclude: [
    "Country (or countries) of tax residency",
    "Taxpayer Identification Number(s)",
    "Signature and date of declarant",
  ],
  examples: [
    "Signed CRS self-certification form",
    "IRS Form W-9 (US persons) or W-8BEN (non-US persons)",
  ],
  acceptedFormats: ["PDF"],
  rejectedIf: ["Unsigned", "Missing TIN where required by the jurisdiction"],
};

const SOURCE_OF_WEALTH: RequirementItem = {
  name: "Source of Wealth confirmation",
  note: "Short narrative plus supporting evidence",
  mustInclude: [
    "Narrative describing how overall wealth was accumulated",
    "Supporting evidence (e.g. employment, business sale, inheritance)",
    "Reference to the time period over which wealth was built",
  ],
  examples: [
    "Letter from employer with salary history",
    "Sale agreement for a business or property",
    "Inheritance grant of probate",
    "Audited company accounts (for business owners)",
  ],
  acceptedFormats: ["PDF"],
  rejectedIf: [
    "Narrative without any supporting evidence",
    "Generic statement that does not explain the underlying wealth",
  ],
};

const SOURCE_OF_FUNDS: RequirementItem = {
  name: "Source of Funds for this subscription",
  note: "Bank statement or transfer confirmation",
  mustInclude: [
    "Account holder name matching the investor",
    "Amount of the subscription (or that the account can fund it)",
    "Recent activity (statement within the last 3 months)",
  ],
  examples: [
    "Recent bank statement showing the funds",
    "SWIFT / wire confirmation for the subscription",
    "Sale proceeds settlement note",
  ],
  acceptedFormats: ["PDF"],
  rejectedIf: [
    "Account holder does not match the investor",
    "Statement is older than 3 months",
    "Funds are routed from a third party without explanation",
  ],
};

export function requirementsFor(form: LegalForm): RequirementGroup[] {
  switch (form) {
    case "Individual":
      return [
        {
          party: "Investor (individual)",
          items: [
            PHOTO_ID,
            PROOF_OF_ADDRESS,
            TAX_RESIDENCY,
            SOURCE_OF_WEALTH,
            SOURCE_OF_FUNDS,
            PEP_DECLARATION,
          ],
        },
      ];
    case "Limited Partnership":
      return [
        {
          party: "The Limited Partnership",
          items: [
            {
              name: "Certificate of Limited Partnership",
              note: "Or equivalent registration certificate",
              mustInclude: [
                "Registered name of the partnership",
                "Registration number and date of registration",
                "Jurisdiction of formation",
                "Official stamp or seal of the registry",
              ],
              examples: [
                "Certificate of Limited Partnership issued by the registry",
                "Equivalent foreign registration certificate",
              ],
              acceptedFormats: ["PDF"],
              rejectedIf: ["Not issued by the official registry"],
            },
            {
              name: "Limited Partnership Agreement",
              note: "Executed version, including any amendments",
              mustInclude: [
                "Full executed LPA with all signature pages",
                "Schedule of partners",
                "Any deeds of variation or amendment",
              ],
              examples: ["Final executed LPA + side letters"],
              acceptedFormats: ["PDF"],
              rejectedIf: ["Draft / unsigned version", "Missing signature pages"],
            },
            {
              name: "Register of partners",
              note: "Identifying all general and limited partners",
              mustInclude: [
                "Names of all general and limited partners",
                "Commitment amounts (or percentage interests)",
                "Effective date of the register",
              ],
              acceptedFormats: ["PDF"],
            },
            {
              name: "Authorised signatory list",
              note: "With specimen signatures",
              mustInclude: [
                "Names and roles of authorised signatories",
                "Specimen signatures",
                "Signing limits or authority scope",
              ],
              acceptedFormats: ["PDF"],
            },
            {
              ...TAX_RESIDENCY,
              note: "CRS / FATCA for the partnership",
            },
          ],
        },
        {
          party: "General Partner(s)",
          items: [
            {
              name: "Constitutional documents of the GP",
              mustInclude: [
                "Certificate of incorporation (or equivalent)",
                "Memorandum and articles (or operating agreement)",
              ],
              acceptedFormats: ["PDF"],
            },
            {
              name: "Register of directors / managers of the GP",
              mustInclude: ["Full names and appointment dates of all directors/managers"],
              acceptedFormats: ["PDF"],
            },
            {
              name: "Evidence of authority to act for the partnership",
              mustInclude: [
                "Reference to the relevant provision of the LPA",
                "Board resolution or power of attorney where applicable",
              ],
              acceptedFormats: ["PDF"],
            },
          ],
        },
        {
          party: "Each beneficial owner ≥ 25% and each authorised signatory",
          items: [
            PHOTO_ID,
            { ...PROOF_OF_ADDRESS, note: "Issued within the last 6 months" },
            PEP_DECLARATION,
          ],
        },
      ];
    case "Corporation":
      return [
        {
          party: "The investing entity",
          items: [
            {
              name: "Certificate of Incorporation",
              mustInclude: [
                "Registered company name",
                "Company number and date of incorporation",
                "Jurisdiction of incorporation",
                "Registry stamp or seal",
              ],
              acceptedFormats: ["PDF"],
            },
            {
              name: "Memorandum and Articles of Association",
              note: "Certified English translation if not in English",
              mustInclude: [
                "Full current articles (with all amendments)",
                "Object clauses showing capacity to invest",
              ],
              acceptedFormats: ["PDF"],
              rejectedIf: ["Outdated version superseded by later amendments"],
            },
            {
              name: "Register of directors",
              mustInclude: ["Full names, dates of appointment and date the register was extracted"],
              acceptedFormats: ["PDF"],
            },
            {
              name: "Register of shareholders / members",
              mustInclude: [
                "Names of all shareholders/members",
                "Number and class of shares held",
                "Date the register was extracted",
              ],
              acceptedFormats: ["PDF"],
            },
            {
              name: "Authorised signatory list",
              note: "Or board resolution authorising the subscription",
              mustInclude: [
                "Names and titles of authorised signatories",
                "Signing limits or scope",
                "Effective date",
              ],
              acceptedFormats: ["PDF"],
            },
            {
              ...TAX_RESIDENCY,
              note: "CRS / FATCA for the entity",
            },
            SOURCE_OF_WEALTH,
            SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "Each ownership layer up to ultimate beneficial owners",
          items: [
            {
              name: "Register of members / equivalent ownership evidence",
              note: "For every intermediate entity",
              mustInclude: [
                "Ownership chain from the investing entity up to each UBO ≥ 25%",
                "Registers for every intermediate entity",
              ],
              acceptedFormats: ["PDF"],
            },
          ],
        },
        {
          party: "Each UBO ≥ 25%, each director and each authorised signatory",
          items: [
            PHOTO_ID,
            { ...PROOF_OF_ADDRESS, note: "Issued within the last 6 months" },
            PEP_DECLARATION,
          ],
        },
      ];
    case "Trust":
      return [
        {
          party: "The Trust",
          items: [
            {
              name: "Trust Deed",
              note: "Including any deeds of variation or appointment",
              mustInclude: [
                "Full executed trust deed",
                "Any deeds of variation, appointment or removal of trustees",
                "Schedule of trust property where applicable",
              ],
              acceptedFormats: ["PDF"],
              rejectedIf: ["Draft / unsigned deed", "Deed superseded by later amendments not provided"],
            },
            {
              name: "Schedule of trustees, settlor(s), protector(s) and named beneficiaries",
              mustInclude: [
                "Full names and roles of every party to the trust",
                "Effective date of the schedule",
              ],
              acceptedFormats: ["PDF"],
            },
            {
              ...TAX_RESIDENCY,
              note: "CRS / FATCA for the trust",
            },
            { ...SOURCE_OF_WEALTH, name: "Source of Wealth of the settlor" },
            SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "Each trustee (if a corporate trustee, also its constitutional documents)",
          items: [
            PHOTO_ID,
            { ...PROOF_OF_ADDRESS, note: "Issued within the last 6 months" },
            {
              name: "Authority to act for the trust",
              mustInclude: [
                "Reference to the relevant clause of the trust deed",
                "Trustee resolution or power of attorney where applicable",
              ],
              acceptedFormats: ["PDF"],
            },
          ],
        },
        {
          party: "Settlor, protector and each named beneficiary ≥ 25%",
          items: [
            PHOTO_ID,
            { ...PROOF_OF_ADDRESS, note: undefined },
            PEP_DECLARATION,
          ],
        },
      ];
    case "Regulated or Listed Entity":
      return [
        {
          party: "The regulated or listed entity",
          items: [
            {
              name: "Evidence of regulated status",
              note: "Regulator name, licence number and licence scope, or stock exchange listing reference",
              mustInclude: [
                "Name of the regulator or stock exchange",
                "Licence number or listing reference",
                "Scope of the licence or listing",
                "Date the evidence was extracted (within last 3 months)",
              ],
              examples: [
                "Screenshot of the regulator's public register entry",
                "Stock exchange listing page printout",
              ],
              acceptedFormats: ["PDF", "PNG", "JPEG"],
              rejectedIf: ["Self-generated certificates without a verifiable public source"],
            },
            {
              name: "Most recent audited financial statements",
              mustInclude: [
                "Auditor's report and signature",
                "Period covered (most recent completed financial year)",
              ],
              acceptedFormats: ["PDF"],
              rejectedIf: ["Unaudited management accounts", "More than 18 months old"],
            },
            {
              name: "Authorised signatory list",
              note: "Or board resolution authorising the subscription",
              mustInclude: ["Names, titles and signing limits of authorised signatories"],
              acceptedFormats: ["PDF"],
            },
            {
              ...TAX_RESIDENCY,
              note: "CRS / FATCA for the entity",
            },
            SOURCE_OF_FUNDS,
          ],
        },
        {
          party: "Authorised signatories acting on this subscription",
          items: [
            PHOTO_ID,
            { ...PROOF_OF_ADDRESS, note: "Issued within the last 6 months" },
          ],
        },
      ];
  }
}
