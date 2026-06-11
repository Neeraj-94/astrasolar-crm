import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function SalesManagerIndex() {
  await redirectToDefaultTab("sales-manager");
}
