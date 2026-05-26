export type SyncStatus = "success" | "warning" | "failed" | "running";

export interface SheetSource {
  id: string;
  name: string;
  description: string;
  sheetId: string;
  rangeOrTab: string;
  /** Last successful sync */
  lastSyncedAt?: string;
  /** Latest run status */
  status: SyncStatus;
  /** Number of rows imported in last sync */
  rowsLastSync?: number;
  /** Auto sync cadence */
  autoSync: "off" | "hourly" | "daily";
  enabled: boolean;
}

export const MOCK_SHEET_SOURCES: SheetSource[] = [
  {
    id: "primary-leads",
    name: "Primary Leads",
    description: "Main customer leads spreadsheet — drives the consultant schedule.",
    sheetId: "19eNZxCAdXqEWCsL70e8PA48dPLGkZZOrtwwpcNH1xw4",
    rangeOrTab: "Leads!A:Z",
    lastSyncedAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    status: "success",
    rowsLastSync: 1428,
    autoSync: "hourly",
    enabled: true,
  },
  {
    id: "bloome-tas",
    name: "Bloome — TAS Live",
    description: "Third-party Tasmanian leads sourced from Bloome.",
    sheetId: "1gtjBJ4JLftqNzZmFsEHwJ_5Ll8Ku7_stDfFx7G1xpSg",
    rangeOrTab: "TAS : Live",
    lastSyncedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    status: "success",
    rowsLastSync: 180,
    autoSync: "hourly",
    enabled: true,
  },
  {
    id: "bloome-act",
    name: "Bloome — ACT Live",
    description: "Third-party ACT leads sourced from Bloome.",
    sheetId: "1gtjBJ4JLftqNzZmFsEHwJ_5Ll8Ku7_stDfFx7G1xpSg",
    rangeOrTab: "ACT : Live",
    lastSyncedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    status: "warning",
    rowsLastSync: 119,
    autoSync: "daily",
    enabled: true,
  },
  {
    id: "weekly-sales",
    name: "Weekly Sales Report",
    description: "Snapshot of consultant performance for the weekly review.",
    sheetId: "1tQ5x9eBmwR-fakeSheetId-7Hg2Js",
    rangeOrTab: "Weekly!A:M",
    lastSyncedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    status: "failed",
    rowsLastSync: undefined,
    autoSync: "daily",
    enabled: false,
  },
];

export interface SyncHistoryEntry {
  id: string;
  sourceId: string;
  sourceName: string;
  startedAt: string;
  durationMs: number;
  rows: number;
  status: SyncStatus;
  message?: string;
  triggeredBy: "manual" | "scheduled";
  user?: string;
}

const HIST_MESSAGES: Record<SyncStatus, string[]> = {
  success: [
    "Imported successfully",
    "All rows in sync",
    "No duplicates detected",
  ],
  warning: [
    "3 duplicate rows skipped",
    "12 rows with missing phone numbers",
    "5 rows updated with conflicting data",
  ],
  failed: [
    "API quota exceeded — please retry in 1 hour",
    "Sheet permissions changed — share with service account",
    "Invalid range — check the tab name",
  ],
  running: ["In progress…"],
};

export const MOCK_SYNC_HISTORY: SyncHistoryEntry[] = (() => {
  const out: SyncHistoryEntry[] = [];
  const now = Date.now();
  const sources = MOCK_SHEET_SOURCES;
  for (let i = 0; i < 24; i++) {
    const src = sources[i % sources.length];
    const status: SyncStatus =
      i % 9 === 0 ? "failed" : i % 5 === 0 ? "warning" : "success";
    out.push({
      id: `hist-${i + 1}`,
      sourceId: src.id,
      sourceName: src.name,
      startedAt: new Date(now - i * 1000 * 60 * 47).toISOString(),
      durationMs: 1500 + ((i * 311) % 8000),
      rows: status === "failed" ? 0 : 50 + ((i * 67) % 1500),
      status,
      message: HIST_MESSAGES[status][i % HIST_MESSAGES[status].length],
      triggeredBy: i % 3 === 0 ? "manual" : "scheduled",
      user: i % 3 === 0 ? "Daniel Park" : undefined,
    });
  }
  return out;
})();
