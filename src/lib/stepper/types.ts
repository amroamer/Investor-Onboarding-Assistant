// Stepper onboarding domain types.
//
// This module is a parallel, isolated rewrite of the conversational
// onboarding flow. Nothing here is shared with src/lib/onboarding/*.

/**
 * Five investor party types. Replaces the previous 14-form taxonomy.
 * Each form has a dedicated requirement bundle in `requirements.ts`.
 */
export type StepperLegalForm =
  | "Individual"
  | "Limited Partnership"
  | "Corporation or Private Trust Corporation"
  | "Trust"
  | "Regulated or Listed Entity";

export const STEPPER_LEGAL_FORMS: StepperLegalForm[] = [
  "Individual",
  "Limited Partnership",
  "Corporation or Private Trust Corporation",
  "Trust",
  "Regulated or Listed Entity",
];

/** Investor-facing flat list used by Step 1 — replaces the legacy nested groups. */
export interface LegalFormChoice {
  form: StepperLegalForm;
  description: string;
}

export const STEPPER_LEGAL_FORM_CHOICES: LegalFormChoice[] = [
  {
    form: "Individual",
    description: "A natural person investing in their own name.",
  },
  {
    form: "Limited Partnership",
    description:
      "A partnership with one or more general partners and limited partners (LP).",
  },
  {
    form: "Corporation or Private Trust Corporation",
    description:
      "A company limited by shares or a private trust corporation (Ltd, Inc, GmbH, PTC, etc.).",
  },
  {
    form: "Trust",
    description:
      "A trust arrangement with a settlor, trustee(s), protector(s) and named beneficiaries.",
  },
  {
    form: "Regulated or Listed Entity",
    description:
      "A regulated firm (bank, insurer, investment fund, pension fund) or a listed entity.",
  },
];

/**
 * Sanitise a legacy `legalForm` string read from the database into one of the
 * five supported values. Maps deprecated forms (LLC, Foundation, Estate,
 * Investment Fund, Pension Fund, Government / Sovereign, Charity, Other,
 * Corporation, General Partnership / LLP) onto the nearest current form so
 * old cases remain readable.
 *
 * Returns `undefined` only if the input is empty/null. Always returns one of
 * the five supported `StepperLegalForm` values otherwise.
 */
export function sanitiseLegalForm(input: string | null | undefined): StepperLegalForm | undefined {
  if (!input) return undefined;
  const v = String(input).trim();
  if (v.length === 0) return undefined;
  switch (v) {
    case "Individual":
      return "Individual";
    case "Limited Partnership":
    case "General Partnership / LLP":
      return "Limited Partnership";
    case "Corporation":
    case "LLC":
    case "Corporation or Private Trust Corporation":
      return "Corporation or Private Trust Corporation";
    case "Trust":
    case "Foundation":
    case "Estate":
      return "Trust";
    case "Regulated or Listed Entity":
    case "Investment Fund":
    case "Pension Fund":
    case "Government / Sovereign":
    case "Charity / Endowment / NGO":
    case "Other":
      return "Regulated or Listed Entity";
    default:
      return "Regulated or Listed Entity";
  }
}

/** Whether the form requires a Source of Wealth narrative on the SoW/SoF step. */
export function requiresSourceOfWealth(form: StepperLegalForm): boolean {
  return (
    form === "Individual" ||
    form === "Corporation or Private Trust Corporation" ||
    form === "Trust"
  );
}

/** Whether the form requires a Source of Funds narrative on the SoW/SoF step. */
export function requiresSourceOfFunds(form: StepperLegalForm): boolean {
  // LP is the only form where SoF is covered entirely by the GP's authority docs.
  return form !== "Limited Partnership";
}

export type StepKey =
  | "profile"
  | "documents"
  | "ownership"
  | "sow-sof"
  | "declarations"
  | "review"
  | "submitted";

export const STEP_KEYS: StepKey[] = [
  "profile",
  "documents",
  "ownership",
  "sow-sof",
  "declarations",
  "review",
  "submitted",
];

