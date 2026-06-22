"use client";

import * as React from "react";
import { LifeBuoy, CheckCircle2, Clock } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { Section } from "@/components/leads/shared";
import { shortDate } from "@/components/dashboards/financials/format";

interface SupportResponse {
  issues: {
    id: string;
    issueNotes: string | null;
    solution: string | null;
    handledBy: string | null;
    resolved: boolean;
    loggedAt: string;
  }[];
}

export function CustomerSupportTab() {
  const res = useApi<SupportResponse>("/customer/support");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  const issues = res.data?.issues ?? [];

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/customer/support", {
        method: "POST",
        body: JSON.stringify({ message: message.trim() }),
      });
      setMessage("");
      setSent(true);
      await res.reload();
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Section
        title="Raise a Support Request"
        description="Tell us about any issue with your system and our team will follow up."
      >
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Describe your issue…"
          className="w-full rounded-md border bg-card p-3 text-sm"
        />
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
        {sent && (
          <p className="mt-2 text-xs text-emerald-600">
            Request submitted — we&apos;ll be in touch.
          </p>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !message.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Submit Request"}
          </button>
        </div>
      </Section>

      <Section
        title="Your Requests"
        actions={<LifeBuoy className="h-5 w-5 text-muted-foreground" />}
      >
        {res.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : issues.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No support requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {issues.map((i) => (
              <div key={i.id} className="rounded-lg border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex-1 text-sm">{i.issueNotes}</p>
                  <span
                    className={`flex shrink-0 items-center gap-1 text-xs font-medium ${i.resolved ? "text-emerald-600" : "text-amber-600"}`}
                  >
                    {i.resolved ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    {i.resolved ? "Resolved" : "Open"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Logged {shortDate(i.loggedAt)}
                  {i.handledBy ? ` · ${i.handledBy}` : ""}
                </div>
                {i.solution && (
                  <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
                    <span className="font-medium">Resolution: </span>
                    {i.solution}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
