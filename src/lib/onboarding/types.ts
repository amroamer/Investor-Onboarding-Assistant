// Onboarding domain types — investor-visible only unless noted.
export type LegalForm =
  | "Individual"
  | "Limited Partnership"
  | "Corporation"
  | "Trust"
  | "Regulated or Listed Entity";

export type Stage =
  | "Investor profile"
  | "Documents"
  | "Ownership and related parties"
  | "Source of Wealth and Source of Funds"
  | "Declarations"
  | "Review and confirmation"
  | "Submitted to Compliance";

export type StageStatus =
  | "Not started"
  | "In progress"
  | "Action required"
  | "Ready for review"
  | "Confirmed"
  | "Submitted";

export type ChecklistStatus =
  | "Required"
  | "Received"
  | "Under review"
  | "Needs review"
  | "Accepted for onboarding review"
  | "Attention required"
  | "Missing"
  | "Replaced"
  | "Investor confirmed";

/**
 * Outcome of trying to slot an uploaded document into the active checklist.
 * Drives the "Unmatched uploads" tray and the post-upload toast.
 *
 *   matched                 — classified type fits the active legal form and was mapped to ≥1 checklist row
 *   unmatched_wrong_form    — recognised type, but belongs to a different legal form (e.g. Cert of Incorp on Individual)
 *   unmatched_unknown_type  — classifier returned "other" / low confidence and could not be slotted
 *   duplicate               — already satisfied by another upload
 *   needs_review            — matched, but validator flagged an inconsistency that the investor must resolve
 */
export type MatchOutcome =
  | "matched"
  | "unmatched_wrong_form"
  | "unmatched_unknown_type"
  | "duplicate"
  | "needs_review";

export interface ChecklistItem {
  id: string;
  name: string;
  party: string;
  reason: string;
  status: ChecklistStatus;
  investorIssue?: string;
  remedy?: string;
  receivedAt?: string;
  sourceDocId?: string;
}

export interface UploadedDocument {
  id: string;
  fileName: string;
  classifiedAs: string;
  party: string;
  receivedAt: string;
  mappedChecklistIds: string[];
  /** How the document was slotted (or not) into the active checklist. */
  matchOutcome?: MatchOutcome;
  /** Human-readable explanation when matchOutcome is unmatched_*. */
  matchReason?: string;
  /** When unmatched_wrong_form, the legal form this document would fit. */
  suggestedLegalForm?: LegalForm;
  /** Classifier confidence at upload time. */
  classificationConfidence?: "low" | "medium" | "high";
  // Compliance-only fields are stored separately on the case
}

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  source: string; // e.g. "From passport"
  confirmed?: boolean;
  correctedFrom?: string;
}

export type PepStatus = "no" | "local" | "foreign" | "connected";

export interface RelatedParty {
  id: string;
  name: string;
  role: string; // Director / Shareholder / Signatory / UBO / Trustee etc.
  ownershipPct?: number;
  partyType: "Individual" | "Entity";
  nationality?: string;
  dob?: string;
  pepProvisional?: boolean; // compliance-only flag
  /** Investor-declared PEP status from the PEP card. */
  pepStatus?: PepStatus;
}

export interface RedFlag {
  id: string;
  category: string;
  description: string;
  relatedParty?: string;
  sourceDoc?: string;
  severity: "Low" | "Medium" | "High";
  rule: string;
  evidence: string;
  recommendedAction: string;
  status: "Open" | "Reviewed" | "Cleared";
  reviewerNote?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: "Investor" | "Agent" | "Compliance";
  type: string;
  detail: string;
}

/**
 * Request For Information — compliance asks the investor for additional information.
 * Lifecycle:
 *   draft     — drafted by compliance, not yet visible to the investor
 *   sent      — visible in the investor's conversation; awaiting response
 *   responded — investor has responded; awaiting compliance review
 *   resolved  — compliance has accepted the response (or the underlying issue is resolved)
 *
 * `selected` is the compliance-side checkbox for batch-send: which drafts will be
 * sent when the reviewer clicks "Send to investor". After sending, `selected` is
 * irrelevant (status takes over).
 */
export type ScreeningStatus =
  | "Not screened"
  | "Ready for screening"
  | "Screening in progress"
  | "Screening completed"
  | "Screening failed";

