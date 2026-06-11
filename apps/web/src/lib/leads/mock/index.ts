// Mock data for the Leads dashboard has been removed.
//
// Only the consultant directory is still re-exported, because the Sales-side
// helpers still rely on it. Sales-side migration to real DB consultants is a
// follow-up.
export * from "./consultants";
