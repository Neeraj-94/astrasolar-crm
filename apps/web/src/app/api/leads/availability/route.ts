import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canAccessTab, hasPermission } from "@/lib/rbac";
import {
  fromISODate,
  listSlots,
  upsertSlots,
  type UpsertSlotInput,
} from "@/lib/availability";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/leads/availability?from=YYYY-MM-DD&to=YYYY-MM-DD&consultantIds=id1,id2
 *
 * Returns sparse availability rows in the requested date range.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessTab(user, "leads", "team-availability")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  if (!fromStr || !toStr) {
    return NextResponse.json(
      { error: "from and to query params are required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const consultantIdsParam = searchParams.get("consultantIds");
  const consultantIds = consultantIdsParam
    ? consultantIdsParam.split(",").filter(Boolean)
    : undefined;

  const slots = await listSlots({
    consultantIds,
    from: fromISODate(fromStr),
    to: fromISODate(toStr),
  });

  return NextResponse.json({ slots });
}

/**
 * POST /api/leads/availability
 * Body: { updates: UpsertSlotInput[] }
 *
 * Bulk upsert of (consultant, date, hour, status) tuples.
 * Requires the leads.availability.manage permission.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user, "leads.availability.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { updates?: UpsertSlotInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const updates = body.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json(
      { error: "updates must be a non-empty array" },
      { status: 400 },
    );
  }

  // Light input validation — the lib will also throw on bad hours.
  for (const u of updates) {
    if (
      typeof u.consultantId !== "string" ||
      typeof u.date !== "string" ||
      typeof u.hour !== "number" ||
      (u.status !== "AVAILABLE" && u.status !== "UNAVAILABLE")
    ) {
      return NextResponse.json(
        { error: "malformed update entry" },
        { status: 400 },
      );
    }
  }

  try {
    const result = await upsertSlots(updates, user.id);

    await logAudit({
      actorId: user.id,
      action: "UPDATE",
      entityType: "AvailabilitySlot",
      summary: `Updated ${result.written} availability slot(s)`,
      metadata: { count: result.written, updates: updates.slice(0, 50) },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/leads/availability] upsert failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}
