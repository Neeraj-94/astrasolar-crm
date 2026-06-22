import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/rbac";
import { KnowledgeBrain } from "@/components/nova/knowledge-brain";

/**
 * Nova Knowledge Brain — manage the AI's knowledge base and learned memory.
 * Gated to roles that hold nova:manage (CEO / Super Admin). The API re-enforces
 * the permission on every write, so this server gate is defence-in-depth only.
 */
const MANAGE_ROLES = new Set(["ceo", "super_admin"]);

export default async function NovaKnowledgePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.roleKeys.some((r) => MANAGE_ROLES.has(r))) redirect("/no-access");
  return <KnowledgeBrain />;
}