export interface StepMeta {
  key: StepKey;
  title: string;
  summary: string;
}

export const STEPS: StepMeta[] = [
  { key: "profile", title: "Investor profile", summary: "Tell us who is investing and the legal form of the investing party." },
  { key: "documents", title: "Documents", summary: "Upload the documents required for your legal form. We extract and validate each one." },
  { key: "ownership", title: "Ownership", summary: "Confirm the people and entities behind the investing party." },
  { key: "sow-sof", title: "Source of Wealth & Funds", summary: "Explain where your wealth and the subscription funds come from, and attach supporting evidence." },
  { key: "declarations", title: "Declarations", summary: "Complete tax-residency, PEP and other required declarations." },
  { key: "review", title: "Review & confirm", summary: "Review the full case before submitting it to Compliance." },
  { key: "submitted", title: "Submitted", summary: "Receipt and next steps." },
];

export type StepStatus = "locked" | "available" | "in_progress" | "complete" | "attention";

export interface StepStateExtras {
  missing?: string[];
  count?: number;
}

export interface StepState {
  key: StepKey;
  status: StepStatus;
  data: StepStateExtras;
  completedAt?: string;
}

export type ChecklistItemStatus =
  | "required"
  | "received"
  | "attention"
  | "accepted";

export interface SuggestedFix {
  /** Investor-facing hint about what to upload instead. */
  hint: string;
  /** The requirement key that the new upload should target — drives the inline Replace button. */
  replacesRequirement: string;
}

export interface ChecklistItem {
  id: string;
  requirementKey: string;
  name: string;
  party: string;
  reason: string;
  status: ChecklistItemStatus;
  receivedAt?: string;
  sourceDocId?: string;
  issue?: string;
  remedy?: string;
  suggestedFix?: SuggestedFix;
}

export interface CrossDocFlag {
  kind: "name_mismatch";
  detail: string;
  /** Doc IDs that disagree. */
  docIds: string[];
  values: string[];
}

export type UploadStatus =
  | "uploading"
  | "extracting"
  | "ready"
  | "failed";

/** Granular phase used by the agent chip during processing. */
export type ProcessingPhase =
  | "pending"
  | "reading"
  | "classifying"
  | "matching"
  | "ready"
  | "failed"
  | "duplicate";

export interface StepperUploadedDocument {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  classifiedAs: string;
  receivedAt: string;
  status: UploadStatus;
  error?: string;
  matchedRequirementKeys: string[];
  extractedFields: Record<string, string>;
  classificationConfidence?: "low" | "medium" | "high";
  sha256?: string;
  processingPhase: ProcessingPhase;
  /** Short snippet pulled from the extracted markdown — drives the inline thumbnail card. */
  thumbnailExcerpt?: string;
}

export interface RelatedParty {
  id: string;
  name: string;
  role: string;
  partyType: "Individual" | "Entity";
  ownershipPct?: number;
  nationality?: string;
  dob?: string;
  pep?: boolean;
}

export type ScreeningRecordStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface ScreeningMatch {
  id: string;
  caption: string;
  score: number;
  topics: string[];
  countries: string[];
  datasets: string[];
  sourceUrl?: string;
}

export interface ScreeningRecord {
  name: string;
  partyType: "Individual" | "Entity";
  role: string;
  status: ScreeningRecordStatus;
  screenedAt?: string;
  matches: ScreeningMatch[];
  error?: string;
}

export interface SourceOfWealth {
  category: string;
  detail: string;
  evidenceDocIds: string[];
}

export interface SourceOfFunds {
  category: string;
  detail: string;
  evidenceDocIds: string[];
}

export interface Declarations {
  taxResidencyCountry?: string;
  taxResidencyAdditional?: string;
  isUsPerson?: boolean;
  usTin?: string;
  pepSelf?: boolean;
  pepFamily?: boolean;
  pepAssociate?: boolean;
  pepDetail?: string;
  /** FATCA / CRS classification for entity investors. */
  fatcaSection?: string;
  /** Entity tax identification number used with the FATCA classification. */
  fatcaTin?: string;
  attestationsAccepted?: boolean;
}

