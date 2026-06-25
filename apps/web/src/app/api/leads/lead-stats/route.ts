import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canAccessTab } from "@/lib/rbac";
import { getLeadStatistics } from "@/lib/leads/statistics";
import type { Granularity } from "@/lib/leads/statistics-shared";

const VALID_GRANULARITIES: ReadonlySet<Granularity> = new Set<Granularity>([
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/leads/lead-stats
 *   ?granularity=daily|weekly|monthly|yearly   (bucket size for the trend)
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD              (optional custom window)
 *   &region=ACT|TAS|...                         (optional)
 *
 * Returns lead-gen performance aggregated from the raw Bloome leads: an overall
 * summary, a bucketed time-series, a per-agent breakdown, and a per-lead list.
 *
 * Consumed by the Lead Statistics tab on the Leads Dashboard.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessTab(user, "leads", "lead-statistics")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const granularity = (sp.get("granularity") ?? "daily") as Granularity;
  if (!VALID_GRANULARITIES.has(granularity)) {
    return NextResponse.json(
      {
        error: "invalid_granularity",
        valid: Array.from(VALID_GRANULARITIES),
      },
      { status: 400 },
    );
  }

  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
    return NextResponse.json(
      { error: "invalid_date", expected: "YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (from && to && from > to) {
    return NextResponse.json(
      { error: "invalid_range", message: "`from` must be on or before `to`" },
      { status: 400 },
    );
  }

  const region = sp.get("region") || null;

  const data = await getLeadStatistics({ granularity, from, to, region });
  return NextResponse.json(data);
}
