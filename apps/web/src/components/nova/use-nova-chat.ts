"use client";

import { useCallback, useRef, useState } from "react";
import { apiPost } from "@/lib/api/client";
import { extractPdfBlocks, type NovaPdfBlock } from "./nova-pdf";

export interface NovaAttachment {
  type: "image" | "document";
  mediaType: string;
  dataBase64: string;
  name: string;
}

export interface NovaChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pdfs?: NovaPdfBlock[];
  pending?: boolean;
}

interface ChatResponse {
  conversationId: string;
  text: string;
  model: string;
  toolCalls: number;
  learned: number;
}

let _id = 0;
const nextId = () => `m${Date.now()}_${_id++}`;

export function useNovaChat() {
  const [messages, setMessages] = useState<NovaChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | null>(null);

  const send = useCallback(
    async (text: string, attachments?: NovaAttachment[]) => {
      const trimmed = text.trim();
      if ((!trimmed && !attachments?.length) || loading) return;

      setError(null);
      const userMsg: NovaChatMessage = {
        id: nextId(),
        role: "user",
        text: trimmed || (attachments?.length ? `📎 ${attachments[0].name}` : ""),
      };
      const pendingMsg: NovaChatMessage = {
        id: nextId(),
        role: "assistant",
        text: "",
        pending: true,
      };
      setMessages((m) => [...m, userMsg, pendingMsg]);
      setLoading(true);

      try {
        const res = await apiPost<ChatResponse>("/nova/chat", {
          message: trimmed,
          conversationId: conversationId.current ?? undefined,
          attachments: attachments?.map((a) => ({
            type: a.type,
            mediaType: a.mediaType,
            dataBase64: a.dataBase64,
          })),
        });
        conversationId.current = res.conversationId;
        const { clean, blocks } = extractPdfBlocks(res.text);
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pendingMsg.id
              ? { ...msg, text: clean, pdfs: blocks, pending: false }
              : msg,
          ),
        );
      } catch (e: any) {
        const status = e?.status;
        const msg =
          status === 429
            ? "I'm getting a lot of requests right now — give me a minute and try again."
            : status === 403
              ? "You don't have access to Nova. Ask an admin to enable it."
              : "Sorry, something went wrong reaching me. Try again in a moment.";
        setError(msg);
        setMessages((m) =>
          m.map((mm) =>
            mm.id === pendingMsg.id ? { ...mm, text: msg, pending: false } : mm,
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  const reset = useCallback(() => {
    conversationId.current = null;
    setMessages([]);
    setError(null);
  }, []);

  // Seed an assistant message that didn't come from a send() — used for Nova's
  // daily briefing, which the server generates and we drop in as her opener.
  // PDF blocks are still parsed so report-style briefings render their button.
  const seed = useCallback((text: string) => {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    const { clean, blocks } = extractPdfBlocks(trimmed);
    setMessages((m) => [
      ...m,
      { id: nextId(), role: "assistant", text: clean, pdfs: blocks },
    ]);
  }, []);

  return { messages, loading, error, send, reset, seed };
}
