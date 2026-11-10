/** Shared plumbing for source adapters. */

const TIMEOUT_MS = 20_000;

/**
 * GET JSON with a timeout, so one hung host can't stall the whole build,
 * and an error that names the source.
 */
export async function getJson<T>(source: string, url: string, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const timedOut = (e as Error).name === "TimeoutError";
    throw new Error(timedOut ? `${source} timed out after ${TIMEOUT_MS / 1000}s` : `${source} unreachable: ${(e as Error).message}`);
  }
  if (res.status === 429) throw new Error(`${source} rate-limited the request (HTTP 429)`);
  if (!res.ok) throw new Error(`${source} responded ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`${source} returned something that isn't JSON`);
  }
}

/** Fails with a clear message when a response isn't the expected shape. */
export function expectArray<T>(source: string, field: string, value: unknown): T[] {
  if (!Array.isArray(value)) throw new Error(`${source} response has no ${field} list (API changed?)`);
  return value as T[];
}

/** Collapses whitespace and caps length, for titles and summaries. */
export function cleanText(s: string | null | undefined, max = 300): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
