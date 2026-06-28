import Anthropic from "@anthropic-ai/sdk";

export interface AnthropicCallOptions {
  /** Friendly label included in error messages. */
  label: string;
  /** Max attempts (including the first). Default 3. */
  maxAttempts?: number;
  /** Base delay (ms) before first retry. Doubles each attempt. Default 500. */
  baseDelayMs?: number;
}

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

/** Retries a Claude API call on transient errors, surfaces friendly messages on permanent ones. */
export async function withAnthropicRetry<T>(
  fn: () => Promise<T>,
  opts: AnthropicCallOptions,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = isTransient(err);
      if (!transient || attempt === maxAttempts) break;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw new Error(friendlyMessage(opts.label, lastErr));
}

function isTransient(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIError) {
    return typeof err.status === "number" && TRANSIENT_STATUS.has(err.status);
  }
  // Network errors typically show up as fetch failures
  if (err instanceof TypeError && /fetch failed|network/i.test(err.message)) return true;
  return false;
}

function friendlyMessage(label: string, err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return `${label} failed: the Anthropic API key is invalid or has been revoked. Update ANTHROPIC_API_KEY on the server.`;
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return `${label} failed: the Anthropic API key does not have access to this model. Check your console permissions.`;
  }
  if (err instanceof Anthropic.RateLimitError) {
    return `${label} failed: the Anthropic API is currently rate-limiting requests. Please try again in a moment.`;
  }
  if (err instanceof Anthropic.APIError && err.status === 413) {
    return `${label} failed: the document is too large for the model. Please upload a smaller file.`;
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `${label} failed: ${err.message}`;
  }
  if (err instanceof Anthropic.InternalServerError) {
    return `${label} failed: the Anthropic API is temporarily unavailable. Please try again.`;
  }
  if (err instanceof Anthropic.APIError) {
    return `${label} failed: ${err.message} (status ${err.status ?? "unknown"})`;
  }
  if (err instanceof Error) {
    return `${label} failed: ${err.message}`;
  }
  return `${label} failed: unknown error.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
