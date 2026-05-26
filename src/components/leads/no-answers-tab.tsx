"use client";

import * as React from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Download,
  PhoneCall,
  PhoneIncoming,
  RefreshCw,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CONSULTANTS,
  LEAD_GEN_AGENTS,
  MOCK_NO_ANSWERS,
  type ConsultantDisposition,
  type NoAnswerLead,
  type NoAnswerStatus,
} from "@/lib/leads/mock";
import { cn } from "@/lib/utils";
import {
  ConsultantAvatar,
  DataTable,
  Kpi,
  KpiRow,
  MultiSelect,
  PageHeader,
  SearchInput,
  Section,
  StatusBadge,
  SubTabs,
  TBody,
  TD,
  TH,
  THead,
  Toolbar,
  TR,
  type BadgeTone,
} from "./shared";

const STATUS_TONE: Record<NoAnswerStatus, BadgeTone> = {
  pending: "warning",
  in_progress: "info",
  rebooked: "success",
  closed: "neutral",
};
const STATUS_LABEL: Record<NoAnswerStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  rebooked: "Rebooked",
  closed: "Closed",
};
const DISP_LABEL: Record<ConsultantDisposition, string> = {
  cancel: "Cancel",
  reschedule: "Reschedule",
  dnq: "DNQ",
  not_interested: "Not interested",
  no_answer: "No answer",
};
const DISP_TONE: Record<ConsultantDisposition, BadgeTone> = {
  cancel: "danger",
  reschedule: "warning",
  dnq: "danger",
  not_interested: "danger",
  no_answer: "neutral",
};

const OUTCOME_TONE: Record<string, BadgeTone> = {
  Booked: "success",
  "Callback Scheduled": "info",
  "No Answer": "warning",
  "Wrong Number": "neutral",
  "Not Interested": "danger",
  "Do Not Call": "danger",
};

interface Filters {
  reps: string[];
  consultants: string[];
  statuses: string[];
  sources: string[];
  outcomes: string[];
  dispositions: string[];
  search: string;
}

const EMPTY: Filters = {
  reps: [],
  consultants: [],
  statuses: [],
  sources: [],
  outcomes: [],
  dispositions: [],
  search: "",
};

const STATUS_TABS: Array<{ key: NoAnswerStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "rebooked", label: "Rebooked" },
  { key: "closed", label: "Closed" },
];

