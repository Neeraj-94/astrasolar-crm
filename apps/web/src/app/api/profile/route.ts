import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/rbac";
import { apiPatch } from "@/lib/api/client";

const PHONE_LABELS = new Set(["mobile", "work", "home", "other"]);

interface PhoneInput {
  label?: string;
  number?: string;
  isPrimary?: boolean;
}

/**
 * PATCH /api/profile
 * Update the signed-in user's display name + phone numbers.
 *
 * Storage lives in the API (`PATCH /auth/profile` → User.name / User.phones);
 * the API also writes the audit entry.
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
      { error: "displayName must be 1\u2013120 characters" },
      { status: 400 },
    );
  }

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

  try {
    await apiPatch(
      "/auth/profile",
      { name: displayName, phones: cleaned },
      { cookieHeader: cookies().toString() },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/profile] update failed", err);
    return NextResponse.json(
      { error: "failed to update profile" },
      { status: 500 },
    );
  }
}
