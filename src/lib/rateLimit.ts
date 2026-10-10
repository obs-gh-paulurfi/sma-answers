// Best-effort per-visitor limit to keep a public page from running up the
// API bill. It is in-memory, so each serverless instance counts separately;
// pair it with a monthly spend limit in the Anthropic Console.

const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

export function allowRequest(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 10_000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return true;
}
