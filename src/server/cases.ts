import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { cases, auditEvents } from "./db/schema";
import { caseToRecord, recordToCase, type CaseKey } from "./db/mappers";
import { buildNewCorporateCase, buildReturningLPCase } from "@/lib/onboarding/demoCases";
import { withRecomputedRisk } from "@/lib/onboarding/engine";
import type { OnboardingCase } from "@/lib/onboarding/types";

export async function persistCase(key: CaseKey, c: OnboardingCase): Promise<OnboardingCase> {
  c = withRecomputedRisk(c);
  const { row, audit } = caseToRecord(key, c);

  const [inserted] = await db
    .insert(cases)
    .values(row)
    .onConflictDoUpdate({
      target: cases.key,
      set: {
        investorName: row.investorName,
        primaryContact: row.primaryContact,
        currentStage: row.currentStage,
        progressPct: row.progressPct,
        data: row.data,
        complianceOnly: row.complianceOnly,
        submittedAt: row.submittedAt,
        lastSavedAt: row.lastSavedAt,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  await db.delete(auditEvents).where(eq(auditEvents.caseId, row.id));
  if (audit.length > 0) {
    await db.insert(auditEvents).values(audit);
  }

  return recordToCase(inserted, audit);
}

function buildSeed(key: CaseKey): OnboardingCase {
  // Empty shells — the frontend's first `session_start` agent event hydrates the welcome.
  return key === "new-corporate" ? buildNewCorporateCase() : buildReturningLPCase();
}

export async function loadCaseByCaseId(
  caseId: string,
): Promise<{ key: CaseKey; case: OnboardingCase }> {
  const rows = await db.select().from(cases).where(eq(cases.id, caseId));
  if (rows.length === 0) throw new Error(`Case ${caseId} not found`);
  const row = rows[0];
  const events = await db.select().from(auditEvents).where(eq(auditEvents.caseId, caseId));
  return { key: row.key as CaseKey, case: recordToCase(row, events) };
}

export const listCases = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await db.select().from(cases);
  const events = await db.select().from(auditEvents);

  const out: Partial<Record<CaseKey, OnboardingCase>> = {};
  for (const row of rows) {
    const a = events.filter((e) => e.caseId === row.id);
    out[row.key as CaseKey] = recordToCase(row, a);
  }

  if (!out["new-corporate"]) {
    out["new-corporate"] = await persistCase("new-corporate", buildSeed("new-corporate"));
  }
  if (!out["returning-lp"]) {
    out["returning-lp"] = await persistCase("returning-lp", buildSeed("returning-lp"));
  }

  return out as Record<CaseKey, OnboardingCase>;
});

export const upsertCase = createServerFn({ method: "POST" })
  .validator((d: { key: CaseKey; case: OnboardingCase }) => d)
  .handler(async ({ data }) => {
    return await persistCase(data.key, data.case);
  });

export const resetCase = createServerFn({ method: "POST" })
  .validator((d: { key: CaseKey }) => d)
  .handler(async ({ data }) => {
    return await persistCase(data.key, buildSeed(data.key));
  });

export const resetAllCases = createServerFn({ method: "POST" }).handler(async () => {
  const nc = await persistCase("new-corporate", buildSeed("new-corporate"));
  const rl = await persistCase("returning-lp", buildSeed("returning-lp"));
  return { "new-corporate": nc, "returning-lp": rl } as Record<CaseKey, OnboardingCase>;
});
