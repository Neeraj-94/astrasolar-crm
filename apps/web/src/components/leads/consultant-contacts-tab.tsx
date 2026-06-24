import { getCurrentUser } from "@/lib/rbac";
import { listConsultantContacts } from "@/lib/consultant-contacts";
import { ConsultantContactsClient } from "./consultant-contacts-client";

/**
 * Consultant Contacts (Leads dashboard).
 *
 * Per-consultant callback number + ClickSend sender ID, one pair per brand
 * (Astra Solar / DC Solar). Ported from the astrasolar-app Firebase node
 * `/consultantContacts/{consultantId}` onto v2's API/Postgres stack.
 *
 * The number that lands in {{consultantPhone}} on an outbound SMS — and the
 * sender shown on the recipient's phone — are both picked from whichever brand
 * the lead was booked under. A blank field reverts that one to the system
 * default; Remove clears the whole row.
 *
 * Edit access: Lead Gen, Admin Officer, CEO, Super Admin (leads:contacts:manage).
 * Everyone else with leads access sees it read-only.
 */
export async function ConsultantContactsTab() {
  const user = await getCurrentUser();
  const roleKeys = user?.roleKeys ?? [];
  const canEdit = roleKeys.some((r) =>
    ["lead_gen", "admin_officer", "ceo", "super_admin"].includes(r),
  );

  const contacts = await listConsultantContacts();

  return (
    <ConsultantContactsClient initialContacts={contacts} canEdit={canEdit} />
  );
}
