"use client";

import * as React from "react";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  MessageSquare,
  Plus,
  Send,
  Settings2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MOCK_SMS_CONFIG,
  MOCK_SMS_LOG,
  MOCK_SMS_TEMPLATES,
  type SmsDeliveryStatus,
  type SmsTemplate,
} from "@/lib/leads/mock";
import { cn } from "@/lib/utils";
import {
  DataTable,
  Kpi,
  KpiRow,
  PageHeader,
  SearchInput,
  Section,
  StatusBadge,
  SubTabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeTone,
} from "./shared";

const STATUS_TONE: Record<SmsDeliveryStatus, BadgeTone> = {
  queued: "neutral",
  sent: "info",
  delivered: "success",
  failed: "danger",
  undelivered: "warning",
};

const CATEGORY_TONE: Record<SmsTemplate["category"], BadgeTone> = {
  booking: "primary",
  reminder: "info",
  "follow-up": "warning",
  marketing: "purple",
};

export function SmsIntegrationTab() {
  const [tab, setTab] = React.useState<
    "templates" | "log" | "automations" | "settings"
  >("templates");
  const [selected, setSelected] = React.useState<SmsTemplate | null>(
    MOCK_SMS_TEMPLATES[0],
  );
  const [search, setSearch] = React.useState("");

  const config = MOCK_SMS_CONFIG;
  const usedPct = Math.round((config.monthlySent / config.monthlyLimit) * 100);
  const delivered = MOCK_SMS_LOG.filter((l) => l.status === "delivered").length;
  const failed = MOCK_SMS_LOG.filter(
    (l) => l.status === "failed" || l.status === "undelivered",
  ).length;
  const deliveryRate = MOCK_SMS_LOG.length
    ? Math.round((delivered / MOCK_SMS_LOG.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads · Messaging"
        title="SMS Integration"
        description="Configure ClickSend, manage templates, see delivery logs, and tune automations."
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-2">
              <Send className="h-4 w-4" />
              Bulk send
            </Button>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New template
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi
          label="Provider"
          value={config.connected ? "Connected" : "Disconnected"}
          hint={`Provider: ${config.provider}`}
          icon={<Settings2 className="h-4 w-4" />}
          tone={config.connected ? "success" : "danger"}
        />
        <Kpi
          label="Monthly volume"
          value={`${config.monthlySent.toLocaleString()} / ${config.monthlyLimit.toLocaleString()}`}
          hint={`${usedPct}% of allowance used`}
          icon={<MessageSquare className="h-4 w-4" />}
          tone="primary"
        />
        <Kpi
          label="Delivery rate"
          value={`${deliveryRate}%`}
          hint={`${delivered} of ${MOCK_SMS_LOG.length} delivered`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
        />
        <Kpi
          label="Failed (24h)"
          value={failed}
          hint="Failed + undelivered"
          icon={<XCircle className="h-4 w-4" />}
          tone={failed > 5 ? "danger" : "warning"}
        />
      </KpiRow>

      <SubTabs
        value={tab}
        onChange={(v) =>
          setTab(v as "templates" | "log" | "automations" | "settings")
        }
        tabs={[
          { key: "templates", label: "Templates", count: MOCK_SMS_TEMPLATES.length },
          { key: "log", label: "Message log", count: MOCK_SMS_LOG.length },
          { key: "automations", label: "Automations", count: 4 },
          { key: "settings", label: "Settings" },
        ]}
      />

      {tab === "templates" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Section
            title="Templates"
            actions={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search templates…"
                className="w-48"
              />
            }
            flush
          >
            <ul className="divide-y">
              {MOCK_SMS_TEMPLATES.filter((t) =>
                t.name.toLowerCase().includes(search.toLowerCase()),
              ).map((t) => {
                const active = selected?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className={cn(
                        "w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-muted/40 transition-colors",
                        active && "bg-primary/5 border-l-2 border-l-primary",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">{t.name}</span>
                          <StatusBadge tone={CATEGORY_TONE[t.category]}>
                            {t.category}
                          </StatusBadge>
                          {!t.active && (
                            <StatusBadge tone="neutral">Paused</StatusBadge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {t.body}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                          Sent 30d: {t.sent30d.toLocaleString()}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
          {selected && (
            <Section
              title={selected.name}
              description={`${selected.body.length} characters · ${Math.ceil(
                selected.body.length / 160,
              )} SMS segment${selected.body.length > 160 ? "s" : ""}`}
              actions={
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Send test
                  </Button>
                  <Button size="sm">Save</Button>
                </div>
              }
            >
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Category
                  </label>
                  <select
                    defaultValue={selected.category}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="booking">Booking</option>
                    <option value="reminder">Reminder</option>
                    <option value="follow-up">Follow-up</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Message body
                  </label>
                  <textarea
                    rows={6}
                    defaultValue={selected.body}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
                    Placeholders detected
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.placeholders.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        None — static text only.
                      </span>
                    ) : (
                      selected.placeholders.map((p) => (
                        <code
                          key={p}
                          className="rounded-md bg-muted px-2 py-0.5 text-xs"
                        >
                          {`{{${p}}}`}
                        </code>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Preview
                    </span>
                  </div>
                  <p className="text-sm">{renderPreview(selected.body)}</p>
                </div>
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === "log" && (
        <Section
          title="Recent messages"
          description="Most recent first. Failures show the carrier reason."
          flush
        >
          <DataTable scroll maxHeight="calc(100vh - 430px)">
            <THead>
              <tr>
                <TH>Sent</TH>
                <TH>To</TH>
                <TH>Customer</TH>
                <TH>Template</TH>
                <TH>Preview</TH>
                <TH>Status</TH>
                <TH align="right">Cost</TH>
              </tr>
            </THead>
            <TBody>
              {MOCK_SMS_LOG.map((m) => (
                <TR key={m.id}>
                  <TD className="text-xs text-muted-foreground whitespace-nowrap">
                    {relativeTime(m.sentAt)}
                  </TD>
                  <TD className="tabular-nums whitespace-nowrap">{m.to}</TD>
                  <TD>{m.customer}</TD>
                  <TD>
                    <span className="text-sm text-muted-foreground">
                      {m.templateName}
                    </span>
                  </TD>
                  <TD className="text-xs text-muted-foreground line-clamp-1 max-w-[280px]">
                    {m.bodyPreview}
                  </TD>
                  <TD>
                    <StatusBadge tone={STATUS_TONE[m.status]} variant="soft" dot>
                      {m.status}
                    </StatusBadge>
                    {m.errorMessage && (
                      <div className="text-xs text-destructive mt-0.5 line-clamp-1 max-w-[200px]">
                        {m.errorMessage}
                      </div>
                    )}
                  </TD>
                  <TD align="right" className="tabular-nums">
                    ${m.cost.toFixed(2)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        </Section>
      )}

      {tab === "automations" && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              name: "Booking confirmation",
              trigger: "When an appointment is booked",
              template: "Booking Confirmation",
              delay: "Immediately",
              active: true,
            },
            {
              name: "24-hour reminder",
              trigger: "Appointment in 24 hours",
              template: "24h Reminder",
              delay: "24h before",
              active: true,
            },
            {
              name: "1-hour reminder",
              trigger: "Appointment in 1 hour",
              template: "1h Reminder",
              delay: "1h before",
              active: true,
            },
            {
              name: "No-answer follow-up",
              trigger: "Lead marked no answer",
              template: "No Answer Follow-Up",
              delay: "2h after",
              active: false,
            },
          ].map((a) => (
            <Section
              key={a.name}
              title={a.name}
              actions={
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={a.active}
                    className="sr-only peer"
                  />
                  <span className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors relative">
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                        a.active && "translate-x-4",
                      )}
                    />
                  </span>
                </label>
              }
            >
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    Trigger
                  </dt>
                  <dd className="mt-1">{a.trigger}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    Send timing
                  </dt>
                  <dd className="mt-1 inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {a.delay}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                    Template
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge tone="primary">{a.template}</StatusBadge>
                  </dd>
                </div>
              </dl>
            </Section>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <Section title="Provider configuration">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Provider
              </label>
              <select
                defaultValue={config.provider}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="clicksend">ClickSend</option>
                <option value="twilio">Twilio</option>
                <option value="messagebird">MessageBird</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                API Key
              </label>
              <input
                type="password"
                defaultValue={config.apiKeyMasked}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Default sender ID
              </label>
              <input
                type="text"
                defaultValue={config.defaultSenderId}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums uppercase tracking-wider"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Monthly limit
              </label>
              <input
                type="number"
                defaultValue={config.monthlyLimit}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-emerald-500" />
              Connection healthy — last ping{" "}
              <span className="tabular-nums">3m ago</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">Test connection</Button>
              <Button>Save</Button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function renderPreview(body: string): string {
  return body
    .replace(/\{\{firstName\}\}/g, "Hugh")
    .replace(/\{\{consultantName\}\}/g, "Aaron Whitlock")
    .replace(/\{\{consultantPhone\}\}/g, "0412 998 221")
    .replace(/\{\{date\}\}/g, "Wed 28 May")
    .replace(/\{\{time\}\}/g, "2:00 PM")
    .replace(/\{\{address\}\}/g, "47 Sunshine Cres, Sandy Bay");
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
