import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function SuperAdminIndex() {
  await redirectToDefaultTab("super-admin");
}
