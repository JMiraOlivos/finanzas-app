"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED = [
  "¿Cómo estamos vs presupuesto este período?",
  "¿Qué empresas tienen EBITDA en rojo?",
  "¿Cuáles son los principales drivers de desviación?",
  "¿Hay problemas de calidad de datos?",
  "¿Qué estado tienen los cierres contables?",
];

type Props = {
  open: boolean;
  onClose: () => void;
  period: string;
  companyIds?: string | null;
};

export function AiChatDrawer({ open, onClose, period, companyIds }: Props) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [threadId,  setThreadId]  = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Reset thread when period/scope changes
  useEffect(() => {
    setMessages([]);
    setThreadId(null);
    setError(null);
  }, [period, companyIds]);

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const periodLabel = (() => {
    try {
      const d = new Date(period + "T12:00:00Z");
      return d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
    } catch { return period; }
  })();

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:   trimmed,
          threadId,
          period,
          companyIds: companyIds ? [companyIds] : null,
          history:   messages,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error del servidor" })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { reply: string; threadId: string };
      setThreadId(data.threadId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      // Remove optimistically added user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={[
          "fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white border-l border-ev-gray6 z-50",
          "flex flex-col transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Finance AI Chat"
      >
        {/* ── Header ── */}
        <div className="border-b border-ev-gray7 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-ev-black text-sm">✦</span>
              <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Finance AI</p>
            </div>
            <p className="text-[11px] font-body text-ev-gray4 mt-0.5">
              Contexto: {periodLabel}{companyIds ? " · empresa filtrada" : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setThreadId(null); setError(null); }}
                className="text-[10px] font-body text-ev-gray4 hover:text-ev-black transition-colors"
                title="Nueva conversación"
              >
                Nueva ↺
              </button>
            )}
            <button
              onClick={onClose}
              className="text-ev-gray3 hover:text-ev-black transition-colors text-lg leading-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Welcome + suggested questions */}
          {messages.length === 0 && !loading && (
            <div className="space-y-4">
              <p className="text-xs font-body text-ev-gray3 leading-relaxed">
                Puedo responder preguntas sobre los datos financieros del período usando
                información certificada de los marts dbt.
              </p>
              <div>
                <p className="text-[10px] font-body uppercase tracking-wider text-ev-gray4 mb-2">
                  Preguntas sugeridas
                </p>
                <div className="space-y-1.5">
                  {SUGGESTED.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="w-full text-left text-[11px] font-body text-ev-gray2 hover:text-ev-black
                                 border border-ev-gray7 hover:border-ev-gray4 px-3 py-2
                                 transition-colors leading-snug"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Message history */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={["flex", msg.role === "user" ? "justify-end" : "justify-start"].join(" ")}
            >
              <div
                className={[
                  "max-w-[85%] px-3 py-2 text-xs font-body leading-relaxed",
                  msg.role === "user"
                    ? "bg-ev-black text-white"
                    : "bg-neutral-50 border border-ev-gray7 text-ev-gray2",
                ].join(" ")}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-neutral-50 border border-ev-gray7 px-3 py-2">
                <span className="text-xs font-body text-ev-gray4 animate-pulse">Analizando…</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="border border-ev-red/30 bg-red-50 px-3 py-2">
              <p className="text-[11px] font-body text-ev-red">{error}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div className="border-t border-ev-gray7 px-4 py-3 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta algo sobre los datos financieros…"
              rows={2}
              disabled={loading}
              className="flex-1 resize-none text-xs font-body border border-ev-gray6 px-3 py-2
                         focus:outline-none focus:ring-1 focus:ring-ev-black
                         disabled:opacity-50 leading-relaxed"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="px-3 py-2 bg-ev-black text-white text-xs font-body
                         hover:bg-ev-gray2 disabled:opacity-40 transition-colors
                         flex-shrink-0 h-[56px]"
            >
              ▶
            </button>
          </div>
          <p className="text-[9px] font-body text-ev-gray5 mt-1.5">
            Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      </div>
    </>
  );
}
