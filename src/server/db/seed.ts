import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./client";
import { cases, auditEvents } from "./schema";
import { buildNewCorporateCase, buildReturningLPCase } from "@/lib/onboarding/demoCases";
import { caseToRecord, type CaseKey } from "./mappers";

async function upsertSeed(key: CaseKey, c: ReturnType<typeof buildNewCorporateCase>) {
  const { row, audit } = caseToRecord(key, c);

  await db
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
    });

  await db.delete(auditEvents).where(sql`${auditEvents.caseId} = ${row.id}`);
  if (audit.length > 0) {
    await db.insert(auditEvents).values(audit);
  }
}

async function main() {
  console.log("Seeding demo cases...");
  await upsertSeed("new-corporate", buildNewCorporateCase());
  await upsertSeed("returning-lp", buildReturningLPCase());
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
