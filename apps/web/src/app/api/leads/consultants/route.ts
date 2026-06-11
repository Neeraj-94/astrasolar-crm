import { NextResponse } from "next/server";
import { getCurrentUser, canAccessTab } from "@/lib/rbac";
import { listConsultants } from "@/lib/availability";

/**
 * GET /api/leads/consultants
 *
 * Returns the active sales consultants. Used by the Team Availability tab to
 * populate the multi-select.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessTab(user, "leads", "team-availability")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const consultants = await listConsultants();
  return NextResponse.json({ consultants });
}
