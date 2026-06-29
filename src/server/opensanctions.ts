/**
 * Shared OpenSanctions client. Used by both the legacy chat-flow screening
 * server fn (src/server/screening.ts) and the stepper compliance server fn
 * (src/server/stepper/compliance.ts). Keep this dependency-free so it can
 * also be called directly from tests with an injected `fetchFn`.
 */

const OPENSANCTIONS_BASE = process.env.OPENSANCTIONS_BASE_URL ?? "https://api.opensanctions.org";

export const OPENSANCTIONS_PROVIDER = "OpenSanctions";

export interface OpenSanctionsMatch {
  id: string;
  caption: string;
  score: number;
  topics: string[];
  countries: string[];
  datasets: string[];
  birthDate?: string;
  sourceUrl?: string;
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

export type OpenSanctionsSchema = "Person" | "Organization" | "LegalEntity";

export async function searchOpenSanctions(
  name: string,
  opts?: { schema?: OpenSanctionsSchema; limit?: number; fetchFn?: typeof fetch },
): Promise<OpenSanctionsMatch[]> {
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

  return results.map<OpenSanctionsMatch>((r) => ({
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

export function schemaForPartyType(partyType: string): OpenSanctionsSchema {
  if (partyType === "Individual") return "Person";
  if (partyType === "Entity") return "LegalEntity";
  return "LegalEntity";
}
