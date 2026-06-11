import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/profile/password
 *
 * The password change itself happens client-side via the Firebase JS SDK
 * (after `reauthenticateWithCredential` confirms the current password).
 * This endpoint only records an audit-log entry so administrators can see
 * password-change events in the activity history.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await logAudit({
    actorId: user.id,
    action: "UPDATE",
    entityType: "User",
    entityId: user.id,
    summary: `${user.email} changed password`,
    metadata: { field: "password" },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
