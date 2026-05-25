import { redirect } from "next/navigation";
import { accessibleDashboards, getCurrentUser } from "@/lib/rbac";

/**
 * Root route — redirects the user to the first dashboard they can access.
 * Middleware ensures we have a session before getting here.
 */
export default async function RootIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dashboards = accessibleDashboards(user);
  if (dashboards.length === 0) {
    redirect("/no-access");
  }

  redirect(`/${dashboards[0].key}`);
}
