import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/rbac";
import { IntegrationsForm } from "@/components/integrations/integrations-form";

export const dynamic = "force-dynamic";

/**
 * /integrations — manage third-party integration API keys (ClickSend, Aircall,
 * Google Sheets, Anthropic). Restricted to CEO / Super Admin / Finance.
 */
export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "integrations.manage")) redirect("/no-access");

  return (
    <div className="max-w-3xl mx-auto py-2">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect third-party services by entering their API keys. Stored keys
          override the server environment configuration.
        </p>
      </header>

      <IntegrationsForm />
    </div>
  );
}
