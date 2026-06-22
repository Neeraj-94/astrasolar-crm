import { NextResponse } from "next/server";
import { getCurrentUser, canAccessTab } from "@/lib/rbac";
import { getTeamStatus } from "@/lib/sales/statistics";

/**
 * GET /api/sales-manager/team-status
 *
 * Returns the current online/offline status of every sales consultant.
 * Consumed by the Team Status widget on the Sales Manager → Statistics tab
 * and the CEO → Overview tab, which poll this endpoint for near-real-time
 * updates.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed =
    canAccessTab(user, "sales-manager", "statistics") ||
    canAccessTab(user, "ceo", "overview");
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const team = await getTeamStatus();
  const online = team.filter((t) => t.status === "online").length;
  return NextResponse.json({
    team,
    summary: {
      total: team.length,
      online,
      offline: team.length - online,
    },
    fetchedAt: new Date().toISOString(),
  });
}
