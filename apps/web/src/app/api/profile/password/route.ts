import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/rbac";
import { apiPost, ApiError } from "@/lib/api/client";

/**
 * POST /api/profile/password
 * Body: { currentPassword, newPassword }
 *
 * Forwards to the API (`/auth/profile/password`), which verifies the current
 * password against the bcrypt hash, rotates it, invalidates refresh tokens,
 * and writes the audit entry.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (
    typeof body.currentPassword !== "string" ||
    typeof body.newPassword !== "string" ||
    body.newPassword.length < 8
  ) {
    return NextResponse.json(
      { error: "newPassword must be at least 8 characters" },
      { status: 400 },
    );
  }

  try {
    await apiPost(
      "/auth/profile/password",
      {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      },
      { cookieHeader: cookies().toString() },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 },
      );
    }
    console.error("[api/profile/password] change failed", err);
    return NextResponse.json(
      { error: "failed to update password" },
      { status: 500 },
    );
  }
}