/** One match returned by the screening provider (e.g. OpenSanctions). */
export interface ScreeningMatch {
  id: string;
  caption: string;
  /** Match confidence 0..1 if the provider gives one. */
  score: number;
  /** OpenSanctions "topics" like "sanction", "role.pep", "crime", "wanted", etc. */
  topics: string[];
  countries: string[];
  /** Which lists/datasets matched (e.g. "us_ofac_sdn", "eu_fsf"). */
  datasets: string[];
  birthDate?: string;
  /** Direct link to the entity on the provider's site, if available. */
  sourceUrl?: string;
}

export interface NameToScreen {
  name: string;
  partyType: string;
  role: string;
  relationship: string;
  country?: string;
  dob?: string;
  pepProvisional: boolean;
  sourceDoc: string;
  screeningStatus: ScreeningStatus;
  screenedAt?: string;
  /** Provider used for the screening (e.g. "OpenSanctions"). */
  provider?: string;
  matches?: ScreeningMatch[];
  /** Populated when screeningStatus === "Screening failed". */
  error?: string;
}

export type RfiStatus = "draft" | "sent" | "responded" | "resolved";

export interface FurtherInfoRequest {
  id: string;
  text: string;
  selected: boolean;
  status: RfiStatus;
  sentAt?: string;
  respondedAt?: string;
  investorResponseText?: string;
  resolvedAt?: string;
  resolvedNote?: string;
}

export type MessageAuthor = "agent" | "investor" | "system";

export interface ConversationMessage {
  id: string;
  author: MessageAuthor;
  text?: string;
  at: string;
  component?: EmbeddedComponent;
}

export type EmbeddedComponent =
  | { kind: "choices"; choices: { id: string; label: string; hint?: string }[]; resolved?: string }
  | { kind: "upload"; resolved?: boolean }
  | { kind: "processing"; steps: string[]; done?: boolean }
  | { kind: "checklist" }
  | { kind: "identity"; legalForm: LegalForm; resolved?: boolean }
  | { kind: "ownership"; resolved?: boolean }
  | { kind: "sourceOfWealth"; resolved?: boolean }
  | { kind: "sourceOfFunds"; resolved?: boolean }
  | { kind: "pep"; resolved?: boolean }
  | { kind: "fatca"; resolved?: boolean }
  | { kind: "review"; resolved?: boolean }
  | { kind: "receipt" }
  | { kind: "extracted"; title: string; fields: ExtractedField[] }
  | {
      kind: "requirements";
      legalForm: LegalForm;
      groups: { party: string; items: { name: string; note?: string }[] }[];
    }
  | {
      kind: "rfi";
      items: { id: string; text: string; status: RfiStatus; investorResponseText?: string }[];
    };

export interface OnboardingCase {
  caseId: string;
  investorName: string;
  primaryContact: string;
  legalForm?: LegalForm;
  jurisdiction?: string;
  onboardingMode?: "guided" | "upload-first";
  currentStage: Stage;
  stageStatus: Record<Stage, StageStatus>;
  progressPct: number;
  step: string; // engine cursor
  conversation: ConversationMessage[];
  checklist: ChecklistItem[];
  uploadedDocuments: UploadedDocument[];
  extractedFields: ExtractedField[];
  relatedParties: RelatedParty[];
  ownershipConfirmed: boolean;
  sourceOfWealth?: { category: string; detail: string; source: string };
  sourceOfFunds?: { category: string; detail: string; source: string };
  pepConfirmed: boolean;
  fatcaConfirmed: boolean;
  /** Tax classification captured by the FATCA / CRS card. */
  fatca?: { tin: string; section: string };
  /** Date of birth, captured on the Identity card for Individual investors. */
  dob?: string;
  sectionConfirmations: Record<string, boolean>;
  finalConfirmation: boolean;
  submittedAt?: string;
  lastSavedAt: string;

  // Compliance-only — must never be rendered in investor views.
  complianceOnly: {
    redFlags: RedFlag[];
    suggestedOutcome: "PASS" | "FAIL" | "PENDING";
    reasoning: {
      rule: string;
      evidence: string;
      doc?: string;
      severity: "Low" | "Medium" | "High";
      consequence: string;
      recommendedAction: string;
    }[];
    riskScore: number;
    riskBand: "Low" | "Medium" | "High";
    namesToScreen: NameToScreen[];
    furtherInfoRequests: FurtherInfoRequest[];
    reviewerNotes: string[];
  };

  audit: AuditEvent[];
}
