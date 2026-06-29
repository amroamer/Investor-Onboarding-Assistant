/**
 * Compliance-side types for the stepper flow. Kept separate from
 * `src/lib/stepper/types.ts` to keep that file focused on investor-facing
 * shapes. The legacy chat flow has its own equivalents in
 * `src/lib/onboarding/types.ts` — these are intentionally parallel, not
 * shared.
 */

export type StepperOutcome = "PASS" | "FAIL" | "PENDING";

export type StepperFlagSeverity = "Low" | "Medium" | "High";

export type StepperRiskBand = "Low" | "Medium" | "High";

export interface StepperRedFlag {
  id: string;
  /** Short rule identifier (e.g. R-PEP-001). Useful for cross-referencing in tests / audit. */
  rule: string;
  /** Bucket — drives the chip label in the UI. */
  category: "Documents" | "PEP" | "Jurisdiction" | "Tax" | "Screening" | "Ownership";
  description: string;
  severity: StepperFlagSeverity;
  /** Short factual statement of what the case shows. */
  evidence: string;
  /** Stepper upload id when the flag points at a specific document. */
  sourceDocId?: string;
  /** Related-party name when the flag points at a specific party (investor entity is "Investor entity"). */
  relatedParty?: string;
  recommendedAction: string;
  /** Stable structured pointer for rules that target a specific requirement
   *  slot — e.g. R-DOC-003 carries the missing requirement key + party.
   *  Drives weight overrides without depending on description-substring
   *  heuristics. */
  requirementKey?: string;
  party?: string;
}

export type StepperScreeningStatus =
  | "Ready for screening"
  | "Screening in progress"
  | "Screening completed"
  | "Screening failed";

export interface StepperScreeningHit {
  id: string;
  caption: string;
  score: number;
  topics: string[];
  countries: string[];
  datasets: string[];
  birthDate?: string;
  sourceUrl?: string;
}

export interface StepperNameToScreen {
  /** Stable id — either the `RelatedParty.id` for owners/directors or `"investor"` for the investing party itself. */
  id: string;
  name: string;
  partyType: "Individual" | "Entity";
  role: string;
  country?: string;
  screeningStatus: StepperScreeningStatus;
  matches?: StepperScreeningHit[];
  provider?: string;
  screenedAt?: string;
  error?: string;
}

export type StepperRfiStatus = "draft" | "sent" | "responded" | "resolved";

export interface StepperRfi {
  id: string;
  text: string;
  status: StepperRfiStatus;
  selected: boolean;
  sentAt?: string;
  respondedAt?: string;
  resolvedAt?: string;
  investorResponseText?: string;
  resolutionNote?: string;
}

export interface StepperComplianceState {
  caseId: string;
  suggestedOutcome: StepperOutcome;
  riskScore: number;
  riskBand: StepperRiskBand;
  redFlags: StepperRedFlag[];
  namesToScreen: StepperNameToScreen[];
  furtherInfoRequests: StepperRfi[];
  reasoning: string[];
  computedAt: string;
}

export function emptyStepperComplianceState(caseId: string): StepperComplianceState {
  return {
    caseId,
    suggestedOutcome: "PENDING",
    riskScore: 0,
    riskBand: "Low",
    redFlags: [],
    namesToScreen: [],
    furtherInfoRequests: [],
    reasoning: [],
    computedAt: new Date().toISOString(),
  };
}
