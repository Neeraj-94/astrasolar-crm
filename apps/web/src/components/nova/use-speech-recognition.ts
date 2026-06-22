"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The Web Speech API (SpeechRecognition) isn't in the standard TS lib, so we
// type the bits we use loosely. It runs entirely in the browser — no API key —
// and is well supported in Chrome/Edge (webkit-prefixed).
type AnyRecognition = any;

function getRecognitionCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

interface Options {
  /** Called with the final transcript when the user stops speaking. */
  onFinal?: (text: string) => void;
}

/**
 * Push-to-talk speech recognition. `start()` begins listening; `interim` shows
 * the live partial transcript; when a final result arrives we stop and call
 * onFinal. Designed for a tap-to-talk mic button.
 */
export function useSpeechRecognition({ onFinal }: Options = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<AnyRecognition>(null);
  const finalRef = useRef("");

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setSupported(true);
    const rec: AnyRecognition = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-AU";

    rec.onresult = (event: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        finalRef.current = finalText.trim();
        setInterim("");
      }
    };
    rec.onerror = () => {
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      const text = finalRef.current;
      finalRef.current = "";
      if (text && onFinal) onFinal(text);
    };

    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
    // onFinal is intentionally not a dep — we keep one recognition instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec || listening) return;
    finalRef.current = "";
    setInterim("");
    try {
      rec.start();
      setListening(true);
    } catch {
      /* already started — ignore */
    }
  }, [listening]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  }, []);

  return { supported, listening, interim, start, stop };
}
