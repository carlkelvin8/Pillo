"use client";

import { SendHorizontal, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DrPillAvatar } from "@/components/brand/dr-pill-avatar";
import { Button } from "@/components/ui/button";
import { ASSISTANT_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";
import { findLocalSpeechVoice } from "./local-speech";

type Msg = { id: string; role: "patient" | "assistant" | "staff"; content: string };
type Stored = { id: string; token: string };

const POLL_MS = 6000;

/** The patient-facing chat. The conversation token lives in sessionStorage and is sent only in a header or the POST body. */
export function ChatWindow({
  slug,
  clinicName,
  open,
}: {
  slug: string;
  clinicName: string;
  open: boolean;
}) {
  const key = `chat:${slug}`;
  const [conv, setConv] = useState<Stored | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [humanActive, setHumanActive] = useState(false);
  const [voiceMessageId, setVoiceMessageId] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<{ id: string; message: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const speechRunId = useRef(0);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setConv(JSON.parse(raw) as Stored);
    } catch {
      /* storage unavailable: a new chat starts each visit */
    }
  }, [key]);

  const sync = useCallback(
    async (c: Stored) => {
      try {
        const res = await fetch(`/api/chat/${slug}/messages?conversationId=${c.id}`, {
          headers: { Authorization: `Bearer ${c.token}` },
          cache: "no-store",
        });
        if (res.status === 401) {
          sessionStorage.removeItem(key);
          setConv(null);
          setMessages([]);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: "ai" | "human";
          messages: { id: string; role: Msg["role"]; content: string }[];
        };
        setMessages(data.messages.filter((m) => m.role !== ("system" as string)));
        setHumanActive(data.status === "human");
      } catch {
        /* offline: try again on the next poll */
      }
    },
    [key, slug],
  );

  useEffect(() => {
    if (!conv) return;
    void sync(conv);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void sync(conv);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [conv, sync]);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [messages, sending]);

  useEffect(
    () => () => {
      speechRunId.current += 1;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  function toggleReadAloud(id: string, text: string) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setVoiceNotice({
        id,
        message:
          "Read aloud is not available in this browser. The message is still available as text.",
      });
      return;
    }

    if (voiceMessageId === id) {
      speechRunId.current += 1;
      window.speechSynthesis.cancel();
      setVoiceMessageId(null);
      return;
    }

    const voice = findLocalSpeechVoice(window.speechSynthesis.getVoices());
    if (!voice) {
      setVoiceNotice({
        id,
        message:
          "No local voice is available on this device. The message is still available as text.",
      });
      return;
    }

    const runId = ++speechRunId.current;
    window.speechSynthesis.cancel();
    setVoiceNotice(null);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.pitch = 1.18;
    utterance.rate = 0.94;
    utterance.onend = () => {
      if (speechRunId.current === runId) setVoiceMessageId(null);
    };
    utterance.onerror = (event) => {
      if (speechRunId.current !== runId) return;
      setVoiceMessageId(null);
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setVoiceNotice({
          id,
          message: "Read aloud could not play. The message is still available as text.",
        });
      }
    };
    setVoiceMessageId(id);
    window.speechSynthesis.speak(utterance);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "patient", content: text }]);
    try {
      const res = await fetch(`/api/chat/${slug}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: conv?.id, token: conv?.token }),
      });
      const data = (await res.json()) as {
        error?: string;
        conversationId?: string;
        token?: string;
        status?: "ai" | "human";
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        if (res.status === 401) {
          sessionStorage.removeItem(key);
          setConv(null);
        }
        return;
      }
      const next: Stored = {
        id: data.conversationId ?? conv?.id ?? "",
        token: data.token ?? conv?.token ?? "",
      };
      if (data.token) {
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      setConv(next);
      setHumanActive(data.status === "human");
      await sync(next);
    } catch {
      setError("No connection. Please check your internet and try again.");
    } finally {
      setSending(false);
    }
  }

  const mood = sending ? "think" : open ? "happy" : "sleepy";
  const greeting = `Hi po! Ako si ${ASSISTANT_NAME}, ang virtual receptionist ng ${clinicName}. Paano po kita matutulungan?${open ? "" : " Sarado na po kami ngayon, pero pwede pa rin po akong tumulong mag-book."}`;

  return (
    <div className="bg-surface sm:rounded-card sm:border-line sm:shadow-card mx-auto flex h-dvh w-full max-w-6xl flex-col sm:my-6 sm:h-[calc(100dvh-3rem)] sm:border">
      <header className="border-line flex items-center gap-3 border-b px-5 py-4">
        <DrPillAvatar mood={mood} size={44} decorative />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{ASSISTANT_NAME}</h1>
          <p className="text-muted truncate text-sm">{clinicName}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            humanActive ? "bg-amber-chip text-amber-chip-ink" : "bg-mint text-mint-ink",
          )}
        >
          {humanActive ? "Staff will reply" : "AI assistant"}
        </span>
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4"
      >
        <Bubble
          role="assistant"
          messageId="greeting"
          playing={voiceMessageId === "greeting"}
          notice={voiceNotice?.id === "greeting" ? voiceNotice.message : undefined}
          onReadAloud={toggleReadAloud}
        >
          {greeting}
        </Bubble>
        {messages.map((m) => (
          <Bubble
            key={m.id}
            role={m.role}
            messageId={m.id}
            playing={voiceMessageId === m.id}
            notice={voiceNotice?.id === m.id ? voiceNotice.message : undefined}
            onReadAloud={toggleReadAloud}
          >
            {m.content}
          </Bubble>
        ))}
        {sending ? <p className="text-muted text-sm">{ASSISTANT_NAME} is typing…</p> : null}
        <div ref={endRef} />
      </div>

      <div className="border-line border-t px-5 py-3">
        {error ? (
          <p
            role="alert"
            className="rounded-control bg-danger-chip text-danger-chip-ink mb-2 px-3 py-2 text-sm font-medium"
          >
            {error}
          </p>
        ) : null}
        <form onSubmit={send} className="flex items-end gap-2">
          <label className="sr-only" htmlFor="chat-input">
            Your message
          </label>
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder="Type your message"
            className="rounded-control border-line-strong bg-surface placeholder:text-muted max-h-32 min-h-11 flex-1 resize-none border px-4 py-2.5 text-sm"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={sending || input.trim() === ""}
          >
            <SendHorizontal aria-hidden="true" />
          </Button>
        </form>
        <p className="text-muted mt-2 text-xs">
          {ASSISTANT_NAME} is an AI assistant. It cannot give medical advice. In an emergency, call
          911. We only save your details with your OK.
        </p>
      </div>
    </div>
  );
}

function Bubble({
  role,
  children,
  messageId,
  playing,
  notice,
  onReadAloud,
}: {
  role: Msg["role"];
  children: React.ReactNode;
  messageId: string;
  playing: boolean;
  notice?: string;
  onReadAloud: (id: string, text: string) => void;
}) {
  const patient = role === "patient";
  return (
    <div className={cn("flex flex-col gap-1", patient ? "items-end" : "items-start")}>
      {role === "staff" ? <span className="text-muted text-xs font-medium">Staff</span> : null}
      <p
        className={cn(
          "rounded-card max-w-[85%] px-4 py-2.5 text-sm whitespace-pre-line",
          patient && "bg-ink text-surface",
          role === "assistant" && "bg-mint text-ink",
          role === "staff" && "border-line-strong bg-surface text-ink border",
        )}
      >
        {children}
      </p>
      {role === "assistant" ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11"
            aria-label={playing ? "Stop reading message" : "Read message aloud"}
            aria-pressed={playing}
            onClick={() => onReadAloud(messageId, String(children))}
          >
            {playing ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </Button>
          {notice ? (
            <p role="status" className="text-muted max-w-64 text-xs">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
