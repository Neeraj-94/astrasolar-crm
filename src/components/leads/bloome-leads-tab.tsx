"use client";

import * as React from "react";
import {
  Bookmark,
  Download,
  PhoneIncoming,
  PhoneOff,
  RefreshCw,
  Shuffle,
  Sparkles,
  Tags,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BLOOME_LEADS_ACT,
  BLOOME_LEADS_TAS,
  LEAD_GEN_AGENTS,
  type BloomeLead,
  type Region,
} from "@/lib/leads/mock";
import { cn } from "@/lib/utils";
import {
  ConsultantAvatar,
  DataTable,
  Kpi,
  KpiRow,
  MultiSelect,
  PageHeader,
  Pagination,
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

const OUTCOME_TONE: Record<string, BadgeTone> = {
  Booked: "success",
  "No Answer": "warning",
  Callback: "info",
  Voicemail: "info",
  "Not Interested": "danger",
  DNQ: "danger",
  "Wrong Number": "neutral",
  "Do Not Call": "neutral",
};

const PRESETS: Array<{
  name: string;
  description: string;
  apply: (s: FilterState) => FilterState;
}> = [
  {
    name: "Untouched leads",
    description: "Zero dials, no outcome",
    apply: () => ({
      agentIds: [],
      dials: ["0"],
      outcomes: [""],
      companies: [],
      search: "",
    }),
  },
  {
    name: "Heavy no-answers",
    description: "3+ dials, still no contact",
    apply: () => ({
      agentIds: [],
      dials: ["3", "4", "5", "6", "7", "8+"],
      outcomes: ["No Answer"],
      companies: [],
      search: "",
    }),
  },
  {
    name: "Booked this period",
    description: "Booked, any agent",
    apply: () => ({
      agentIds: [],
      dials: [],
      outcomes: ["Booked"],
      companies: [],
      search: "",
    }),
  },
  {
    name: "Unallocated",
    description: "No Lead Gen agent assigned",
    apply: () => ({
      agentIds: ["__unassigned__"],
      dials: [],
      outcomes: [],
      companies: [],
      search: "",
    }),
  },
];

interface FilterState {
  agentIds: string[];
  dials: string[];
  outcomes: string[];
  companies: string[];
  search: string;
}

const EMPTY_FILTERS: FilterState = {
  agentIds: [],
  dials: [],
  outcomes: [],
  companies: [],
  search: "",
};

function dialBucket(dials: number): string {
  if (dials === 0) return "0";
  if (dials >= 8) return "8+";
  return String(dials);
}

export function BloomeLeadsTab() {
  const [region, setRegion] = React.useState<Region>("TAS");
  const [filters, setFilters] = React.useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [redistributeOpen, setRedistributeOpen] = React.useState(false);
  const [bulkAgent, setBulkAgent] = React.useState("");
  const [bulkCount, setBulkCount] = React.useState(10);

  const leadsForRegion = region === "TAS" ? BLOOME_LEADS_TAS : BLOOME_LEADS_ACT;

  const agentOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    leadsForRegion.forEach((l) =>
      counts.set(l.agentId || "__unassigned__", (counts.get(l.agentId || "__unassigned__") ?? 0) + 1),
    );
    const opts = LEAD_GEN_AGENTS.map((a) => ({
      value: a.id,
      label: a.name,
      count: counts.get(a.id) ?? 0,
    }));
    const unassigned = counts.get("__unassigned__") ?? 0;
    if (unassigned > 0) {
      opts.unshift({
        value: "__unassigned__",
        label: "(Unassigned)",
        count: unassigned,
      });
    }
    return opts;
  }, [leadsForRegion]);

  const outcomeOptions = React.useMemo(() => {
    const all = new Set<string>();
    leadsForRegion.forEach((l) => all.add(l.outcome || ""));
    return Array.from(all).map((o) => ({
      value: o,
      label: o || "(none)",
      count: leadsForRegion.filter((l) => (l.outcome || "") === o).length,
    }));
  }, [leadsForRegion]);

  const dialOptions = React.useMemo(() => {
    const buckets = ["0", "1", "2", "3", "4", "5", "6", "7", "8+"];
    return buckets.map((b) => ({
      value: b,
      label: b === "0" ? "Untouched (0)" : b,
      count: leadsForRegion.filter((l) => dialBucket(l.dials) === b).length,
    }));
  }, [leadsForRegion]);

  const companyOptions = React.useMemo(() => {
    return ["Astra", "DC", ""].map((c) => ({
      value: c,
      label: c || "(unallocated)",
      count: leadsForRegion.filter((l) => l.company === c).length,
    }));
  }, [leadsForRegion]);

  const filtered = React.useMemo(() => {
    return leadsForRegion.filter((l) => {
      if (filters.agentIds.length > 0) {
        const key = l.agentId || "__unassigned__";
        if (!filters.agentIds.includes(key)) return false;
      }
      if (filters.dials.length > 0 && !filters.dials.includes(dialBucket(l.dials)))
        return false;
      if (filters.outcomes.length > 0 && !filters.outcomes.includes(l.outcome || ""))
        return false;
      if (filters.companies.length > 0 && !filters.companies.includes(l.company))
        return false;
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        if (
          !l.name.toLowerCase().includes(q) &&
          !l.phone.includes(q) &&
          !(l.email || "").toLowerCase().includes(q) &&
          !(l.suburb || "").toLowerCase().includes(q) &&
          !(l.postcode || "").includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [leadsForRegion, filters]);

  const pageRows = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  React.useEffect(() => {
    setPage(1);
  }, [region, filters, pageSize]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setFilters(p.apply(filters));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  // KPI maths
  const kpi = React.useMemo(() => {
    const total = leadsForRegion.length;
    const booked = leadsForRegion.filter((l) => l.outcome === "Booked").length;
    const noAnswer = leadsForRegion.filter((l) => l.outcome === "No Answer").length;
    const untouched = leadsForRegion.filter((l) => l.dials === 0).length;
    const conversion = total > 0 ? Math.round((booked / total) * 100) : 0;
    return { total, booked, noAnswer, untouched, conversion };
  }, [leadsForRegion]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads · Third-Party"
        title="Bloome Leads"
        description="Allocate, dial, and disposition incoming Bloome leads across regions."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi
          label={`${region} leads`}
          value={kpi.total.toLocaleString()}
          hint={`${kpi.untouched} untouched`}
          icon={<Sparkles className="h-4 w-4" />}
          tone="primary"
        />
        <Kpi
          label="Booked"
          value={kpi.booked}
          hint={`${kpi.conversion}% conversion`}
          icon={<PhoneIncoming className="h-4 w-4" />}
          tone="success"
          delta={{ value: "+8%", direction: "up" }}
        />
        <Kpi
          label="No answer"
          value={kpi.noAnswer}
          hint="Eligible for redistribute"
          icon={<PhoneOff className="h-4 w-4" />}
          tone="warning"
        />
        <Kpi
          label="Untouched"
          value={kpi.untouched}
          hint="Never dialled"
          icon={<Tags className="h-4 w-4" />}
          tone="default"
        />
      </KpiRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubTabs
          value={region}
          onChange={(v) => setRegion(v as Region)}
          tabs={[
            { key: "TAS", label: "Tasmania", count: BLOOME_LEADS_TAS.length },
            { key: "ACT", label: "ACT", count: BLOOME_LEADS_ACT.length },
          ]}
        />
        <SearchInput
          value={filters.search}
          onChange={(v) => setFilters({ ...filters, search: v })}
          placeholder="Search name, phone, email, suburb…"
          className="w-80"
        />
      </div>

      <Toolbar
        left={
          <>
            <MultiSelect
              label="Agent"
              options={agentOptions}
              value={filters.agentIds}
              onChange={(v) => setFilters({ ...filters, agentIds: v })}
            />
            <MultiSelect
              label="Dials"
              options={dialOptions}
              value={filters.dials}
              onChange={(v) => setFilters({ ...filters, dials: v })}
            />
            <MultiSelect
              label="Outcome"
              options={outcomeOptions}
              value={filters.outcomes}
              onChange={(v) => setFilters({ ...filters, outcomes: v })}
            />
            <MultiSelect
              label="Company"
              options={companyOptions}
              value={filters.companies}
              onChange={(v) => setFilters({ ...filters, companies: v })}
            />
            {(filters.agentIds.length > 0 ||
              filters.dials.length > 0 ||
              filters.outcomes.length > 0 ||
              filters.companies.length > 0 ||
              filters.search) && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-9 px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            )}
          </>
        }
        right={
          <>
            <Button
              variant={bulkOpen ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setBulkOpen(!bulkOpen);
                setRedistributeOpen(false);
              }}
            >
              <Zap className="h-4 w-4" />
              Bulk allocate
            </Button>
            <Button
              variant={redistributeOpen ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setRedistributeOpen(!redistributeOpen);
                setBulkOpen(false);
              }}
            >
              <Shuffle className="h-4 w-4" />
              Redistribute no-answers
            </Button>
          </>
        }
      />

      {/* Saved presets */}
      <div className="flex flex-wrap items-center gap-2 -mt-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
          <Bookmark className="h-3.5 w-3.5" /> Presets
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.description}
            className="h-7 px-2.5 rounded-md border border-input bg-background text-xs hover:bg-accent"
          >
            {p.name}
          </button>
        ))}
      </div>

      {bulkOpen && (
        <Section
          title="Bulk allocate"
          description="Distribute the top N filtered leads to a Lead Gen agent."
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Agent
              </span>
              <select
                value={bulkAgent}
                onChange={(e) => setBulkAgent(e.target.value)}
                className="block h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select agent…</option>
                {LEAD_GEN_AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Number of leads
              </span>
              <input
                type="number"
                value={bulkCount}
                min={1}
                max={500}
                onChange={(e) => setBulkCount(Number(e.target.value))}
                className="block h-9 w-24 rounded-md border border-input bg-background px-3 text-sm tabular-nums"
              />
            </div>
            <Button disabled={!bulkAgent}>Allocate →</Button>
            <span className="text-xs text-muted-foreground">
              Will pull from the top of your current filter.
            </span>
          </div>
        </Section>
      )}

      {redistributeOpen && (
        <Section
          title="Redistribute no-answer leads"
          description="Filters to outcome = No Answer, sorted by dials (most first), and reassigns to a different agent."
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Reassign to
              </span>
              <select
                value={bulkAgent}
                onChange={(e) => setBulkAgent(e.target.value)}
                className="block h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select agent…</option>
                {LEAD_GEN_AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Number to move
              </span>
              <input
                type="number"
                value={bulkCount}
                min={1}
                max={500}
                onChange={(e) => setBulkCount(Number(e.target.value))}
                className="block h-9 w-24 rounded-md border border-input bg-background px-3 text-sm tabular-nums"
              />
            </div>
            <Button disabled={!bulkAgent}>Redistribute →</Button>
          </div>
        </Section>
      )}

      <Section
        title={`${filtered.length.toLocaleString()} ${region} leads`}
        description={
          filtered.length === leadsForRegion.length
            ? "Showing all leads. Use filters to narrow."
            : `${leadsForRegion.length - filtered.length} filtered out`
        }
        flush
      >
        <DataTable scroll maxHeight="calc(100vh - 480px)">
          <THead>
            <tr>
              <TH className="w-10">#</TH>
              <TH>Customer</TH>
              <TH>Phone</TH>
              <TH>Location</TH>
              <TH>Agent</TH>
              <TH align="right">Dials</TH>
              <TH>Outcome</TH>
              <TH>Company</TH>
              <TH align="right">Bill</TH>
              <TH>Last call</TH>
              <TH>Notes</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {pageRows.length === 0 ? (
              <tr>
                <TD colSpan={12} align="center" className="py-16">
                  <p className="text-muted-foreground">
                    No leads match the current filters.
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-2 text-sm text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                </TD>
              </tr>
            ) : (
              pageRows.map((l, i) => (
                <LeadRow
                  key={l.id}
                  lead={l}
                  index={(page - 1) * pageSize + i + 1}
                />
              ))
            )}
          </TBody>
        </DataTable>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100, 250]}
        />
      </Section>
    </div>
  );
}

