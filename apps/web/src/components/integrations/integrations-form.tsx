"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  Phone,
  Sheet,
  Sparkles,
  Loader2,
  Check,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPatch } from "@/lib/api/client";

// Mirrors the API's IntegrationSettingsService.status() shape. Secrets are
// reported only as booleans; non-secret identifiers come back in full.
interface IntegrationsStatus {
  clicksend: { username: string; apiKeyConfigured: boolean; configured: boolean };
  aircall: { apiId: string; apiTokenConfigured: boolean; configured: boolean };
  sheets: {
    spreadsheetId: string;
    apiKeyConfigured: boolean;
    configured: boolean;
  };
  anthropic: { apiKeyConfigured: boolean; configured: boolean };
}

/**
 * Integrations panel — CEO / Super Admin / Finance manage third-party API keys
 * (ClickSend, Aircall, Google Sheets, Anthropic) here instead of env vars. A
 * stored value overrides the matching env var. Secrets are write-only: the
 * server reports only whether each is set; leaving a secret field blank keeps
 * the existing value.
 */
export function IntegrationsForm() {
  const [status, setStatus] = useState<IntegrationsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [clicksendUsername, setClicksendUsername] = useState("");
  const [clicksendApiKey, setClicksendApiKey] = useState("");
  const [aircallApiId, setAircallApiId] = useState("");
  const [aircallApiToken, setAircallApiToken] = useState("");
  const [sheetsApiKey, setSheetsApiKey] = useState("");
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiGet<IntegrationsStatus>("/integrations/settings");
      setStatus(s);
      // Pre-fill the non-secret identifiers so they can be edited in place.
      setClicksendUsername(s.clicksend.username ?? "");
      setAircallApiId(s.aircall.apiId ?? "");
      setSheetsSpreadsheetId(s.sheets.spreadsheetId ?? "");
    } catch {
      setError("Could not load integration settings.");
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
    setError(null);
    try {
      // Non-secret identifiers are always sent; secret fields only when typed.
      const body: Record<string, string> = {
        clicksendUsername,
        aircallApiId,
        sheetsSpreadsheetId,
      };
      if (clicksendApiKey.trim()) body.clicksendApiKey = clicksendApiKey.trim();
      if (aircallApiToken.trim()) body.aircallApiToken = aircallApiToken.trim();
      if (sheetsApiKey.trim()) body.sheetsApiKey = sheetsApiKey.trim();
      if (anthropicApiKey.trim()) body.anthropicApiKey = anthropicApiKey.trim();

      const s = await apiPatch<IntegrationsStatus>(
        "/integrations/settings",
        body,
      );
      setStatus(s);
      setClicksendApiKey("");
      setAircallApiToken("");
      setSheetsApiKey("");
      setAnthropicApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Failed to save. Please try again.");
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
      {/* ClickSend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-sky-500" />
            ClickSend (SMS)
            <StatusPill ok={!!status?.clicksend.configured} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="cs-username">Username</Label>
            <Input
              id="cs-username"
              value={clicksendUsername}
              onChange={(e) => setClicksendUsername(e.target.value)}
              placeholder="ClickSend account username"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cs-key">API key</Label>
            <Input
              id="cs-key"
              type="password"
              value={clicksendApiKey}
              onChange={(e) => setClicksendApiKey(e.target.value)}
              placeholder={
                status?.clicksend.apiKeyConfigured
                  ? "•••••••• (set — leave blank to keep)"
                  : "Paste your ClickSend API key"
              }
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      {/* Aircall */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-sky-500" />
            Aircall (Calls)
            <StatusPill ok={!!status?.aircall.configured} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="ac-id">API ID</Label>
            <Input
              id="ac-id"
              value={aircallApiId}
              onChange={(e) => setAircallApiId(e.target.value)}
              placeholder="Aircall API ID"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ac-token">API token</Label>
            <Input
              id="ac-token"
              type="password"
              value={aircallApiToken}
              onChange={(e) => setAircallApiToken(e.target.value)}
              placeholder={
                status?.aircall.apiTokenConfigured
                  ? "•••••••• (set — leave blank to keep)"
                  : "Paste your Aircall API token"
              }
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      {/* Google Sheets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sheet className="h-4 w-4 text-sky-500" />
            Google Sheets (Lead intake)
            <StatusPill ok={!!status?.sheets.configured} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="gs-key">API key</Label>
            <Input
              id="gs-key"
              type="password"
              value={sheetsApiKey}
              onChange={(e) => setSheetsApiKey(e.target.value)}
              placeholder={
                status?.sheets.apiKeyConfigured
                  ? "•••••••• (set — leave blank to keep)"
                  : "Google Sheets API key"
              }
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gs-id">Spreadsheet ID</Label>
            <Input
              id="gs-id"
              value={sheetsSpreadsheetId}
              onChange={(e) => setSheetsSpreadsheetId(e.target.value)}
              placeholder="e.g. 1AbC…the long id from the sheet URL"
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      {/* Anthropic */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-500" />
            Anthropic (Nova AI)
            <StatusPill ok={!!status?.anthropic.configured} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="an-key">API key</Label>
            <Input
              id="an-key"
              type="password"
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              placeholder={
                status?.anthropic.apiKeyConfigured
                  ? "•••••••• (set — leave blank to keep)"
                  : "sk-ant-…"
              }
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Powers Nova. A stored key overrides the server environment key.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (ok
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-amber-500/10 text-amber-600")
      }
    >
      {ok ? "Connected" : "Not configured"}
    </span>
  );
}
