import "server-only";
import { cookies } from "next/headers";
import type { ConsultantContactDto } from "@astra/shared";
import { apiGet } from "@/lib/api/client";

/**
 * Consultant Contacts — server-side loader for the Leads -> Consultant Contacts
 * tab. Thin authenticated client over the API's `/consultant-contacts`
 * endpoint (NestJS ConsultantContactsModule). Mutations happen client-side via
 * ConsultantContactsApi.
 */
function authed() {
  return { cookieHeader: cookies().toString() };
}

export async function listConsultantContacts(): Promise<ConsultantContactDto[]> {
  return apiGet<ConsultantContactDto[]>("/consultant-contacts", authed());
}
