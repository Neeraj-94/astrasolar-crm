"use client";

import { useCallback, useEffect, useState } from "react";
import { Volume2, UserCircle2, Loader2, Check, Save } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api/client";

interface SettingsStatus {
  elevenLabsKeyConfigured: boolean;
  voiceId: string;
  ttsModel: string;
  didAgentId: string;
  didClientKeyConfigured: boolean;
  avatarConfigured: boolean;
}

/**
 * Voice & Avatar settings — the AI_CONFIG port. CEO / Super Admin manages the
 * ElevenLabs key and D-ID agent credentials here instead of env vars. Secrets
 * are write-only: the server reports only whether each is set; leaving a secret
 * field blank keeps the existing value.
 */
export function NovaSettingsPanel() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [elevenKey, setElevenKey] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [ttsModel, setTtsModel] = useState("");
  const [agentId, setAgentId] = useState("");
  const [clientKey, setClientKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiGet<SettingsStatus>("/nova/settings");
      setStatus(s);
      setVoiceId(s.voiceId);
      setTtsModel(s.ttsModel);
      setAgentId(s.didAgentId);
    } catch {
      /* gated route — shouldn't happen */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, string> = {
        voiceId,
        ttsModel,
        didAgentId: agentId,
      };
      // Secret fields: only send when the user typed something.
      if (elevenKey.trim()) body.elevenLabsApiKey = elevenKey.trim();
      if (clientKey.trim()) body.didClientKey = clientKey.trim();
      const s = await apiPatch<SettingsStatus>("/nova/settings", body);
      setStatus(s);
      setElevenKey("");
      setClientKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Voice */}
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-sky-500" />
          <h2 className="text-sm font-medium">Voice (ElevenLabs)</h2>
          <StatusPill ok={!!status?.elevenLabsKeyConfigured} okLabel="Key set" offLabel="Using browser voice" />
        </div>
        <Field label="ElevenLabs API key">
          <input
            type="password"
            className="input w-full"
            placeholder={status?.elevenLabsKeyConfigured ? "•••••••• (set — leave blank to keep)" : "Paste key to enable the premium Nova voice"}
            value={elevenKey}
            onChange={(e) => setElevenKey(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Voice ID">
            <input className="input w-full" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} />
          </Field>
          <Field label="Model">
            <input className="input w-full" value={ttsModel} onChange={(e) => setTtsModel(e.target.value)} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Defaults match the original Nova voice. Leave the key blank and Nova uses the free browser voice.
        </p>
      </section>

      {/* Avatar */}
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserCircle2 className="h-4 w-4 text-sky-500" />
          <h2 className="text-sm font-medium">Animated avatar (D-ID)</h2>
          <StatusPill ok={!!status?.avatarConfigured} okLabel="Configured" offLabel="Not set" />
        </div>
        <Field label="D-ID Agent ID">
          <input className="input w-full" placeholder="agt_…" value={agentId} onChange={(e) => setAgentId(e.target.value)} />
        </Field>
        <Field label="D-ID Client Key">
          <input
            type="password"
            className="input w-full"
            placeholder={status?.didClientKeyConfigured ? "•••••••• (set — leave blank to keep)" : "Client key from D-ID Studio"}
            value={clientKey}
            onChange={(e) => setClientKey(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <p className="mt-2 text-xs text-muted-foreground">
          Create an Agent in D-ID Studio with the Nova presenter + the ElevenLabs Nova voice, then paste its
          Agent ID and Client Key. The avatar button then appears in Nova&apos;s header.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>

      <style jsx>{`
        .input {
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 1px rgb(14 165 233);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ ok, okLabel, offLabel }: { ok: boolean; okLabel: string; offLabel: string }) {
  return (
    <span
      className={
        "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (ok ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600")
      }
    >
      {ok ? okLabel : offLabel}
    </span>
  );
}
