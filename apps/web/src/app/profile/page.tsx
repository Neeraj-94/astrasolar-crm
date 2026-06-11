import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/profile/profile-form";

export const dynamic = "force-dynamic";

/**
 * /profile — authenticated user profile page.
 * Lets the signed-in user edit their avatar, display name, phone numbers
 * and change their password.
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const phones = await prisma.userPhone.findMany({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="max-w-3xl mx-auto py-2">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account details and password.
        </p>
      </header>

      <ProfileForm
        user={{
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        }}
        phones={phones.map((p) => ({
          id: p.id,
          label: p.label,
          number: p.number,
          isPrimary: p.isPrimary,
        }))}
      />
    </div>
  );
}
