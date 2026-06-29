import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import { stepperCases, stepperAudit } from "../db/schema";
import type { StepperCaseRow, StepperAuditRow } from "../db/schema";
import {
  buildEmptyStepperCase,
  computeProgressPct,
  sanitiseLegalForm,
  type StepperCase,
  type StepperAuditEvent,
  type StepKey,
  type ProfileData,
  type Declarations,
  type SourceOfWealth,
  type SourceOfFunds,
  type StepperLegalForm,
} from "@/lib/stepper/types";
import { flatRequirements } from "@/lib/stepper/requirements";

const t = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

function rowToCase(row: StepperCaseRow, audit: StepperAuditRow[]): StepperCase {
  const data = row.data as Omit<StepperCase, "caseId" | "lastSavedAt" | "submittedAt" | "createdAt" | "audit">;
  // Legacy cases may have legalForm strings like "LLC" or "Foundation" that no
  // longer exist in the 5-form taxonomy — sanitise on read so the rest of the
  // app sees a valid value. `sanitiseLegalForm` always returns a valid
  // `StepperLegalForm` when input is non-empty, defaulting unknown strings to
  // "Regulated or Listed Entity"; the fallback to the raw string only matters
  // when input is empty (in which case we leave the profile untouched).
  const rawLegalForm = data.profile?.legalForm as string | undefined;
  const sanitisedForm: StepperLegalForm | undefined = rawLegalForm
    ? sanitiseLegalForm(rawLegalForm)
    : undefined;
  const sanitisedProfile =
    data.profile && sanitisedForm
      ? { ...data.profile, legalForm: sanitisedForm }
      : data.profile;
  // Track when the persisted form actually had to be remapped — drives the
  // legacy-form chip on the compliance hero. Two sources of mismatch matter:
  //   1. the stored form was a deprecated value (e.g. "LLC")
  //   2. the stored form was unknown to the validator and got coerced
  const legacyLegalForm =
    rawLegalForm && sanitisedForm && rawLegalForm !== sanitisedForm
      ? rawLegalForm
      : undefined;
  return {
    ...data,
    profile: sanitisedProfile,
    // Backfill fields added after early cases were persisted.
    crossDocFlags: (data as { crossDocFlags?: StepperCase["crossDocFlags"] }).crossDocFlags ?? [],
    caseId: row.id,
    submittedAt: row.submittedAt ?? undefined,
    lastSavedAt: row.lastSavedAt,
    createdAt: row.createdAt,
    audit: audit.map((a) => ({
      id: a.id,
      at: a.at,
      actor: a.actor as StepperAuditEvent["actor"],
      type: a.type,
      detail: a.detail,
    })),
    legacyLegalForm,
  };
}

function caseToRow(c: StepperCase): {
  row: Omit<StepperCaseRow, "createdAt" | "updatedAt">;
  audit: StepperAuditRow[];
} {
  const { caseId, lastSavedAt, submittedAt, audit, createdAt: _createdAt, ...rest } = c;
  return {
    row: {
      id: caseId,
      investorName: rest.profile?.investorName ?? "",
      primaryContact: rest.profile?.primaryContact ?? "",
      primaryContactEmail: rest.profile?.primaryContactEmail ?? "",
      legalForm: rest.profile?.legalForm ?? null,
      jurisdiction: rest.profile?.jurisdiction ?? "",
      currentStep: rest.currentStep,
      data: rest,
      // resumeToken is managed by the dedicated requestResumeLink server fn,
      // not by the persistence layer — preserve whatever the DB already has.
      resumeToken: null,
      submittedAt: submittedAt ?? null,
      lastSavedAt,
    },
    audit: audit.map((a) => ({
      id: `${caseId}:${a.id}`,
      caseId,
      at: a.at,
      actor: a.actor,
      type: a.type,
      detail: a.detail,
    })),
  };
}