function LeadRow({ lead, index }: { lead: BloomeLead; index: number }) {
  const agent = LEAD_GEN_AGENTS.find((a) => a.id === lead.agentId);
  const outcomeTone = OUTCOME_TONE[lead.outcome] ?? "neutral";
  const dialsAlert = lead.dials >= 5;
  return (
    <TR>
      <TD className="text-xs text-muted-foreground tabular-nums">{index}</TD>
      <TD>
        <div className="font-medium">{lead.name}</div>
        {lead.email && (
          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
            {lead.email}
          </div>
        )}
      </TD>
      <TD className="tabular-nums whitespace-nowrap">{lead.phone}</TD>
      <TD>
        <div>{lead.suburb}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {lead.postcode}
        </div>
      </TD>
      <TD>
        {agent ? (
          <div className="flex items-center gap-1.5">
            <ConsultantAvatar name={agent.name} size="xs" />
            <span className="text-sm">{agent.name.split(" ")[0]}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            Unassigned
          </span>
        )}
      </TD>
      <TD align="right">
        <span
          className={cn(
            "tabular-nums",
            dialsAlert && "text-amber-600 dark:text-amber-400 font-semibold",
          )}
        >
          {lead.dials}
        </span>
      </TD>
      <TD>
        {lead.outcome ? (
          <StatusBadge tone={outcomeTone} variant="soft" dot>
            {lead.outcome}
          </StatusBadge>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
      </TD>
      <TD>
        {lead.company ? (
          <StatusBadge tone={lead.company === "DC" ? "purple" : "primary"}>
            {lead.company}
          </StatusBadge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TD>
      <TD align="right" className="tabular-nums">
        {lead.bill ? `$${lead.bill}` : "—"}
      </TD>
      <TD className="text-xs text-muted-foreground whitespace-nowrap">
        {lead.lastCalledAt ? relativeTime(lead.lastCalledAt) : "—"}
      </TD>
      <TD>
        {lead.notes ? (
          <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
            {lead.notes}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-8 px-2">
            Call
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-2">
            Edit
          </Button>
        </div>
      </TD>
    </TR>
  );
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
