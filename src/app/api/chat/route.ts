import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessageParam,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { systemPrompt, todayBlock } from "@/lib/systemPrompt";
import { allowRequest } from "@/lib/rateLimit";
import { magisteriumKey, readQuery, searchMagisterium, searchTool } from "@/lib/magisterium";

export const runtime = "nodejs";
export const maxDuration = 120; // seconds; tool lookups can take a while

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.SMA_EFFORT || "medium") as "low" | "medium" | "high";
const RATE_LIMIT = Number(process.env.SMA_RATE_LIMIT) || 20;

const MAX_TURNS = 20;
const MAX_CHARS = 2000;
const MAX_SEARCH_ROUNDS = 5;
const MAX_STREAM_RETRIES = 2;

const client = new Anthropic();

type ChatTurn = { role: "user" | "assistant"; content: string };

// Events sent to the browser, one JSON object per line.
type StreamEvent =
  | { type: "text"; text: string }
  | { type: "status"; text: string }
  | { type: "error"; text: string }
  | { type: "done" };

function parseTurns(body: unknown): ChatTurn[] | null {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_TURNS) return null;
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      m.content.trim() === "" ||
      m.content.length > (m.role === "user" ? MAX_CHARS : 20_000)
    ) {
      return null;
    }
    turns.push({ role: m.role, content: m.content });
  }
  if (turns[0].role !== "user" || turns[turns.length - 1].role !== "user") return null;
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].role === turns[i - 1].role) return null;
  }
  return turns;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY || !magisteriumKey()) {
    return Response.json({ error: "SMAnswers isn't configured yet." }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(ip, RATE_LIMIT)) {
    return Response.json(
      { error: "You've asked a lot of questions in a short time. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let turns: ChatTurn[] | null = null;
  try {
    turns = parseTurns(await req.json());
  } catch {
    turns = null;
  }
  if (!turns) {
    return Response.json({ error: "That message couldn't be sent. Please try again." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      // Prior assistant turns are resent as plain text; the conversation
      // only ever grows, so nothing earlier is edited.
      let messages: BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));

      let sentText = false;
      let needsBreak = false;
      let retries = 0;

      try {
        for (let round = 0; round <= MAX_SEARCH_ROUNDS; round++) {
          const stream = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 16000,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              output_config: { effort: EFFORT },
              system: [
                { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
                { type: "text", text: todayBlock() },
              ],
              tools: [searchTool],
              // On the last round, answer with what has been found so far.
              ...(round === MAX_SEARCH_ROUNDS ? { tool_choice: { type: "none" as const } } : {}),
              messages,
            },
            { signal: req.signal },
          );

          let message;
          try {
            for await (const event of stream) {
              if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
                send({ type: "status", text: "Searching Church sources…" });
              } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                if (needsBreak) {
                  send({ type: "text", text: "\n\n" });
                  needsBreak = false;
                }
                send({ type: "text", text: event.delta.text });
                sentText = true;
              }
            }
            message = await stream.finalMessage();
          } catch (err) {
            // A streamed tool input that isn't valid JSON: re-issue the turn.
            if (err instanceof Anthropic.APIError || req.signal.aborted || retries >= MAX_STREAM_RETRIES) throw err;
            retries++;
            round--;
            continue;
          }

          if (message.stop_reason === "tool_use") {
            const uses = message.content.filter((b) => b.type === "tool_use");
            const results: BetaToolResultBlockParam[] = await Promise.all(
              uses.map(async (use) => {
                const query = use.name === searchTool.name ? readQuery(use.input) : null;
                const outcome = query
                  ? await searchMagisterium(query, req.signal)
                  : { content: "Invalid search request: give a non-empty query under 500 characters.", isError: true };
                return {
                  type: "tool_result" as const,
                  tool_use_id: use.id,
                  content: outcome.content,
                  ...(outcome.isError ? { is_error: true } : {}),
                };
              }),
            );
            messages = [
              ...messages,
              { role: "assistant", content: message.content },
              { role: "user", content: results },
            ];
            if (sentText) needsBreak = true;
            continue;
          }

          if (message.stop_reason === "refusal") {
            send({
              type: "text",
              text: "\n\nI'm not able to help with that one here. For questions about your own situation, please reach out to the parish office or a priest.",
            });
          } else if (message.stop_reason === "max_tokens") {
            send({ type: "text", text: "\n\n(That answer was cut short. Ask me to continue.)" });
          }
          break;
        }
        send({ type: "done" });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("chat error", err);
          const busy = err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError;
          send({
            type: "error",
            text: busy
              ? "SMAnswers is very busy right now. Please try again in a minute."
              : "Something went wrong looking that up. Please try again.",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed because the visitor left
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
