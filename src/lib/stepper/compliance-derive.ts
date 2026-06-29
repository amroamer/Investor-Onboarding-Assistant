/**
 * Pure derivation of compliance state from a StepperCase.
 *
 * Called from:
 *   - `submitCase` (initial snapshot at submission time)
 *   - `runStepperScreening` and the RFI server fns (recompute on change)
 *
 * Everything in here is deterministic and dependency-free so it can be
 * unit-tested without a database or HTTP. The OpenSanctions call sits in
 * the server fn — by the time we get here, screening matches are already
 * on `case.screening`.
 */

import type { StepperCase, StepperLegalForm, ChecklistItem } from "./types";
import { requirementsFor } from "./requirements";
import {
  type StepperComplianceState,
  type StepperRedFlag,
  type StepperFlagSeverity,
  type StepperOutcome,
  type StepperRiskBand,
  type StepperNameToScreen,
} from "./compliance";

/**
 * FATF high-risk + monitored jurisdictions (subset, illustrative). Match is
 * case-insensitive against `profile.jurisdiction`. Real deployments would
 * read this from a maintained list, but for the demo a hardcoded set is
 * enough to surface the rule end-to-end.
 */
const HIGH_RISK_JURISDICTIONS = new Set([
  "north korea",
  "iran",
  "myanmar",
  "syria",
  "russia",
  "belarus",
  "yemen",
  "south sudan",
  "somalia",
  "afghanistan",
  "cuba",
  "venezuela",
]);

const WEIGHTS = {
  "R-DOC-001": 10,
  "R-DOC-002": 8,
  "R-DOC-003": 4,
  "R-PEP-001": 15,
  "R-TAX-002": 20,
  "R-JUR-001": 25,
  "R-SCR-001": 50,
  "R-SCR-002": 25,
} as const;

type RuleKey = keyof typeof WEIGHTS;

/**
 * Per-form weight overrides. Default weights are calibrated for an Individual
 * case; entity forms need different emphasis (e.g. a Regulated/Listed Entity
 * without audited financials is material, not a minor R-DOC-003 instance).
 *
 * Override map is `(legalForm → (requirementKey → weight))`. Only applies to
 * R-DOC-003 (missing required document) — other rules are form-invariant.
 */
const PER_FORM_DOC_WEIGHT_OVERRIDES: Partial<
  Record<StepperLegalForm, Partial<Record<string, number>>>
> = {
  "Regulated or Listed Entity": {
    evidence_of_regulated_status: 12,
    audited_financial_statements: 10,
  },
  Trust: {
    trust_deed: 10,
    schedule_of_trust_parties: 10,
  },
  "Limited Partnership": {
    certificate_of_limited_partnership: 10,
    limited_partnership_agreement: 10,
  },
  "Corporation or Private Trust Corporation": {
    certificate_of_incorporation: 10,
    register_of_shareholders: 8,
  },
};

/** Severity override for R-DOC-003 when the requirement key is "core" for the form. */
const PER_FORM_DOC_SEVERITY_OVERRIDES: Partial<
  Record<StepperLegalForm, Partial<Record<string, StepperFlagSeverity>>>
> = {
  "Regulated or Listed Entity": {
    evidence_of_regulated_status: "Medium",
    audited_financial_statements: "Medium",
  },
  Trust: {
    trust_deed: "Medium",
    schedule_of_trust_parties: "Medium",
  },
  "Limited Partnership": {
    certificate_of_limited_partnership: "Medium",
    limited_partnership_agreement: "Medium",
  },
  "Corporation or Private Trust Corporation": {
    certificate_of_incorporation: "Medium",
  },
};

function docWeightOverride(
  form: StepperLegalForm,
  requirementKey: string,
): number | undefined {
  return PER_FORM_DOC_WEIGHT_OVERRIDES[form]?.[requirementKey];
}

function docSeverityOverride(
  form: StepperLegalForm,
  requirementKey: string,
): StepperFlagSeverity | undefined {
  return PER_FORM_DOC_SEVERITY_OVERRIDES[form]?.[requirementKey];
}

