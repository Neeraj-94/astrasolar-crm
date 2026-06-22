import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/rbac";
import { apiGet } from "@/lib/api/client";
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

  // Phones live on the API user record (User.phones JSON).
  const me = await apiGet<{
    phones?: Array<{ label: string; number: string; isPrimary: boolean }>;
  }>("/auth/me", { cookieHeader: cookies().toString() });
  const phones = (me.phones ?? []).map((p, i) => ({
    id: `phone-${i}`,
    label: p.label,
    number: p.number,
    isPrimary: p.isPrimary,
  }));

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
        phones={phones}
      />
    </div>
  );
}
