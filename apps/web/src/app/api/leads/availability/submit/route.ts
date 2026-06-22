import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/rbac";
import { saveWeekSubmission, type SaveWeekInput } from "@/lib/availability";

/**
 * POST /api/leads/availability/submit
 * Body: SaveWeekInput
 *
 * Saves a full week of availability for one consultant. Storage lives in the
 * API (`/scheduling/availability/submit`), which replaces every slot row for
 * the week, upserts the AvailabilitySubmission, and writes the audit trail.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user, "leads.availability.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: SaveWeekInput;
  try {
    body = (await req.json()) as SaveWeekInput;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (
    typeof body.consultantId !== "string" ||
    typeof body.consultantName !== "string" ||
    typeof body.weekStart !== "string" ||
    !Array.isArray(body.days)
  ) {
    return NextResponse.json({ error: "malformed payload" }, { status: 400 });
  }

  for (const d of body.days) {
    if (
      typeof d.date !== "string" ||
      typeof d.holiday !== "boolean" ||
      !Array.isArray(d.availableHours) ||
      d.availableHours.some((h) => typeof h !== "number")
    ) {
      return NextResponse.json(
        { error: "malformed day entry" },
        { status: 400 },
      );
    }
  }

  try {
    const summary = await saveWeekSubmission(body);
    return NextResponse.json({ ok: true, submission: summary });
  } catch (err) {
    console.error("[api/leads/availability/submit] save failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}
