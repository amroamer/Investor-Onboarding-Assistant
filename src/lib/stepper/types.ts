// Stepper onboarding domain types.
//
// This module is a parallel, isolated rewrite of the conversational
// onboarding flow. Nothing here is shared with src/lib/onboarding/*.

export type StepperLegalForm =
  | "Individual"
  | "Corporation"
  | "LLC"
  | "Limited Partnership"
  | "General Partnership / LLP"
  | "Trust"
  | "Foundation"
  | "Investment Fund"
  | "Pension Fund"
  | "Government / Sovereign"
  | "Regulated or Listed Entity"
  | "Charity / Endowment / NGO"
  | "Estate"
  | "Other";

export const STEPPER_LEGAL_FORMS: StepperLegalForm[] = [
  "Individual",
  "Corporation",
  "LLC",
  "Limited Partnership",
  "General Partnership / LLP",
  "Trust",
  "Foundation",
  "Investment Fund",
  "Pension Fund",
  "Government / Sovereign",
  "Regulated or Listed Entity",
  "Charity / Endowment / NGO",
  "Estate",
  "Other",
];

export interface LegalFormGroup {
  heading: string;
  forms: { form: StepperLegalForm; description: string }[];
}

export const STEPPER_LEGAL_FORM_GROUPS: LegalFormGroup[] = [
  {
    heading: "Individual",
    forms: [
      { form: "Individual", description: "A natural person investing in their own name." },
    ],
  },
  {
    heading: "Private structures",
    forms: [
      { form: "Trust", description: "A trust arrangement with a settlor, trustee and beneficiaries." },
      { form: "Foundation", description: "A foundation or stiftung — separate legal personality, no shareholders." },
      { form: "Estate", description: "An estate of a deceased person, represented by an executor or administrator." },
    ],
  },
  {
    heading: "Operating entities",
    forms: [
      { form: "Corporation", description: "A company limited by shares (Ltd, Inc, GmbH, S.A., etc.)." },
      { form: "LLC", description: "A limited liability company with members and an operating agreement." },
      { form: "Limited Partnership", description: "A partnership with one or more general partners and limited partners." },
      { form: "General Partnership / LLP", description: "A general partnership or limited liability partnership." },
    ],
  },
  {
    heading: "Regulated & institutional",
    forms: [
      { form: "Investment Fund", description: "A collective investment vehicle (regulated or unregulated)." },
      { form: "Pension Fund", description: "A pension scheme or retirement plan." },
      { form: "Government / Sovereign", description: "A government, sovereign wealth fund or state-owned entity." },
      { form: "Regulated or Listed Entity", description: "A bank, insurer or listed company." },
      { form: "Charity / Endowment / NGO", description: "A charitable organisation or endowment." },
    ],
  },
  {
    heading: "Special cases",
    forms: [
      { form: "Other", description: "Choose this if none of the above describe your investing entity. We will route the case for manual review." },
    ],
  },
];

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
}

export type UploadStatus =
  | "uploading"
  | "extracting"
  | "ready"
  | "failed";

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
  attestationsAccepted?: boolean;
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
