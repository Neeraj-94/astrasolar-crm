import { listBlacklistEntries, listBlacklistLog } from "@/lib/blacklist";
import { BlacklistClient } from "./blacklist-client";

/**
 * Blacklist Leads (Leads dashboard).
 *
 * Ported from the astrasolar-app Firebase `/blacklistLeads` node onto v2's
 * API/Postgres stack. Add a person by name / phone / email / address; a sweep
 * flags any matching record (>=2 fields) in Bloome, No Answers, and Leads
 * Schedule, removes it from those tabs, and logs the removal below.
 *
 * Any Leads dashboard user can add/remove entries and trigger a re-scan.
 */
export async function BlacklistTab() {
  const [entries, log] = await Promise.all([
    listBlacklistEntries(),
    listBlacklistLog(),
  ]);

  return <BlacklistClient initialEntries={entries} initialLog={log} />;
}
