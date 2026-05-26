import { redirect } from "next/navigation";
import {
  accessibleDashboards,
  getCurrentUser,
  primaryDashboardFor,
} from "@/lib/rbac";

/**
 * Root route — redirects the user to their primary dashboard based on the
 * role they hold. For example, a sales_consultant lands on /sales,
 * a lead_gen on /leads, the CEO on /ceo, etc. Falls back to the first
 * accessible dashboard if no role mapping matches.
 */
export default async function RootIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const primary = primaryDashboardFor(user);
  if (primary) {
    redirect(`/${primary}`);
  }

  const dashboards = accessibleDashboards(user);
  if (dashboards.length === 0) {
    redirect("/no-access");
  }

  redirect(`/${dashboards[0].key}`);
}
