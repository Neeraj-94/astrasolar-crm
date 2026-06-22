// Nova text-to-speech. Tries the server ElevenLabs proxy (/api/v1/nova/speak)
// for the premium Nova voice; if it returns 204 (not configured) or fails, falls
// back to the browser's built-in speechSynthesis. A single active utterance is
// tracked so we can stop Nova mid-sentence.

let currentAudio: HTMLAudioElement | null = null;

/** Stop any in-progress Nova speech (audio element or browser synthesis). */
export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakWithBrowser(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-AU";
  u.rate = 1.02;
  u.pitch = 1.0;
  // Prefer an Australian/English female-ish voice if available.
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /en-AU/i.test(v.lang)) ||
    voices.find((v) => /en-GB/i.test(v.lang)) ||
    voices.find((v) => /en/i.test(v.lang));
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

/**
 * Speak `text` aloud. Resolves once playback has started (not finished).
 * Strips markdown so the voice doesn't read out asterisks/symbols.
 */
export async function speak(text: string): Promise<void> {
  const clean = stripForSpeech(text);
  if (!clean) return;
  stopSpeaking();

  try {
    const res = await fetch("/api/v1/nova/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text: clean }),
    });

    // 204 → ElevenLabs not configured server-side: use the browser voice.
    if (res.status === 204 || !res.ok) {
      speakWithBrowser(clean);
      return;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("audio")) {
      speakWithBrowser(clean);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    await audio.play();
  } catch {
    // Network/permission hiccup — fall back to the browser voice.
    speakWithBrowser(clean);
  }
}

/** Remove markdown / PDF fences / symbols so speech sounds natural. */
function stripForSpeech(text: string): string {
  return (text || "")
    .replace(/\[\[PDF:[^\]]*\]\][\s\S]*?\[\[\/PDF\]\]/g, " (I've prepared a PDF you can download.) ")
    .replace(/\*\*/g, "")
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
