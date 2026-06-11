import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canAccessTab } from "@/lib/rbac";
import {
  getSalesStatistics,
  type TimeRange,
} from "@/lib/sales/statistics";

const VALID_RANGES: ReadonlySet<TimeRange> = new Set<TimeRange>([
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

/**
 * GET /api/sales-manager/sales-stats?range=daily|weekly|monthly|yearly
 *
 * Returns per-consultant counts of sales, presentations, callbacks, no answers
 * and cancellations across the requested time window.
 *
 * Consumed by the Sales Statistics bar graph on the Sales Manager →
 * Statistics tab.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessTab(user, "sales-manager", "statistics")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rangeParam = (req.nextUrl.searchParams.get("range") ?? "weekly") as TimeRange;
  if (!VALID_RANGES.has(rangeParam)) {
    return NextResponse.json(
      { error: "invalid_range", validRanges: Array.from(VALID_RANGES) },
      { status: 400 },
    );
  }

  const stats = await getSalesStatistics(rangeParam);
  return NextResponse.json({
    range: rangeParam,
    stats,
    fetchedAt: new Date().toISOString(),
  });
}