export async function persistCase(c: StepperCase): Promise<StepperCase> {
  const { row, audit } = caseToRow(c);
  const [inserted] = await db
    .insert(stepperCases)
    .values(row)
    .onConflictDoUpdate({
      target: stepperCases.id,
      set: {
        investorName: row.investorName,
        primaryContact: row.primaryContact,
        primaryContactEmail: row.primaryContactEmail,
        legalForm: row.legalForm,
        jurisdiction: row.jurisdiction,
        currentStep: row.currentStep,
        data: row.data,
        submittedAt: row.submittedAt,
        lastSavedAt: row.lastSavedAt,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  await db.delete(stepperAudit).where(eq(stepperAudit.caseId, row.id));
  if (audit.length > 0) await db.insert(stepperAudit).values(audit);

  return rowToCase(inserted, audit);
}

export async function loadCase(caseId: string): Promise<StepperCase> {
  const rows = await db.select().from(stepperCases).where(eq(stepperCases.id, caseId));
  if (rows.length === 0) throw new Error(`Stepper case ${caseId} not found`);
  const auditRows = await db
    .select()
    .from(stepperAudit)
    .where(eq(stepperAudit.caseId, caseId));
  return rowToCase(rows[0], auditRows);
}

function appendAudit(c: StepperCase, type: string, detail: string, actor: StepperAuditEvent["actor"] = "Investor"): StepperCase {
  return {
    ...c,
    audit: [...c.audit, { id: id("au"), at: t(), actor, type, detail }],
    lastSavedAt: t(),
  };
}

/* ─── Server fns ───────────────────────────────────────────────────────── */

export const createStepperCase = createServerFn({ method: "POST" }).handler(
  async (): Promise<StepperCase> => {
    const caseId = `STP-${new Date().getFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const seed = buildEmptyStepperCase(caseId);
    return await persistCase(seed);
  },
);

export const getStepperCase = createServerFn({ method: "GET" })
  .validator((d: { caseId: string }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    return await loadCase(data.caseId);
  });

/**
 * Generate (or return) a short-lived resume token for the case and the URL the
 * investor can use to come back later. The email is logged on the server in
 * dev — production hosts wire `RESUME_EMAIL_PROVIDER` to deliver it.
 */
export const requestResumeLink = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; email: string }) => d)
  .handler(async ({ data }): Promise<{ url: string; email: string }> => {
    if (!data.email.trim() || !/^\S+@\S+\.\S+$/.test(data.email)) {
      throw new Error("A valid email is required to send the resume link");
    }
    const rows = await db.select().from(stepperCases).where(eq(stepperCases.id, data.caseId));
    if (rows.length === 0) throw new Error(`Stepper case ${data.caseId} not found`);
    let token = rows[0].resumeToken;
    if (!token) {
      token = `rt_${randomUUID().replace(/-/g, "")}`;
      await db.update(stepperCases).set({ resumeToken: token }).where(eq(stepperCases.id, data.caseId));
    }
    const base = process.env.PUBLIC_BASE_URL ?? "/InvestorAssistant";
    const url = `${base}/v2/onboarding?resume=${encodeURIComponent(token)}`;
    if (process.env.RESUME_EMAIL_PROVIDER === "console" || !process.env.RESUME_EMAIL_PROVIDER) {
      console.log(`[resume-link] To: ${data.email}  URL: ${url}`);
    }
    return { url, email: data.email };
  });

export const getStepperCaseByResumeToken = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    const rows = await db.select().from(stepperCases).where(eq(stepperCases.resumeToken, data.token));
    if (rows.length === 0) throw new Error("Resume token not recognised");
    return await loadCase(rows[0].id);
  });

export const listStepperCases = createServerFn({ method: "GET" }).handler(
  async (): Promise<StepperCase[]> => {
    const rows = await db.select().from(stepperCases);
    const auditRows = await db.select().from(stepperAudit);
    return rows.map((r) => rowToCase(r, auditRows.filter((a) => a.caseId === r.id)));
  },
);

export const resetStepperCase = createServerFn({ method: "POST" })
  .validator((d: { caseId: string }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    const seed = buildEmptyStepperCase(data.caseId);
    return await persistCase(seed);
  });

export const deleteStepperCase = createServerFn({ method: "POST" })
  .validator((d: { caseId: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db.delete(stepperCases).where(eq(stepperCases.id, data.caseId));
    return { ok: true };
  });

/* ─── Step save fns ────────────────────────────────────────────────────── */

export const saveProfile = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; profile: ProfileData }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    let c = await loadCase(data.caseId);
    const p = data.profile;
    if (!p.investorName.trim()) throw new Error("Investor name is required");
    if (!p.primaryContactEmail.trim()) throw new Error("Email is required");
    if (!/^\S+@\S+\.\S+$/.test(p.primaryContactEmail)) throw new Error("Email is not valid");
    // Default primaryContact to investorName when not provided — for individuals this is the
    // same person; for entities the user adds a separate contact on the Ownership step.
    const normalized = {
      ...p,
      primaryContact: p.primaryContact?.trim() || p.investorName.trim(),
      jurisdiction: p.jurisdiction?.trim() ?? "",
    };

    c = {
      ...c,
      profile: normalized,
      steps: {
        ...c.steps,
        profile: { key: "profile", status: "complete", data: {}, completedAt: t() },
        documents: c.steps.documents.status === "locked" ? { ...c.steps.documents, status: "in_progress" } : c.steps.documents,
      },
      currentStep: c.currentStep === "profile" ? "documents" : c.currentStep,
    };
    c = appendAudit(c, "Profile saved", `Investor: ${p.investorName} — ${p.legalForm}`);
    return await persistCase(c);
  });

export const completeDocumentsStep = createServerFn({ method: "POST" })
  .validator((d: { caseId: string }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    let c = await loadCase(data.caseId);
    if (!c.profile) throw new Error("Profile must be completed first");
    const required = flatRequirements(c.profile.legalForm).map((r) => r.key);
    const satisfied = new Set(c.checklist.map((i) => i.requirementKey));
    const missing = required.filter((k) => !satisfied.has(k));
    if (missing.length > 0) {
      // Don't mark complete — surface as attention.
      c = {
        ...c,
        steps: {
          ...c.steps,
          documents: { ...c.steps.documents, status: "attention", data: { missing } },
        },
      };
      return await persistCase(c);
    }

    const hasAttention = c.checklist.some((i) => i.status === "attention");
    c = {
      ...c,
      steps: {
        ...c.steps,
        documents: {
          ...c.steps.documents,
          status: hasAttention ? "attention" : "complete",
          completedAt: hasAttention ? undefined : t(),
        },
        ownership: c.steps.ownership.status === "locked" ? { ...c.steps.ownership, status: "in_progress" } : c.steps.ownership,
      },
      currentStep: c.currentStep === "documents" ? "ownership" : c.currentStep,
    };
    c = appendAudit(c, "Documents step completed", `All ${required.length} required items satisfied`);
    return await persistCase(c);
  });

export const saveOwnership = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; relatedParties: StepperCase["relatedParties"] }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    let c = await loadCase(data.caseId);
    c = {
      ...c,
      relatedParties: data.relatedParties,
      steps: {
        ...c.steps,
        ownership: { ...c.steps.ownership, status: "complete", data: { count: data.relatedParties.length }, completedAt: t() },
        "sow-sof": c.steps["sow-sof"].status === "locked" ? { ...c.steps["sow-sof"], status: "in_progress" } : c.steps["sow-sof"],
      },
      currentStep: c.currentStep === "ownership" ? "sow-sof" : c.currentStep,
    };
    c = appendAudit(c, "Ownership saved", `${data.relatedParties.length} related parties`);
    return await persistCase(c);
  });

export const saveSowSof = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; sourceOfWealth: SourceOfWealth; sourceOfFunds: SourceOfFunds }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    let c = await loadCase(data.caseId);
    if (!data.sourceOfWealth.category.trim()) throw new Error("Source of Wealth category is required");
    if (!data.sourceOfWealth.detail.trim()) throw new Error("Source of Wealth narrative is required");
    if (!data.sourceOfFunds.category.trim()) throw new Error("Source of Funds category is required");
    if (!data.sourceOfFunds.detail.trim()) throw new Error("Source of Funds narrative is required");

    c = {
      ...c,
      sourceOfWealth: data.sourceOfWealth,
      sourceOfFunds: data.sourceOfFunds,
      steps: {
        ...c.steps,
        "sow-sof": { ...c.steps["sow-sof"], status: "complete", data: {}, completedAt: t() },
        declarations: c.steps.declarations.status === "locked" ? { ...c.steps.declarations, status: "in_progress" } : c.steps.declarations,
      },
      currentStep: c.currentStep === "sow-sof" ? "declarations" : c.currentStep,
    };
    c = appendAudit(c, "Source of Wealth and Source of Funds saved", `SoW: ${data.sourceOfWealth.category}; SoF: ${data.sourceOfFunds.category}`);
    return await persistCase(c);
  });

export const saveDeclarations = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; declarations: Declarations }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    let c = await loadCase(data.caseId);
    const dec = data.declarations;
    if (!dec.taxResidencyCountry?.trim()) throw new Error("Tax residency country is required");
    if (typeof dec.isUsPerson !== "boolean") throw new Error("Please indicate if you are a US person");
    if (dec.isUsPerson && !dec.usTin?.trim()) throw new Error("US TIN is required for US persons");
    if (typeof dec.pepSelf !== "boolean") throw new Error("PEP self-declaration is required");
    if (typeof dec.pepFamily !== "boolean") throw new Error("PEP family declaration is required");
    if (typeof dec.pepAssociate !== "boolean") throw new Error("PEP associate declaration is required");
    if (c.profile && c.profile.legalForm !== "Individual") {
      if (!dec.fatcaSection?.trim()) throw new Error("FATCA / CRS classification is required for entity investors");
      if (!dec.fatcaTin?.trim()) throw new Error("FATCA / CRS Tax Identification Number is required for entity investors");
    }
    if (!dec.attestationsAccepted) throw new Error("You must accept the attestations to continue");

    c = {
      ...c,
      declarations: dec,
      steps: {
        ...c.steps,
        declarations: { ...c.steps.declarations, status: "complete", data: {}, completedAt: t() },
        review: c.steps.review.status === "locked" ? { ...c.steps.review, status: "in_progress" } : c.steps.review,
      },
      currentStep: c.currentStep === "declarations" ? "review" : c.currentStep,
    };
    c = appendAudit(
      c,
      "Declarations saved",
      `Tax residency: ${dec.taxResidencyCountry}; PEP: ${dec.pepSelf || dec.pepFamily || dec.pepAssociate ? "Yes" : "No"}`,
    );
    return await persistCase(c);
  });

export const submitCase = createServerFn({ method: "POST" })
  .validator((d: { caseId: string }) => d)
  .handler(async ({ data }): Promise<StepperCase> => {
    let c = await loadCase(data.caseId);
    if (!c.profile) throw new Error("Profile not complete");
    if (c.steps.review.status === "locked") throw new Error("Review step is not yet reachable");
    const PASSABLE_FOR_SUBMIT = new Set(["complete", "attention"]);
    const incompleteSteps = (Object.keys(c.steps) as StepKey[]).filter(
      (k) => k !== "review" && k !== "submitted" && !PASSABLE_FOR_SUBMIT.has(c.steps[k].status),
    );
    if (incompleteSteps.length > 0) {
      throw new Error(`Cannot submit — incomplete steps: ${incompleteSteps.join(", ")}`);
    }

    const submittedAt = t();
    c = {
      ...c,
      finalConfirmation: true,
      submittedAt,
      currentStep: "submitted",
      steps: {
        ...c.steps,
        review: { ...c.steps.review, status: "complete", completedAt: submittedAt },
        submitted: { ...c.steps.submitted, status: "complete", completedAt: submittedAt },
      },
    };
    c = appendAudit(c, "Case submitted to Compliance", `Submitted at ${submittedAt}`, "System");
    c = appendAudit(c, "Compliance state initialised", "Initial risk score + red flags derived from submission.", "System");
    const persisted = await persistCase(c);
    // Compute and persist the initial compliance snapshot. Imported lazily to
    // avoid pulling the compliance module into every consumer of cases.ts.
    const { initialiseComplianceForCase } = await import("./compliance");
    await initialiseComplianceForCase(persisted);
    return persisted;
  });

export function progressPct(c: StepperCase): number {
  return computeProgressPct(c);
}

export type { StepperLegalForm };
