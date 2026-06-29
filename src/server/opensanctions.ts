/**
 * Shared OpenSanctions client. Used by both the legacy chat-flow screening
 * server fn (src/server/screening.ts) and the stepper compliance server fn
 * (src/server/stepper/compliance.ts). Keep this dependency-free so it can
 * also be called directly from tests with an injected `fetchFn`.
 *
 * Authentication: OpenSanctions's hosted `/search` and `/match` endpoints
 * require an API key (https://www.opensanctions.org/api/). Set
 *   OPENSANCTIONS_API_KEY=...
 * in your environment (.env) for screening to work end-to-end. Without it,
 * the API returns 401 Unauthorized and screening fails with a clear message.
 *
 * To bypass for local development against a self-hosted instance, set
 *   OPENSANCTIONS_BASE_URL=http://localhost:8000
 * and the request will go there instead of the hosted API.
 */

const OPENSANCTIONS_BASE = process.env.OPENSANCTIONS_BASE_URL ?? "https://api.opensanctions.org";
const OPENSANCTIONS_API_KEY = process.env.OPENSANCTIONS_API_KEY ?? "";

export const OPENSANCTIONS_PROVIDER = "OpenSanctions";

/** True when an API key has been configured. Lets callers degrade gracefully
 *  (e.g. show a banner) instead of waiting for a 401 round-trip. */
export function hasOpenSanctionsKey(): boolean {
  return OPENSANCTIONS_API_KEY.length > 0;
}

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
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "investor-onboarding-assistant/1.0",
  };
  if (OPENSANCTIONS_API_KEY) {
    // OpenSanctions accepts `Authorization: ApiKey <key>`. This is the only
    // way to use the hosted API at scale; without it the server returns 401.
    headers.Authorization = `ApiKey ${OPENSANCTIONS_API_KEY}`;
  }

  const response = await f(url.toString(), { headers });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        OPENSANCTIONS_API_KEY
          ? `OpenSanctions rejected the configured API key (${response.status} ${response.statusText}). Verify OPENSANCTIONS_API_KEY is valid and has search permission.`
          : `OpenSanctions ${response.status} ${response.statusText}. The hosted API requires authentication — set OPENSANCTIONS_API_KEY in your .env (see https://www.opensanctions.org/api/).`,
      );
    }
    if (response.status === 429) {
      throw new Error(
        `OpenSanctions rate limit hit (429). Wait a minute or upgrade your plan.`,
      );
    }
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
