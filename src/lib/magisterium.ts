import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";

// Magisterium's developer API, called with an API key. (Their hosted MCP
// server only supports an interactive OAuth login, which a server-side app
// can't complete, so SMAnswers runs the search itself as a Claude tool.)
const API_URL = process.env.MAGISTERIUM_API_URL || "https://www.magisterium.com/api/v1";
const NUM_RESULTS = 8;
const MAX_RESULT_CHARS = 40_000;
const MAX_QUERY_CHARS = 500;

export function magisteriumKey(): string | undefined {
  // MAGISTERIUM_MCP_TOKEN is the older name for the same key.
  return process.env.MAGISTERIUM_API_KEY || process.env.MAGISTERIUM_MCP_TOKEN || undefined;
}

export const searchTool: BetaTool = {
  name: "magisterium_search",
  description:
    "Search Magisterium's library of Catholic sources: Scripture, the Catechism of the Catholic Church, " +
    "Church councils, papal documents, canon law, the Church Fathers, and other magisterial texts. " +
    "Returns matching passages with their sources. Use it before answering any question about Church " +
    "teaching, and quote or cite only what the results support. Write the query as a focused topic or " +
    'question, e.g. "purgatory purification after death" or "CCC 1422". Run several searches for ' +
    "questions that touch several topics.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to search for." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  eager_input_streaming: true,
};

export type ToolOutcome = { content: string; isError: boolean };

// Streamed tool input is parsed tolerantly, so check it before running.
export function readQuery(input: unknown): string | null {
  const query = (input as { query?: unknown } | null)?.query;
  if (typeof query !== "string") return null;
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > MAX_QUERY_CHARS) return null;
  return trimmed;
}

export async function searchMagisterium(query: string, signal: AbortSignal): Promise<ToolOutcome> {
  const key = magisteriumKey();
  if (!key) return { content: "Magisterium search is not configured.", isError: true };

  try {
    const res = await fetch(`${API_URL}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, numResults: NUM_RESULTS }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("magisterium search failed", res.status, text.slice(0, 500));
      return {
        content: `Magisterium search failed (HTTP ${res.status}). Answer without it only if you can do so reliably, and say the sources couldn't be checked.`,
        isError: true,
      };
    }
    return {
      content: text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) + "\n[results truncated]" : text,
      isError: false,
    };
  } catch (err) {
    if (signal.aborted) throw err;
    console.error("magisterium search error", err);
    return {
      content: "Magisterium search could not be reached. Say the sources couldn't be checked right now.",
      isError: true,
    };
  }
}