/**
 * Builds a per-derivation id allocator. Kept local to each `deriveComplianceState`
 * call so two concurrent derivations (parallel server fns, runtime scheduler
 * interleaving) can't collide on flag ids — a module-level `let` would let
 * call A and call B share a counter and emit duplicate ids under load.
 */
function makeFlagIdAllocator(): (rule: RuleKey) => string {
  let n = 0;
  return (rule) => {
    n += 1;
    return `${rule.toLowerCase()}-${n}`;
  };
}

function bandFromScore(score: number): StepperRiskBand {
  if (score > 60) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

/** Sanctions hits are a hard floor — they always land at High band regardless of score. */
function bandWithFloor(score: number, flags: StepperRedFlag[]): StepperRiskBand {
  if (flags.some((f) => f.rule === "R-SCR-001")) return "High";
  return bandFromScore(score);
}

function outcome(flags: StepperRedFlag[], band: StepperRiskBand): StepperOutcome {
  if (flags.some((f) => f.rule === "R-SCR-001")) return "FAIL";
  if (band === "High") return "PENDING";
  return "PASS";
}

/**
 * Build the list of names that should be screened against OpenSanctions.
 * The investor entity gets the synthetic id `"investor"`. Related parties
 * keep their original `RelatedParty.id` so the compliance UI can link a hit
 * back into ownership.
 *
 * Preserves any existing screening result by id-match so a re-derive doesn't
 * silently wipe screening progress.
 */
export function buildNamesToScreen(
  c: StepperCase,
  previous: StepperNameToScreen[] = [],
): StepperNameToScreen[] {
  const prevById = new Map(previous.map((n) => [n.id, n]));
  const out: StepperNameToScreen[] = [];

  if (c.profile?.investorName) {
    const id = "investor";
    const prior = prevById.get(id);
    out.push({
      id,
      name: c.profile.investorName,
      partyType: c.profile.legalForm === "Individual" ? "Individual" : "Entity",
      role: "Investor",
      country: c.profile.jurisdiction || undefined,
      screeningStatus: prior?.screeningStatus ?? "Ready for screening",
      matches: prior?.matches,
      provider: prior?.provider,
      screenedAt: prior?.screenedAt,
      error: prior?.error,
    });
  }

  for (const p of c.relatedParties) {
    const prior = prevById.get(p.id);
    out.push({
      id: p.id,
      name: p.name,
      partyType: p.partyType,
      role: p.role,
      country: p.nationality,
      screeningStatus: prior?.screeningStatus ?? "Ready for screening",
      matches: prior?.matches,
      provider: prior?.provider,
      screenedAt: prior?.screenedAt,
      error: prior?.error,
    });
  }

  return out;
}

function deriveRedFlags(
  c: StepperCase,
  names: StepperNameToScreen[],
  flagId: (rule: RuleKey) => string,
): {
  flags: StepperRedFlag[];
  reasoning: string[];
} {
  const flags: StepperRedFlag[] = [];
  const reasoning: string[] = [];

  // R-DOC-001 — cross-doc name mismatch already computed by the validator.
  for (const x of c.crossDocFlags) {
    if (x.kind === "name_mismatch") {
      flags.push({
        id: flagId("R-DOC-001"),
        rule: "R-DOC-001",
        category: "Documents",
        description: "Name mismatch across documents",
        severity: "Medium",
        evidence: x.detail,
        recommendedAction:
          "Reconcile the differing names — request a deed-poll, marriage certificate or explanation letter.",
      });
      reasoning.push(`Cross-document name mismatch: ${x.detail}`);
    }
  }

  // R-DOC-002 — checklist items the validator flagged as "attention".
  for (const item of c.checklist) {
    if (item.status === "attention") {
      flags.push({
        id: flagId("R-DOC-002"),
        rule: "R-DOC-002",
        category: "Documents",
        description: `Document flagged for attention: ${item.name}`,
        severity: "Medium",
        evidence: item.issue ?? "Validator returned an attention status with no explicit issue.",
        sourceDocId: item.sourceDocId,
        recommendedAction:
          item.remedy ?? "Request a replacement document that resolves the validator's concern.",
      });
      reasoning.push(`Checklist attention: ${item.name} — ${item.issue ?? "no detail"}`);
    }
  }

  // R-DOC-003 — required document missing. Match on requirementKey
  // only: the validator stamps `party` with the investor's actual name
  // (e.g. "Jane Smith") while requirement groups use static labels
  // ("Investor (individual)"), so a pair-based join never hits and every
  // requirement gets flagged as missing even after the doc is uploaded.
  if (c.profile) {
    const form = c.profile.legalForm;
    const groups = requirementsFor(form);
    const checklistKeys = new Set(c.checklist.map((i) => i.requirementKey));
    for (const group of groups) {
      for (const item of group.items) {
        if (checklistKeys.has(item.key)) continue;
        const severity = docSeverityOverride(form, item.key) ?? "Low";
        flags.push({
          id: flagId("R-DOC-003"),
          rule: "R-DOC-003",
          category: "Documents",
          description: `Required: ${item.name} — ${group.party}`,
          severity,
          evidence: `No upload satisfies "${item.name}" for "${group.party}" under ${form}.`,
          recommendedAction:
            severity === "Medium"
              ? `Request the ${item.name.toLowerCase()} for ${group.party} before approval.`
              : "Send the investor a request for the missing document.",
          requirementKey: item.key,
          party: group.party,
        });
        reasoning.push(`Missing ${item.name} for ${group.party}`);
      }
    }
  }

  // R-PEP-001 — investor self-declared as PEP, family of PEP, or PEP associate.
  const d = c.declarations;
  if (d.pepSelf || d.pepFamily || d.pepAssociate) {
    const which = [
      d.pepSelf ? "self" : null,
      d.pepFamily ? "family member" : null,
      d.pepAssociate ? "close associate" : null,
    ].filter(Boolean).join(", ");
    flags.push({
      id: flagId("R-PEP-001"),
      rule: "R-PEP-001",
      category: "PEP",
      description: "Politically Exposed Person disclosure",
      severity: "Medium",
      evidence: `Investor declared PEP exposure (${which}).${d.pepDetail ? ` Detail: ${d.pepDetail}` : ""}`,
      relatedParty: c.profile?.investorName,
      recommendedAction:
        "Apply enhanced due diligence: capture role/position, period, and approving body.",
    });
    reasoning.push(`PEP self-declaration (${which})`);
  }

  // R-TAX-002 — entity investor missing FATCA / CRS classification or TIN.
  // The submit guard rejects this combination for new cases, but legacy
  // cases (or cases whose legalForm was remapped by `sanitiseLegalForm`)
  // can land in compliance without one or both fields. Defensive coverage.
  if (c.profile && c.profile.legalForm !== "Individual") {
    const missingSection = !d.fatcaSection?.trim();
    const missingTin = !d.fatcaTin?.trim();
    if (missingSection || missingTin) {
      const which = [
        missingSection ? "classification" : null,
        missingTin ? "tax identification number" : null,
      ]
        .filter(Boolean)
        .join(" and ");
      flags.push({
        id: flagId("R-TAX-002"),
        rule: "R-TAX-002",
        category: "Tax",
        description: `Entity FATCA / CRS ${which} missing`,
        severity: "High",
        evidence: `${c.profile.legalForm} investor submitted without ${which}.`,
        recommendedAction:
          "Request the entity's FATCA / CRS self-certification before approval.",
      });
      reasoning.push(`Entity FATCA / CRS ${which} missing`);
    }
  }

  // R-JUR-001 — high-risk jurisdiction on the investor profile.
  const j = (c.profile?.jurisdiction ?? "").toLowerCase().trim();
  if (j && HIGH_RISK_JURISDICTIONS.has(j)) {
    flags.push({
      id: flagId("R-JUR-001"),
      rule: "R-JUR-001",
      category: "Jurisdiction",
      description: `High-risk jurisdiction: ${c.profile?.jurisdiction}`,
      severity: "High",
      evidence: `Jurisdiction "${c.profile?.jurisdiction}" appears on the FATF high-risk / monitored list.`,
      recommendedAction:
        "Escalate to senior compliance: enhanced due diligence + source-of-wealth corroboration required.",
    });
    reasoning.push(`High-risk jurisdiction: ${c.profile?.jurisdiction}`);
  }

  // R-SCR-001 / R-SCR-002 — screening hits.
  for (const n of names) {
    if (n.screeningStatus !== "Screening completed" || !n.matches) continue;
    for (const m of n.matches) {
      if (m.topics.includes("sanction")) {
        flags.push({
          id: flagId("R-SCR-001"),
          rule: "R-SCR-001",
          category: "Screening",
          description: `Sanctions hit on ${n.name}`,
          severity: "High",
          evidence: `OpenSanctions match: ${m.caption} (${Math.round(m.score * 100)}% confidence). Datasets: ${m.datasets.join(", ")}.`,
          relatedParty: n.name,
          recommendedAction: "Block onboarding. Escalate immediately to MLRO.",
        });
        reasoning.push(`Sanctions hit on ${n.name} (${m.caption})`);
      }
      if (m.topics.includes("role.pep") && !(d.pepSelf || d.pepFamily || d.pepAssociate)) {
        flags.push({
          id: flagId("R-SCR-002"),
          rule: "R-SCR-002",
          category: "Screening",
          description: `Undisclosed PEP hit on ${n.name}`,
          severity: "High",
          evidence: `OpenSanctions match: ${m.caption} (${Math.round(m.score * 100)}% confidence). PEP topic.`,
          relatedParty: n.name,
          recommendedAction:
            "Confirm identity with the investor and request a corrected PEP declaration.",
        });
        reasoning.push(`Undisclosed PEP hit on ${n.name}`);
      }
    }
  }

  return { flags, reasoning };
}

function computeScore(c: StepperCase, flags: StepperRedFlag[]): number {
  const form = c.profile?.legalForm;
  let score = 0;
  for (const f of flags) {
    let w: number = WEIGHTS[f.rule as RuleKey] ?? 0;
    // For R-DOC-003 a per-form override can bump weight when the missing
    // requirement is core for that form. Lookup is keyed by the structured
    // `requirementKey` on the flag — no description-substring heuristics.
    if (f.rule === "R-DOC-003" && form && f.requirementKey) {
      const override = PER_FORM_DOC_WEIGHT_OVERRIDES[form]?.[f.requirementKey];
      if (typeof override === "number") w = Math.max(w, override);
    }
    score += w;
  }
  return Math.max(0, Math.min(100, score));
}

export interface DeriveOptions {
  /**
   * Previous compliance state — used to preserve screening results and any
   * RFI thread when re-deriving after a change. Pass `undefined` for the
   * first derivation (e.g. at submit time).
   */
  previous?: StepperComplianceState;
}

export function deriveComplianceState(
  c: StepperCase,
  opts: DeriveOptions = {},
): StepperComplianceState {
  const flagId = makeFlagIdAllocator();
  const names = buildNamesToScreen(c, opts.previous?.namesToScreen);
  const { flags, reasoning } = deriveRedFlags(c, names, flagId);
  const score = computeScore(c, flags);
  const riskBand = bandWithFloor(score, flags);
  return {
    caseId: c.caseId,
    suggestedOutcome: outcome(flags, riskBand),
    riskScore: score,
    riskBand,
    redFlags: flags,
    namesToScreen: names,
    // RFIs are managed by their own server fns — preserve them across re-derives.
    furtherInfoRequests: opts.previous?.furtherInfoRequests ?? [],
    reasoning,
    computedAt: new Date().toISOString(),
  };
}

/** Exposed for tests that want to spot-check the rule set against synthetic cases. */
export const __testing = {
  HIGH_RISK_JURISDICTIONS,
  WEIGHTS,
  PER_FORM_DOC_WEIGHT_OVERRIDES,
  PER_FORM_DOC_SEVERITY_OVERRIDES,
  bandFromScore,
  bandWithFloor,
  outcome,
};

/** Exposed for the cockpit Overview so it can show per-party "X of Y received" without recomputing. */
export function checklistByPartyAndKey(items: ChecklistItem[]): Set<string> {
  return new Set(items.map((i) => `${i.party} ${i.requirementKey}`));
}
