import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { adminAuth, adminBucket } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED = new Set(["image/jpeg", "image/png"]);

/**
 * POST /api/profile/avatar
 * Multipart upload: field "file" (jpg|png, ≤5MB).
 * Stores the image in Firebase Storage and persists the public URL on the
 * user record. Also syncs the photoURL onto the Firebase Auth profile.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  if (!ACCEPTED.has(file.type)) {
    return NextResponse.json(
      { error: "only JPG or PNG images are accepted" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "image must be 5MB or smaller" },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/png" ? "png" : "jpg";
    const objectPath = `avatars/${user.id}/${randomUUID()}.${ext}`;

    const bucket = adminBucket();
    const obj = bucket.file(objectPath);

    // A download token lets us serve the file via the public Firebase URL
    // without making the whole bucket public.
    const downloadToken = randomUUID();
    await obj.save(buffer, {
      contentType: file.type,
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=3600",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const encodedPath = encodeURIComponent(objectPath);
    const avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });

    try {
      await adminAuth().updateUser(user.firebaseUid, { photoURL: avatarUrl });
    } catch (err) {
      console.error("[api/profile/avatar] firebase photoURL sync failed", err);
    }

    await logAudit({
      actorId: user.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      summary: `${user.email} updated profile photo`,
      metadata: { objectPath },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, avatarUrl });
  } catch (err) {
    console.error("[api/profile/avatar] upload failed", err);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}
