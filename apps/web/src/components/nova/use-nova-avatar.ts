"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api/client";

// Ported from astrasolar-app's D-ID integration. Uses the D-ID Agents SDK
// (@d-id/client-sdk) over WebRTC: createAgentManager(agentId, { auth, callbacks,
// streamOptions }) → connect() yields a MediaStream for the <video>, and
// speak({type:'text'}) makes the avatar lip-sync Nova's reply. The agent's voice
// (the ElevenLabs Nova voice) is configured on D-ID's side, so when the avatar
// is live it speaks — the widget skips its own TTS to avoid double audio.

export type AvatarStatus = "idle" | "connecting" | "connected" | "error";

interface AvatarConfig {
  configured: boolean;
  agentId: string;
  clientKey: string;
}

let _sdkPromise: Promise<any> | null = null;
async function loadDidSdk(): Promise<any> {
  if (_sdkPromise) return _sdkPromise;
  _sdkPromise = (async () => {
    try {
      return await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@d-id/client-sdk/+esm" as string);
    } catch {
      return await import(/* webpackIgnore: true */ "https://unpkg.com/@d-id/client-sdk?module" as string);
    }
  })();
  return _sdkPromise;
}

export function useNovaAvatar() {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<AvatarStatus>("idle");
  const [speaking, setSpeaking] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const managerRef = useRef<any>(null);
  const configRef = useRef<AvatarConfig | null>(null);

  // Discover whether D-ID is configured (server-held credentials).
  useEffect(() => {
    let cancelled = false;
    apiGet<AvatarConfig>("/nova/avatar-config")
      .then((cfg) => {
        if (!cancelled) {
          configRef.current = cfg;
          setAvailable(!!cfg.configured);
        }
      })
      .catch(() => {
        /* avatar simply stays unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const disconnect = useCallback(() => {
    if (managerRef.current) {
      try {
        managerRef.current.disconnect();
      } catch {
        /* ignore */
      }
      managerRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setSpeaking(false);
    setStatus("idle");
  }, []);

  const connect = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg?.configured || managerRef.current) return;
    setStatus("connecting");
    try {
      const sdk = await loadDidSdk();
      const createFn =
        sdk.createAgentManager || (sdk.default && sdk.default.createAgentManager);
      if (!createFn) throw new Error("D-ID SDK: createAgentManager not found");

      const callbacks = {
        onSrcObjectReady: (stream: MediaStream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.muted = false;
          }
        },
        onConnectionStateChange: (state: string) => {
          if (state === "connected") setStatus("connected");
          else if (["disconnected", "closed", "fail"].includes(state)) {
            setStatus(state === "fail" ? "error" : "idle");
            setSpeaking(false);
          }
        },
        onVideoStateChange: (state: string) => setSpeaking(state !== "STOP"),
        onNewMessage: () => {},
        onError: () => {
          setStatus("error");
          setSpeaking(false);
        },
      };

      managerRef.current = await createFn(cfg.agentId, {
        auth: { type: "key", clientKey: cfg.clientKey },
        callbacks,
        streamOptions: { compatibilityMode: "auto", streamWarmup: true },
      });
      await managerRef.current.connect();
    } catch {
      setStatus("error");
      managerRef.current = null;
    }
  }, []);

  // Make the avatar speak a line (used in place of TTS while connected).
  const speak = useCallback((text: string) => {
    const mgr = managerRef.current;
    if (!mgr || !text.trim()) return;
    try {
      mgr.speak({ type: "text", input: text.slice(0, 1000) });
    } catch {
      /* ignore — connection may have dropped */
    }
  }, []);

  // Tear down on unmount.
  useEffect(() => () => disconnect(), [disconnect]);

  const connected = status === "connected";
  return { available, status, connected, speaking, videoRef, connect, disconnect, speak };
}
