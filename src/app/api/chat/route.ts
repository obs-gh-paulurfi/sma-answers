import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { systemPrompt, todayBlock } from "@/lib/systemPrompt";
import { allowRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120; // seconds; tool lookups can take a while

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.SMA_EFFORT || "medium") as "low" | "medium" | "high";
const RATE_LIMIT = Number(process.env.SMA_RATE_LIMIT) || 20;
const MCP_URL = process.env.MAGISTERIUM_MCP_URL || "https://mcp.magisterium.com";

const MAX_TURNS = 20;
const MAX_CHARS = 2000;
const MAX_CONTINUATIONS = 4;

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

function statusFor(toolName: string): string {
  if (/reading/i.test(toolName)) return "Looking up the readings…";
  if (/saint|martyrology/i.test(toolName)) return "Looking up the saint…";
  return "Searching Church sources…";
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
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

      try {
        for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
          const stream = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 16000,
              betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
              fallbacks: "default",
              output_config: { effort: EFFORT },
              system: [
                { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
                { type: "text", text: todayBlock() },
              ],
              mcp_servers: [
                {
                  type: "url",
                  url: MCP_URL,
                  name: "magisterium",
                  authorization_token: process.env.MAGISTERIUM_MCP_TOKEN || undefined,
                },
              ],
              tools: [{ type: "mcp_toolset", mcp_server_name: "magisterium" }],
              messages,
            },
            { signal: req.signal },
          );

          for await (const event of stream) {
            if (event.type === "content_block_start" && event.content_block.type === "mcp_tool_use") {
              send({ type: "status", text: statusFor(event.content_block.name) });
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ type: "text", text: event.delta.text });
            }
          }

          const message = await stream.finalMessage();

          if (message.stop_reason === "pause_turn") {
            // The server-side tool loop hit its step limit; send the turn
            // back as-is and it resumes where it left off.
            messages = [...messages, { role: "assistant", content: message.content }];
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
