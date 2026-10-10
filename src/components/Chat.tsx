"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Turn = { role: "user" | "assistant"; content: string };

type Props = {
  appName: string;
  parishName: string;
  contact: { phone: string; email: string; website: string; emergency: string };
};

const SUGGESTIONS = [
  "What are today's Mass readings?",
  "Who is the saint of the day?",
  "I've been away from the Church for years. Where do I start?",
  "Why do Catholics go to Confession?",
  "What are the Mass and Confession times?",
];

const MAX_CHARS = 2000;
const MAX_TURNS = 20;

const isPlaceholder = (value: string) => value.startsWith("[");

export default function Chat({ appName, parishName, contact }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showContact, setShowContact] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, status]);

  const atLimit = turns.length >= MAX_TURNS - 1;

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy || atLimit) return;

    const history: Turn[] = [...turns, { role: "user", content: text }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setStatus("Thinking…");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";

    const showAnswer = () =>
      setTurns([...history, { role: "assistant", content: answer }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; text?: string };
          if (event.type === "text" && event.text) {
            answer += event.text;
            setStatus("");
            showAnswer();
          } else if (event.type === "status" && event.text) {
            setStatus(event.text);
          } else if (event.type === "error") {
            throw new Error(event.text || "Something went wrong. Please try again.");
          }
        }
      }
      if (!answer.trim()) throw new Error("I didn't get an answer back. Please try again.");
    } catch (err) {
      if (controller.signal.aborted) {
        if (answer.trim()) showAnswer();
        else setTurns(turns);
      } else {
        // Drop the failed exchange so the question can be asked again.
        setTurns(turns);
        setInput(text);
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
      setStatus("");
      abortRef.current = null;
    }
  }

  function startOver() {
    abortRef.current?.abort();
    setTurns([]);
    setError("");
    setInput("");
  }

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>{appName}</h1>
          <p className="sub">{parishName}</p>
        </div>
        <div className="top-actions">
          {turns.length > 0 && (
            <button type="button" className="link-btn" onClick={startOver}>
              Start over
            </button>
          )}
          <button type="button" className="link-btn" onClick={() => setShowContact((v) => !v)} aria-expanded={showContact}>
            Talk to a person
          </button>
        </div>
      </header>

      {showContact && (
        <section className="contact" aria-label="Parish contact">
          <p>For anything about your own situation, the sacraments, or pastoral care, the parish staff and priests are glad to help.</p>
          <ul>
            {!isPlaceholder(contact.phone) && (
              <li>
                Call: <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a>
              </li>
            )}
            {!isPlaceholder(contact.emergency) && (
              <li>
                Sacramental emergency after hours:{" "}
                <a href={`tel:${contact.emergency.replace(/[^\d+]/g, "")}`}>{contact.emergency}</a>
              </li>
            )}
            {!isPlaceholder(contact.email) && (
              <li>
                Email: <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
            )}
            {!isPlaceholder(contact.website) && (
              <li>
                <a href={contact.website} target="_blank" rel="noopener noreferrer">
                  Parish website
                </a>
              </li>
            )}
          </ul>
          <p className="crisis">In a crisis, call or text <a href="tel:988">988</a>. In an emergency, call <a href="tel:911">911</a>.</p>
        </section>
      )}

      <main className="log" aria-live="polite">
        {turns.length === 0 ? (
          <section className="welcome">
            <h2>Welcome.</h2>
            <p>
              Ask a question about the Catholic faith, today&apos;s readings, or life at {parishName}. Answers
              cite the Catechism, Scripture, and Church documents.
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>
        ) : (
          turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="bubble user">
                {t.content}
              </div>
            ) : t.content ? (
              <div key={i} className="bubble assistant">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  }}
                >
                  {t.content}
                </ReactMarkdown>
              </div>
            ) : null,
          )
        )}
        {busy && status && <div className="status">{status}</div>}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {atLimit && !busy && (
          <div className="status">This conversation is at its limit. Tap &ldquo;Start over&rdquo; to ask something new.</div>
        )}
        <div ref={endRef} />
      </main>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          placeholder="Ask a question…"
          rows={1}
          aria-label="Your question"
          disabled={atLimit}
        />
        {busy ? (
          <button type="button" className="send" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" className="send" disabled={!input.trim() || atLimit}>
            Ask
          </button>
        )}
      </form>
      <p className="fine">
        {appName} is an AI helper and can make mistakes. It isn&apos;t a priest and can&apos;t replace Confession or
        pastoral care. Please don&apos;t share private details.
      </p>
    </div>
  );
}
