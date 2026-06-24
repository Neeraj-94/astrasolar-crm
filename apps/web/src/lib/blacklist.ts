import "server-only";
import { cookies } from "next/headers";
import type { BlacklistEntryDto, BlacklistLogDto } from "@astra/shared";
import { apiGet } from "@/lib/api/client";

/**
 * Blacklist Leads — server-side loaders for the Leads -> Blacklist Leads tab.
 * Thin authenticated clients over the API's `/blacklist/*` endpoints. Mutations
 * (add / remove / re-scan) happen client-side via BlacklistApi.
 */
function authed() {
  return { cookieHeader: cookies().toString() };
}

export async function listBlacklistEntries(): Promise<BlacklistEntryDto[]> {
  return apiGet<BlacklistEntryDto[]>("/blacklist/entries", authed());
}

export async function listBlacklistLog(): Promise<BlacklistLogDto[]> {
  return apiGet<BlacklistLogDto[]>("/blacklist/log", authed());
}