/** Human-readable FATCA / CRS sections used by the entity classification picker. */
export const FATCA_SECTIONS = [
  "Section 1 — Financial Institution",
  "Section 2 — Passive NFFE",
  "Section 3 — Active NFFE",
  "Section 4 — Direct reporting NFFE",
] as const;

export type FatcaSection = (typeof FATCA_SECTIONS)[number];

/** Map the classifier's enum back to a UI section label. */
export function fatcaSectionFromClassification(c: string | undefined): FatcaSection | undefined {
  switch (c) {
    case "financial_institution": return "Section 1 — Financial Institution";
    case "passive_nffe": return "Section 2 — Passive NFFE";
    case "active_nffe": return "Section 3 — Active NFFE";
    case "direct_reporting_nffe": return "Section 4 — Direct reporting NFFE";
    default: return undefined;
  }
}

export interface ProfileData {
  investorName: string;
  primaryContact: string;
  primaryContactEmail: string;
  legalForm: StepperLegalForm;
  jurisdiction: string;
}

export interface StepperAuditEvent {
  id: string;
  at: string;
  actor: "Investor" | "System" | "Compliance";
  type: string;
  detail: string;
}

export interface StepperCase {
  caseId: string;
  profile?: ProfileData;
  currentStep: StepKey;
  steps: Record<StepKey, StepState>;
  uploadedDocuments: StepperUploadedDocument[];
  checklist: ChecklistItem[];
  relatedParties: RelatedParty[];
  screening: ScreeningRecord[];
  sourceOfWealth?: SourceOfWealth;
  sourceOfFunds?: SourceOfFunds;
  declarations: Declarations;
  finalConfirmation: boolean;
  submittedAt?: string;
  lastSavedAt: string;
  createdAt: string;
  audit: StepperAuditEvent[];
  /** Cross-document consistency flags surfaced to the investor on the Documents step. */
  crossDocFlags: CrossDocFlag[];
  /** Most recent investor-visible message from the agent (drives the agent chip). */
  agentStatus?: string;
  /**
   * Set ONLY when `sanitiseLegalForm` had to remap a legacy stored form
   * (e.g. "LLC" → "Corporation or Private Trust Corporation") on the way
   * out of the database. Carries the original string so the compliance
   * cockpit can flag the substitution to the reviewer. Not persisted.
   */
  legacyLegalForm?: string;
}

export function emptyStepState(key: StepKey, status: StepStatus = "locked"): StepState {
  return { key, status, data: {} };
}

export function buildEmptyStepperCase(caseId: string): StepperCase {
  const t = new Date().toISOString();
  return {
    caseId,
    currentStep: "profile",
    steps: {
      profile: emptyStepState("profile", "in_progress"),
      documents: emptyStepState("documents"),
      ownership: emptyStepState("ownership"),
      "sow-sof": emptyStepState("sow-sof"),
      declarations: emptyStepState("declarations"),
      review: emptyStepState("review"),
      submitted: emptyStepState("submitted"),
    },
    uploadedDocuments: [],
    checklist: [],
    relatedParties: [],
    screening: [],
    declarations: {},
    finalConfirmation: false,
    lastSavedAt: t,
    createdAt: t,
    audit: [
      { id: `au_${Math.random().toString(36).slice(2, 10)}`, at: t, actor: "System", type: "Case created", detail: "Stepper case opened" },
    ],
    crossDocFlags: [],
  };
}

export function computeProgressPct(c: StepperCase): number {
  const total = STEP_KEYS.length - 1; // exclude `submitted` which is a receipt step
  let done = 0;
  for (const k of STEP_KEYS) {
    if (k === "submitted") continue;
    if (c.steps[k].status === "complete") done += 1;
  }
  return Math.round((done / total) * 100);
}
