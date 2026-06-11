import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";

const PHONE_LABELS = new Set(["mobile", "work", "home", "other"]);

interface PhoneInput {
  label?: string;
  number?: string;
  isPrimary?: boolean;
}

/**
 * PATCH /api/profile
 * Update the signed-in user's display name + phone numbers.
 * Replaces all existing phone rows with the supplied list.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { displayName?: unknown; phones?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length === 0 || displayName.length > 120) {
    return NextResponse.json(
      { error: "displayName must be 1–120 characters" },
      { status: 400 },
    );
  }

  // Normalise + validate phones.
  const rawPhones = Array.isArray(body.phones) ? (body.phones as PhoneInput[]) : [];
  const cleaned = rawPhones
    .map((p) => ({
      label:
        typeof p.label === "string" && PHONE_LABELS.has(p.label)
          ? p.label
          : "mobile",
      number: typeof p.number === "string" ? p.number.trim() : "",
      isPrimary: !!p.isPrimary,
    }))
    .filter((p) => p.number.length > 0 && p.number.length <= 40);

  if (cleaned.length > 10) {
    return NextResponse.json(
      { error: "maximum 10 phone numbers" },
      { status: 400 },
    );
  }

  // Exactly one primary (or none if list is empty).
  if (cleaned.length > 0) {
    const primaryCount = cleaned.filter((p) => p.isPrimary).length;
    if (primaryCount === 0) cleaned[0].isPrimary = true;
    else if (primaryCount > 1) {
      let seen = false;
      for (const p of cleaned) {
        if (p.isPrimary && !seen) seen = true;
        else p.isPrimary = false;
      }
    }
  }

  const primary = cleaned.find((p) => p.isPrimary) ?? cleaned[0];

  try {
    await prisma.$transaction([
      prisma.userPhone.deleteMany({ where: { userId: user.id } }),
      ...(cleaned.length > 0
        ? [
            prisma.userPhone.createMany({
              data: cleaned.map((p) => ({
                userId: user.id,
                label: p.label,
                number: p.number,
                isPrimary: p.isPrimary,
              })),
            }),
          ]
        : []),
      prisma.user.update({
        where: { id: user.id },
        data: {
          displayName,
          // Mirror primary phone into the legacy User.phone column for
          // downstream code that still reads it.
          phone: primary?.number ?? null,
        },
      }),
    ]);

    // Keep Firebase Auth profile in sync so the displayName surfaces in
    // tokens / other Firebase-aware integrations.
    try {
      await adminAuth().updateUser(user.firebaseUid, { displayName });
    } catch (err) {
      console.error("[api/profile] firebase displayName sync failed", err);
    }

    await logAudit({
      actorId: user.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      summary: `${user.email} updated profile details`,
      metadata: {
        displayName,
        phoneCount: cleaned.length,
      },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/profile] update failed", err);
    return NextResponse.json(
      { error: "failed to update profile" },
      { status: 500 },
    );
  }
}
