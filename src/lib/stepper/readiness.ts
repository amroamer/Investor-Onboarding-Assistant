/**
 * Case readiness — pure derivation from a StepperCase + the agent's derived
 * facts. Powers the right-side intelligence panel, the Review readiness hero
 * and the Submitted receipt.
 *
 * Nothing here writes to the case; everything is recomputed on render.
 */

import type { StepperCase } from "./types";
import { flatRequirements } from "./requirements";
import { deriveFactsFromUploads, summariseSources, type PrefillValue } from "./derive";

export interface CaseReadiness {
  /** Per-step booleans — true when that step is complete. */
  profileComplete: boolean;
  documentsComplete: boolean;
  ownershipComplete: boolean;
  sourceOfWealthComplete: boolean;
  sourceOfFundsComplete: boolean;
  declarationsComplete: boolean;

  /** Documents: required, received and confidence breakdown. */
  documentsRequired: number;
  documentsReceived: number;
  documentsValidated: number;
  highConfidenceDocs: number;
  mediumConfidenceDocs: number;

  /** Agent facts. */
  extractedFacts: number;
  verifiedFacts: number;
  overriddenFacts: number;
  needsReviewItems: number;
  blockingIssues: number;

  /** Sources the agent has used so far. */
  sourceDocCount: number;

  /** 0–100. Excludes the receipt step. */
  readinessPercentage: number;
}

const HEAVY_STEPS = [
  "profile",
  "documents",
  "ownership",
  "sow-sof",
  "declarations",
  "review",
] as const;

export function computeReadiness(c: StepperCase): CaseReadiness {
  const facts = deriveFactsFromUploads(c);

  // ─── Documents ─────────────────────────────────────────────────────────
  const requirements = c.profile ? flatRequirements(c.profile.legalForm) : [];
  const documentsRequired = requirements.length;
  const checklistByReq = new Map(c.checklist.map((ci) => [ci.requirementKey, ci]));
  const documentsReceived = requirements.filter((r) => checklistByReq.has(r.key)).length;
  const documentsValidated = requirements.filter((r) => {
    const item = checklistByReq.get(r.key);
    return item && item.status !== "attention";
  }).length;

  const readyDocs = c.uploadedDocuments.filter((d) => d.processingPhase === "ready");
  const highConfidenceDocs = readyDocs.filter((d) => d.classificationConfidence === "high").length;
  const mediumConfidenceDocs = readyDocs.filter(
    (d) => d.classificationConfidence === "medium" || d.classificationConfidence === "low",
  ).length;

  const attentionItems = c.checklist.filter((ci) => ci.status === "attention").length;
  const blockingIssues = attentionItems + c.crossDocFlags.length;

  // ─── Agent facts ───────────────────────────────────────────────────────
  const checks: Array<{ source?: PrefillValue<unknown>; current: unknown }> = [
    { source: facts.identity.name, current: c.relatedParties[0]?.name },
    { source: facts.identity.nationality, current: c.relatedParties[0]?.nationality },
    { source: facts.sow.category, current: c.sourceOfWealth?.category },
    { source: facts.sow.detail, current: c.sourceOfWealth?.detail },
    { source: facts.sof.category, current: c.sourceOfFunds?.category },
    { source: facts.sof.detail, current: c.sourceOfFunds?.detail },
    { source: facts.declarations.taxResidencyCountry, current: c.declarations.taxResidencyCountry },
    { source: facts.declarations.isUsPerson, current: c.declarations.isUsPerson },
    { source: facts.declarations.pepSelf, current: c.declarations.pepSelf },
    { source: facts.declarations.pepFamily, current: c.declarations.pepFamily },
    { source: facts.declarations.pepAssociate, current: c.declarations.pepAssociate },
    { source: facts.declarations.fatcaSection, current: c.declarations.fatcaSection },
  ];

  let extractedFacts = 0;
  let verifiedFacts = 0;
  let overriddenFacts = 0;
  for (const { source, current } of checks) {
    if (!source) continue;
    extractedFacts++;
    if (source.value === current) verifiedFacts++;
    else if (current !== undefined && current !== "") overriddenFacts++;
  }

  const sourceDocCount = summariseSources(facts).length;

  // ─── Step booleans ────────────────────────────────────────────────────
  const profileComplete = c.steps.profile.status === "complete";
  const documentsComplete =
    c.steps.documents.status === "complete" ||
    (documentsRequired > 0 && documentsReceived === documentsRequired);
  const ownershipComplete = c.steps.ownership.status === "complete";
  const sowsofComplete = c.steps["sow-sof"].status === "complete";
  const sourceOfWealthComplete = sowsofComplete || !!c.sourceOfWealth?.detail;
  const sourceOfFundsComplete = sowsofComplete || !!c.sourceOfFunds?.detail;
  const declarationsComplete = c.steps.declarations.status === "complete";

  // ─── % readiness ───────────────────────────────────────────────────────
  let done = 0;
  for (const k of HEAVY_STEPS) {
    if (c.steps[k].status === "complete") done++;
  }
  const readinessPercentage = Math.round((done / HEAVY_STEPS.length) * 100);

  const needsReviewItems = mediumConfidenceDocs + (extractedFacts > 0 ? overriddenFacts : 0);

  return {
    profileComplete,
    documentsComplete,
    ownershipComplete,
    sourceOfWealthComplete,
    sourceOfFundsComplete,
    declarationsComplete,
    documentsRequired,
    documentsReceived,
    documentsValidated,
    highConfidenceDocs,
    mediumConfidenceDocs,
    extractedFacts,
    verifiedFacts,
    overriddenFacts,
    needsReviewItems,
    blockingIssues,
    sourceDocCount,
    readinessPercentage,
  };
}
