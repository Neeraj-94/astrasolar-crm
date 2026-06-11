import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "__astra_session";
const MAX_AGE = Number(process.env.SESSION_COOKIE_MAX_AGE || 60 * 60 * 24 * 5); // 5 days
const MAX_AGE_MS = MAX_AGE * 1000;

/**
 * POST /api/auth/session
 *
 * Exchanges a Firebase ID token (sent in the JSON body) for a httpOnly
 * session cookie. Also upserts the matching User row in Postgres on first login.
 */
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: "missing idToken" }, { status: 400 });
    }

    const decoded = await adminAuth().verifyIdToken(idToken);

    // Upsert the local user record so RBAC has someone to attach roles to.
    const user = await prisma.user.upsert({
      where: { firebaseUid: decoded.uid },
      update: {
        email: decoded.email ?? "",
        displayName: decoded.name ?? undefined,
        avatarUrl: decoded.picture ?? undefined,
      },
      create: {
        firebaseUid: decoded.uid,
        email: decoded.email ?? `${decoded.uid}@unknown.local`,
        displayName: decoded.name ?? null,
        avatarUrl: decoded.picture ?? null,
      },
    });

    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: MAX_AGE_MS,
    });

    cookies().set(SESSION_COOKIE, sessionCookie, {
      maxAge: MAX_AGE,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    await logAudit({
      actorId: user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      summary: `${user.email} signed in`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error("[api/auth/session] error", err);
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
}

/**
 * DELETE /api/auth/session - sign out.
 */
export async function DELETE() {
  cookies().delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
