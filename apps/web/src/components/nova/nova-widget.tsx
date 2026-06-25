"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  X,
  Send,
  Paperclip,
  Download,
  RotateCcw,
  Loader2,
  Mic,
  Volume2,
  VolumeX,
  UserCircle2,
  Loader,
} from "lucide-react";
import { downloadNovaPdf } from "./nova-pdf";
import { useNovaChat, type NovaAttachment } from "./use-nova-chat";
import { useSpeechRecognition } from "./use-speech-recognition";
import { speak, stopSpeaking } from "./nova-speak";
import { useNovaAvatar } from "./use-nova-avatar";

const ACCENT = "#00d4ff";
const MAX_ATTACH_BYTES = 8 * 1024 * 1024; // 8 MB
const VOICE_KEY = "astrasolar:nova-voice";

/**
 * Nova — the floating AI assistant. A FAB bottom-right opens a chat panel that
 * talks to /api/v1/nova/chat. Voice: tap the mic to talk (browser speech
 * recognition); Nova speaks her replies aloud (ElevenLabs server-side, with a
 * browser-voice fallback). The speaker toggle mutes auto-speak.
 */
export function NovaWidget({
  userName,
  open,
  onClose,
  briefing,
}: {
  userName?: string;
  /** Controlled visibility — driven by the floating dock cluster. */
  open: boolean;
  onClose: () => void;
  /** Nova's daily briefing text — seeded as her opening message when present. */
  briefing?: string | null;
}) {
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<NovaAttachment | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const { messages, loading, error, send, reset, seed } = useNovaChat();
  const avatar = useNovaAvatar();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSpokenId = useRef<string | null>(null);
  const seededBriefing = useRef<string | null>(null);

  // Drop the daily briefing in as Nova's first message (once per briefing text).
  // The auto-speak effect below then reads it aloud when the panel is open.
  useEffect(() => {
    if (!briefing) return;
    if (seededBriefing.current === briefing) return;
    seededBriefing.current = briefing;
    seed(briefing);
  }, [briefing, seed]);

  const {
    supported: micSupported,
    listening,
    interim,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    onFinal: (text) => {
      // Voice turn → send straight away.
      if (text.trim()) {
        send(text, undefined);
        setInput("");
      }
    },
  });

  // Restore the voice preference.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VOICE_KEY) === "off") setVoiceOn(false);
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-scroll.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, interim]);

  // Speak the latest completed assistant message. When the avatar is live it
  // lip-syncs the line (its own voice); otherwise use ElevenLabs/browser TTS.
  useEffect(() => {
    if (!open) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.pending) return;
    if (lastSpokenId.current === last.id) return;
    lastSpokenId.current = last.id;
    if (!last.text) return;
    if (avatar.connected) avatar.speak(last.text);
    else if (voiceOn) speak(last.text);
  }, [messages, voiceOn, open, avatar.connected]);

  function toggleVoice() {
    setVoiceOn((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(VOICE_KEY, next ? "on" : "off");
      } catch {
        /* ignore */
      }
      if (!next) stopSpeaking();
      return next;
    });
  }

  function closePanel() {
    stopSpeaking();
    stopListening();
    avatar.disconnect();
    onClose();
  }

  function toggleAvatar() {
    if (avatar.connected || avatar.status === "connecting") avatar.disconnect();
    else {
      stopSpeaking(); // avatar will handle the voice once live
      avatar.connect();
    }
  }

  function onMic() {
    if (listening) {
      stopListening();
    } else {
      stopSpeaking(); // don't talk over Nova
      startListening();
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACH_BYTES) {
      alert("File is too large (max 8 MB).");
      return;
    }
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      alert("Attach an image or a PDF.");
      return;
    }
    const dataBase64 = await fileToBase64(file);
    setAttachment({
      type: isImage ? "image" : "document",
      mediaType: isImage ? file.type : "application/pdf",
      dataBase64,
      name: file.name,
    });
  }

  function submit() {
    if ((!input.trim() && !attachment) || loading) return;
    stopSpeaking();
    send(input, attachment ? [attachment] : undefined);
    setInput("");
    setAttachment(null);
  }

  return (
    <>
      {open && (
        <div
          className="fixed bottom-5 right-5 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl text-slate-100 shadow-2xl"
          style={{
            height: "min(640px, calc(100vh - 2.5rem))",
            background: "#0b1220",
            border: "1px solid rgba(0,212,255,0.18)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ background: "linear-gradient(135deg, #0a2540, #00374f)" }}
          >
            <Sparkles size={18} style={{ color: ACCENT }} />
            <div className="flex-1">
              <div className="text-sm font-semibold tracking-wide" style={{ color: ACCENT }}>
                NOVA
              </div>
              <div className="text-[11px] text-slate-400">
                {listening ? "Listening…" : "Nextgen Operations Virtual Assistant"}
              </div>
            </div>
            {avatar.available && (
              <button
                onClick={toggleAvatar}
                title={avatar.connected ? "Hide avatar" : "Show Nova avatar"}
                className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200"
              >
                {avatar.status === "connecting" ? (
                  <Loader size={16} className="animate-spin" />
                ) : (
                  <UserCircle2
                    size={16}
                    style={avatar.connected ? { color: ACCENT } : undefined}
                  />
                )}
              </button>
            )}
            <button
              onClick={toggleVoice}
              title={voiceOn ? "Mute Nova's voice" : "Unmute Nova's voice"}
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              {voiceOn ? <Volume2 size={16} style={{ color: ACCENT }} /> : <VolumeX size={16} />}
            </button>
            <button
              onClick={reset}
              title="New chat"
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              <RotateCcw size={15} />
            </button>
            <button
              onClick={closePanel}
              title="Close"
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              <X size={17} />
            </button>
          </div>

          {/* Avatar strip */}
          {avatar.available && avatar.status !== "idle" && (
            <div className="relative border-b border-white/5 bg-black/40">
              <video
                ref={avatar.videoRef}
                autoPlay
                playsInline
                className="mx-auto h-44 w-full object-cover"
                style={{ display: avatar.connected ? "block" : "none" }}
              />
              {avatar.status === "connecting" && (
                <div className="flex h-44 flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader size={22} className="animate-spin" style={{ color: ACCENT }} />
                  <span className="text-xs">Connecting avatar…</span>
                </div>
              )}
              {avatar.status === "error" && (
                <div className="flex h-44 flex-col items-center justify-center gap-1 text-slate-400">
                  <UserCircle2 size={26} />
                  <span className="text-xs text-rose-400">Avatar couldn&apos;t connect</span>
                </div>
              )}
              {avatar.connected && (
                <span
                  className="absolute left-3 top-2 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium"
                  style={{ color: ACCENT }}
                >
                  <span
                    className={"inline-block h-1.5 w-1.5 rounded-full " + (avatar.speaking ? "animate-pulse" : "")}
                    style={{ background: ACCENT }}
                  />
                  {avatar.speaking ? "Speaking" : "Live"}
                </span>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="mt-6 text-center text-sm text-slate-400">
                <Sparkles size={22} className="mx-auto mb-2" style={{ color: ACCENT }} />
                <p className="font-medium text-slate-200">
                  G&apos;day{userName ? ` ${userName.split(" ")[0]}` : ""} — I&apos;m Nova.
                </p>
                <p className="mt-1 text-[13px] leading-relaxed">
                  Ask me about product specs, a lead or sale, the pipeline, rebates,
                  or paste a call transcript for coaching. Tap the mic to talk.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed " +
                    (m.role === "user" ? "bg-sky-600 text-white" : "bg-slate-800/80 text-slate-100")
                  }
                >
                  {m.pending ? (
                    <span className="flex items-center gap-2 text-slate-300">
                      <Loader2 size={14} className="animate-spin" /> Thinking…
                    </span>
                  ) : (
                    <NovaText text={m.text} />
                  )}

                  {m.pdfs?.map((pdf, i) => (
                    <button
                      key={i}
                      onClick={() => downloadNovaPdf(pdf)}
                      className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-700/70 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-slate-700"
                    >
                      <Download size={13} /> {pdf.filename}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Live transcript while listening */}
            {listening && interim && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-sky-600/40 px-3.5 py-2.5 text-[13.5px] italic text-white">
                  {interim}
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-white/5 px-3 py-3">
            {attachment && (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300">
                <Paperclip size={12} />
                <span className="flex-1 truncate">{attachment.name}</span>
                <button onClick={() => setAttachment(null)} className="text-slate-400 hover:text-slate-200">
                  <X size={13} />
                </button>
              </div>
            )}
            {error && <div className="mb-2 text-xs text-rose-400">{error}</div>}
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach a transcript, PDF or image"
                className="mb-1 rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200"
              >
                <Paperclip size={17} />
              </button>
              {micSupported && (
                <button
                  onClick={onMic}
                  title={listening ? "Stop listening" : "Talk to Nova"}
                  className={
                    "mb-1 rounded-md p-1.5 transition-colors " +
                    (listening
                      ? "bg-rose-500/20 text-rose-300 animate-pulse"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200")
                  }
                >
                  <Mic size={17} />
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={onPickFile}
              />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder={listening ? "Listening…" : "Ask Nova anything…"}
                className="max-h-28 flex-1 resize-none rounded-xl bg-slate-800 px-3 py-2 text-[13.5px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <button
                onClick={submit}
                disabled={loading || (!input.trim() && !attachment)}
                className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40"
                style={{ background: ACCENT }}
                title="Send"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Minimal markdown: bold + line breaks. Keeps the bundle dependency-free. */
function NovaText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