export function NoAnswersTab() {
  const [filters, setFilters] = React.useState<Filters>(EMPTY);
  const [statusTab, setStatusTab] = React.useState<NoAnswerStatus | "all">(
    "all",
  );
  const [selected, setSelected] = React.useState<NoAnswerLead | null>(null);

  const repOptions = React.useMemo(
    () =>
      LEAD_GEN_AGENTS.map((a) => ({
        value: a.id,
        label: a.name,
        count: MOCK_NO_ANSWERS.filter((l) => l.leadGenRepId === a.id).length,
      })),
    [],
  );
  const consultantOptions = React.useMemo(
    () =>
      CONSULTANTS.map((c) => ({
        value: c.id,
        label: c.name,
        count: MOCK_NO_ANSWERS.filter((l) => l.consultantId === c.id).length,
      })),
    [],
  );
  const sourceOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    MOCK_NO_ANSWERS.forEach((l) =>
      counts.set(l.source, (counts.get(l.source) ?? 0) + 1),
    );
    return Array.from(counts.entries()).map(([s, c]) => ({
      value: s,
      label: s,
      count: c,
    }));
  }, []);
  const outcomeOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    MOCK_NO_ANSWERS.forEach((l) =>
      counts.set(l.outcome || "(none)", (counts.get(l.outcome || "(none)") ?? 0) + 1),
    );
    return Array.from(counts.entries()).map(([s, c]) => ({
      value: s,
      label: s,
      count: c,
    }));
  }, []);
  const dispOptions = (Object.keys(DISP_LABEL) as ConsultantDisposition[]).map(
    (d) => ({
      value: d,
      label: DISP_LABEL[d],
      count: MOCK_NO_ANSWERS.filter((l) => l.consultantDisposition === d).length,
    }),
  );

  const visible = React.useMemo(() => {
    return MOCK_NO_ANSWERS.filter((l) => {
      if (statusTab !== "all" && l.status !== statusTab) return false;
      if (filters.reps.length && !filters.reps.includes(l.leadGenRepId))
        return false;
      if (
        filters.consultants.length &&
        !filters.consultants.includes(l.consultantId)
      )
        return false;
      if (filters.sources.length && !filters.sources.includes(l.source))
        return false;
      if (
        filters.outcomes.length &&
        !filters.outcomes.includes(l.outcome || "(none)")
      )
        return false;
      if (
        filters.dispositions.length &&
        !filters.dispositions.includes(l.consultantDisposition)
      )
        return false;
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        if (
          !l.customerName.toLowerCase().includes(q) &&
          !l.phone.includes(q) &&
          !(l.suburb || "").toLowerCase().includes(q) &&
          !(l.email || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      // Pending first, most-recent first
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [filters, statusTab]);

  const kpi = React.useMemo(() => {
    const all = MOCK_NO_ANSWERS;
    return {
      pending: all.filter((l) => l.status === "pending").length,
      inProgress: all.filter((l) => l.status === "in_progress").length,
      rebooked: all.filter((l) => l.status === "rebooked").length,
      avgDials:
        Math.round(
          (all.reduce((s, l) => s + l.dialCount, 0) / all.length) * 10,
        ) / 10,
    };
  }, []);

  const tabCounts = React.useMemo(() => {
    const out: Record<string, number> = { all: MOCK_NO_ANSWERS.length };
    (["pending", "in_progress", "rebooked", "closed"] as NoAnswerStatus[]).forEach(
      (s) => {
        out[s] = MOCK_NO_ANSWERS.filter((l) => l.status === s).length;
      },
    );
    return out;
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads · Follow-up queue"
        title="No Answers"
        description="Leads where the consultant could not reach the customer. Triage, call back, and rebook."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Backfill from 23 Mar
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi
          label="Pending"
          value={kpi.pending}
          hint="Awaiting first call back"
          icon={<AlertCircle className="h-4 w-4" />}
          tone="warning"
        />
        <Kpi
          label="In progress"
          value={kpi.inProgress}
          hint="Callback scheduled or partially worked"
          icon={<Timer className="h-4 w-4" />}
          tone="primary"
        />
        <Kpi
          label="Rebooked"
          value={kpi.rebooked}
          hint="Successfully re-engaged"
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="success"
          delta={{ value: "+5%", direction: "up" }}
        />
        <Kpi
          label="Avg dials per lead"
          value={kpi.avgDials}
          hint="Across the full queue"
          icon={<PhoneCall className="h-4 w-4" />}
          tone="default"
        />
      </KpiRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubTabs
          tabs={STATUS_TABS.map((t) => ({
            key: t.key,
            label: t.label,
            count: tabCounts[t.key],
          }))}
          value={statusTab}
          onChange={(v) => setStatusTab(v as NoAnswerStatus | "all")}
        />
        <SearchInput
          value={filters.search}
          onChange={(v) => setFilters({ ...filters, search: v })}
          placeholder="Search name, phone, suburb…"
          className="w-80"
        />
      </div>

      <Toolbar
        left={
          <>
            <MultiSelect
              label="Rep"
              options={repOptions}
              value={filters.reps}
              onChange={(v) => setFilters({ ...filters, reps: v })}
            />
            <MultiSelect
              label="Consultant"
              options={consultantOptions}
              value={filters.consultants}
              onChange={(v) => setFilters({ ...filters, consultants: v })}
            />
            <MultiSelect
              label="Source"
              options={sourceOptions}
              value={filters.sources}
              onChange={(v) => setFilters({ ...filters, sources: v })}
            />
            <MultiSelect
              label="Outcome"
              options={outcomeOptions}
              value={filters.outcomes}
              onChange={(v) => setFilters({ ...filters, outcomes: v })}
            />
            <MultiSelect
              label="Disposition"
              options={dispOptions}
              value={filters.dispositions}
              onChange={(v) => setFilters({ ...filters, dispositions: v })}
            />
            {(filters.reps.length > 0 ||
              filters.consultants.length > 0 ||
              filters.sources.length > 0 ||
              filters.outcomes.length > 0 ||
              filters.dispositions.length > 0 ||
              filters.search) && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY)}
                className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            )}
          </>
        }
      />

      <Section
        title={`${visible.length} ${visible.length === 1 ? "lead" : "leads"} to follow up`}
        description="Sorted with pending leads first, newest first within each group."
        flush
      >
        <DataTable scroll maxHeight="calc(100vh - 480px)">
          <THead>
            <tr>
              <TH>Customer</TH>
              <TH>Contact</TH>
              <TH>Lead Gen Rep</TH>
              <TH>Consultant</TH>
              <TH>Disposition</TH>
              <TH>Company</TH>
              <TH>Source</TH>
              <TH>Outcome</TH>
              <TH align="right">Dials</TH>
              <TH>Original slot</TH>
              <TH>Status</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {visible.length === 0 ? (
              <tr>
                <TD colSpan={12} align="center" className="py-16">
                  <p className="text-muted-foreground">
                    No leads match the current filters.
                  </p>
                </TD>
              </tr>
            ) : (
              visible.map((l) => (
                <NoAnswerRow
                  key={l.id}
                  lead={l}
                  onSelect={() => setSelected(l)}
                />
              ))
            )}
          </TBody>
        </DataTable>
      </Section>

      {selected && (
        <NoAnswerDrawer lead={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function NoAnswerRow({
  lead,
  onSelect,
}: {
  lead: NoAnswerLead;
  onSelect: () => void;
}) {
  const rep = LEAD_GEN_AGENTS.find((a) => a.id === lead.leadGenRepId);
  const consultant = CONSULTANTS.find((c) => c.id === lead.consultantId);
  const outcomeTone = OUTCOME_TONE[lead.outcome] ?? "neutral";
  return (
    <TR>
      <TD>
        <div className="font-medium">{lead.customerName}</div>
        {lead.email && (
          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
            {lead.email}
          </div>
        )}
      </TD>
      <TD>
        <div className="tabular-nums">{lead.phone}</div>
        <div className="text-xs text-muted-foreground">
          {lead.suburb} {lead.state}
        </div>
      </TD>
      <TD>
        {rep ? (
          <div className="flex items-center gap-1.5">
            <ConsultantAvatar name={rep.name} size="xs" />
            <span className="text-sm">{rep.name.split(" ")[0]}</span>
          </div>
        ) : (
          "—"
        )}
      </TD>
      <TD>
        {consultant ? (
          <div className="flex items-center gap-1.5">
            <ConsultantAvatar name={consultant.name} size="xs" />
            <span className="text-sm">{consultant.name.split(" ")[0]}</span>
          </div>
        ) : (
          "—"
        )}
      </TD>
      <TD>
        <StatusBadge
          tone={DISP_TONE[lead.consultantDisposition]}
          variant="soft"
        >
          {DISP_LABEL[lead.consultantDisposition]}
        </StatusBadge>
      </TD>
      <TD>
        <StatusBadge tone={lead.company === "DC" ? "purple" : "primary"}>
          {lead.company}
        </StatusBadge>
      </TD>
      <TD className="text-xs text-muted-foreground">{lead.source}</TD>
      <TD>
        {lead.outcome ? (
          <StatusBadge tone={outcomeTone} variant="soft" dot>
            {lead.outcome}
          </StatusBadge>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
      </TD>
      <TD align="right">
        <span
          className={cn(
            "tabular-nums",
            lead.dialCount >= 4 &&
              "text-amber-600 dark:text-amber-400 font-semibold",
          )}
        >
          {lead.dialCount}
        </span>
      </TD>
      <TD>
        <div className="text-xs">
          {new Date(lead.originalDate).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}
          <span className="text-muted-foreground ml-1">
            @ {lead.originalHour}:00
          </span>
        </div>
      </TD>
      <TD>
        <StatusBadge tone={STATUS_TONE[lead.status]} variant="soft" dot>
          {STATUS_LABEL[lead.status]}
        </StatusBadge>
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 gap-1"
            onClick={onSelect}
          >
            <PhoneIncoming className="h-3.5 w-3.5" />
            Call back
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2 gap-1"
            onClick={onSelect}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Rebook
          </Button>
        </div>
      </TD>
    </TR>
  );
}

function NoAnswerDrawer({
  lead,
  onClose,
}: {
  lead: NoAnswerLead;
  onClose: () => void;
}) {
  const rep = LEAD_GEN_AGENTS.find((a) => a.id === lead.leadGenRepId);
  const consultant = CONSULTANTS.find((c) => c.id === lead.consultantId);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-md bg-card border-l shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <StatusBadge tone={STATUS_TONE[lead.status]} variant="soft" dot>
              {STATUS_LABEL[lead.status]}
            </StatusBadge>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-md hover:bg-accent inline-flex items-center justify-center text-muted-foreground"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <h3 className="text-xl font-semibold tracking-tight">
            {lead.customerName}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {lead.address}, {lead.suburb} {lead.state}
          </p>
        </div>
        <div className="p-6 space-y-5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Phone</Lbl>
              <p className="tabular-nums mt-1">{lead.phone}</p>
            </div>
            {lead.email && (
              <div>
                <Lbl>Email</Lbl>
                <p className="mt-1 truncate">{lead.email}</p>
              </div>
            )}
            <div>
              <Lbl>Lead Gen Rep</Lbl>
              <p className="mt-1">{rep?.name ?? "—"}</p>
            </div>
            <div>
              <Lbl>Consultant</Lbl>
              <p className="mt-1">{consultant?.name ?? "—"}</p>
            </div>
            <div>
              <Lbl>Dials</Lbl>
              <p className="mt-1 tabular-nums">{lead.dialCount}</p>
            </div>
            <div>
              <Lbl>Source</Lbl>
              <p className="mt-1">{lead.source}</p>
            </div>
            <div>
              <Lbl>Original date</Lbl>
              <p className="mt-1">
                {new Date(lead.originalDate).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                })}{" "}
                @ {lead.originalHour}:00
              </p>
            </div>
            <div>
              <Lbl>Disposition</Lbl>
              <p className="mt-1">{DISP_LABEL[lead.consultantDisposition]}</p>
            </div>
          </div>
          {lead.notes && (
            <div>
              <Lbl>Notes</Lbl>
              <p className="mt-1 rounded-md border bg-muted/40 p-3">
                {lead.notes}
              </p>
            </div>
          )}
          <div className="border-t pt-4 space-y-2">
            <Button className="w-full gap-2">
              <CalendarClock className="h-4 w-4" />
              Rebook appointment
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline">Mark as called</Button>
              <Button variant="outline">Reassign</Button>
            </div>
            <Button variant="ghost" className="w-full text-destructive">
              Close lead
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}
