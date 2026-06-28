import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { loadCaseByCaseId, persistCase } from "./cases";
import { recomputeProgress } from "@/lib/onboarding/engine";
import type {
  OnboardingCase,
  NameToScreen,
  ScreeningMatch,
  AuditEvent,
} from "@/lib/onboarding/types";

const OPENSANCTIONS_BASE = process.env.OPENSANCTIONS_BASE_URL ?? "https://api.opensanctions.org";
const PROVIDER = "OpenSanctions";

const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

function audit(actor: AuditEvent["actor"], type: string, detail: string): AuditEvent {
  return { id: id("au"), at: now(), actor, type, detail };
}

interface OpenSanctionsResult {
  id: string;
  schema: string;
  caption: string;
  score?: number;
  properties?: {
    birthDate?: string[];
    country?: string[];
    sourceUrl?: string[];
    [key: string]: string[] | undefined;
  };
  datasets?: string[];
  countries?: string[];
  topics?: string[];
}

interface OpenSanctionsResponse {
  results?: OpenSanctionsResult[];
}

/** Calls the OpenSanctions /search endpoint for one name and returns parsed matches. */
export async function searchOpenSanctions(
  name: string,
  opts?: { schema?: "Person" | "Organization" | "LegalEntity"; limit?: number; fetchFn?: typeof fetch },
): Promise<ScreeningMatch[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const url = new URL(`${OPENSANCTIONS_BASE}/search/default`);
  url.searchParams.set("q", trimmed);
  if (opts?.schema) url.searchParams.set("schema", opts.schema);
  url.searchParams.set("limit", String(opts?.limit ?? 5));

  const f = opts?.fetchFn ?? fetch;
  const response = await f(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "investor-onboarding-assistant/1.0" },
  });
  if (!response.ok) {
    throw new Error(`OpenSanctions ${response.status}: ${response.statusText}`);
  }
  const body = (await response.json()) as OpenSanctionsResponse;
  const results = body.results ?? [];

  return results.map<ScreeningMatch>((r) => ({
    id: r.id,
    caption: r.caption,
    score: typeof r.score === "number" ? r.score : 0,
    topics: r.topics ?? [],
    countries: r.countries ?? r.properties?.country ?? [],
    datasets: r.datasets ?? [],
    birthDate: r.properties?.birthDate?.[0],
    sourceUrl: r.properties?.sourceUrl?.[0] ?? `https://www.opensanctions.org/entities/${r.id}/`,
  }));
}

function schemaForPartyType(partyType: string): "Person" | "Organization" | "LegalEntity" {
  if (partyType === "Individual") return "Person";
  if (partyType === "Entity") return "LegalEntity";
  return "LegalEntity";
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
