import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { loadCaseByCaseId, persistCase } from "./cases";
import { recomputeProgress } from "@/lib/onboarding/engine";
import {
  searchOpenSanctions as searchOpenSanctionsShared,
  schemaForPartyType,
  OPENSANCTIONS_PROVIDER,
} from "./opensanctions";
import type {
  OnboardingCase,
  NameToScreen,
  ScreeningMatch,
  AuditEvent,
} from "@/lib/onboarding/types";

const PROVIDER = OPENSANCTIONS_PROVIDER;

const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

function audit(actor: AuditEvent["actor"], type: string, detail: string): AuditEvent {
  return { id: id("au"), at: now(), actor, type, detail };
}

/**
 * Thin re-export of the shared client, kept so existing callers and tests
 * don't have to change. The legacy `ScreeningMatch` shape happens to be
 * identical to `OpenSanctionsMatch`, so the cast is a no-op.
 */
export async function searchOpenSanctions(
  name: string,
  opts?: { schema?: "Person" | "Organization" | "LegalEntity"; limit?: number; fetchFn?: typeof fetch },
): Promise<ScreeningMatch[]> {
  const results = await searchOpenSanctionsShared(name, opts);
  return results as unknown as ScreeningMatch[];
}

/** Promote new related parties (from validation) into namesToScreen with status "Ready for screening". */
export function syncNamesToScreen(c: OnboardingCase): OnboardingCase {
  const existing = new Map(c.complianceOnly.namesToScreen.map((n) => [n.name.toLowerCase(), n]));
  const next: NameToScreen[] = [...c.complianceOnly.namesToScreen];

  // Investor entity itself.
  if (!existing.has(c.investorName.toLowerCase())) {
    next.push({
      name: c.investorName,
      partyType: "Entity",
      role: "Investor",
      relationship: "Self",
      country: c.jurisdiction,
      pepProvisional: false,
      sourceDoc: "Investor profile",
      screeningStatus: "Ready for screening",
    });
    existing.set(c.investorName.toLowerCase(), next[next.length - 1]);
  }

  // Related parties (UBOs, directors, signatories, etc.).
  for (const p of c.relatedParties) {
    if (existing.has(p.name.toLowerCase())) continue;
    const entry: NameToScreen = {
      name: p.name,
      partyType: p.partyType,
      role: p.role,
      relationship: p.role.toLowerCase().includes("underlying") ? "Indirect UBO" : "Direct related party",
      country: p.nationality,
      dob: p.dob,
      pepProvisional: !!p.pepProvisional,
      sourceDoc: "Related parties",
      screeningStatus: "Ready for screening",
    };
    next.push(entry);
    existing.set(p.name.toLowerCase(), entry);
  }

  if (next.length === c.complianceOnly.namesToScreen.length) return c;
  return {
    ...c,
    complianceOnly: { ...c.complianceOnly, namesToScreen: next },
  };
}

export async function runScreeningLogic(
  caseId: string,
  opts?: { fetchFn?: typeof fetch; delayMs?: number },
): Promise<OnboardingCase> {
  const { key, case: loaded } = await loadCaseByCaseId(caseId);
  // Make sure namesToScreen reflects current related parties.
  let c = syncNamesToScreen(loaded);

  const screenedAt = now();
  const newAudit: AuditEvent[] = [];
  const updatedNames: NameToScreen[] = [];

  for (const entry of c.complianceOnly.namesToScreen) {
    if (entry.screeningStatus === "Screening completed" || entry.screeningStatus === "Screening in progress") {
      updatedNames.push(entry);
      continue;
    }
    try {
      const matches = await searchOpenSanctions(entry.name, {
        schema: schemaForPartyType(entry.partyType),
        limit: 5,
        fetchFn: opts?.fetchFn,
      });
      updatedNames.push({
        ...entry,
        screeningStatus: "Screening completed",
        screenedAt,
        provider: PROVIDER,
        matches,
        error: undefined,
      });
      newAudit.push(
        audit(
          "Compliance",
          "Screening completed",
          `${entry.name}: ${matches.length} match${matches.length === 1 ? "" : "es"}.`,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updatedNames.push({
        ...entry,
        screeningStatus: "Screening failed",
        screenedAt,
        provider: PROVIDER,
        matches: undefined,
        error: message,
      });
      newAudit.push(audit("Compliance", "Screening failed", `${entry.name}: ${message}`));
    }
    if (opts?.delayMs && opts.delayMs > 0) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
  }

  const updated: OnboardingCase = {
    ...c,
    complianceOnly: { ...c.complianceOnly, namesToScreen: updatedNames },
    audit: [...c.audit, ...newAudit],
    lastSavedAt: now(),
  };
  updated.progressPct = recomputeProgress(updated);
  return await persistCase(key, updated);
}

export const runScreening = createServerFn({ method: "POST" })
  .validator((d: { caseId: string }) => d as { caseId: string })
  .handler(async (ctx) => {
    const { caseId } = ctx.data as { caseId: string };
    return await runScreeningLogic(caseId, { delayMs: 100 });
  });

/** Ensure namesToScreen reflects current related parties, without running the screen. */
export const syncScreeningList = createServerFn({ method: "POST" })
  .validator((d: { caseId: string }) => d as { caseId: string })
  .handler(async (ctx) => {
    const { caseId } = ctx.data as { caseId: string };
    const { key, case: loaded } = await loadCaseByCaseId(caseId);
    const synced = syncNamesToScreen(loaded);
    if (synced === loaded) return loaded;
    return await persistCase(key, synced);
  });
