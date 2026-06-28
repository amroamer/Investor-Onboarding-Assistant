import type { OnboardingCase, AuditEvent } from "@/lib/onboarding/types";
import type { CaseRow, AuditEventRow } from "./schema";

export type CaseKey = "new-corporate" | "returning-lp";

export interface CaseRecord {
  row: Omit<CaseRow, "createdAt" | "updatedAt">;
  audit: AuditEventRow[];
}

export function caseToRecord(key: CaseKey, c: OnboardingCase): CaseRecord {
  const { complianceOnly, audit, ...rest } = c;
  const {
    caseId,
    investorName,
    primaryContact,
    currentStage,
    progressPct,
    submittedAt,
    lastSavedAt,
    ...data
  } = rest;

  return {
    row: {
      id: caseId,
      key,
      investorName,
      primaryContact,
      currentStage,
      progressPct,
      submittedAt: submittedAt ?? null,
      lastSavedAt,
      data,
      complianceOnly,
    },
    audit: audit.map((e) => ({
      id: `${caseId}:${e.id}`,
      caseId,
      at: e.at,
      actor: e.actor,
      type: e.type,
      detail: e.detail,
    })),
  };
}

function stripCasePrefix(id: string, caseId: string): string {
  const prefix = `${caseId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

export function recordToCase(row: CaseRow, audit: AuditEventRow[]): OnboardingCase {
  const data = row.data as Omit<OnboardingCase, "caseId" | "investorName" | "primaryContact" | "currentStage" | "progressPct" | "submittedAt" | "lastSavedAt" | "complianceOnly" | "audit">;
  return {
    ...data,
    caseId: row.id,
    investorName: row.investorName,
    primaryContact: row.primaryContact,
    currentStage: row.currentStage as OnboardingCase["currentStage"],
    progressPct: row.progressPct,
    submittedAt: row.submittedAt ?? undefined,
    lastSavedAt: row.lastSavedAt,
    complianceOnly: row.complianceOnly as OnboardingCase["complianceOnly"],
    audit: audit.map<AuditEvent>((e) => ({
      id: stripCasePrefix(e.id, row.id),
      at: e.at,
      actor: e.actor as AuditEvent["actor"],
      type: e.type,
      detail: e.detail,
    })),
  };
}
