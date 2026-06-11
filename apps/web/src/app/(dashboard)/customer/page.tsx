import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function CustomerIndex() {
  await redirectToDefaultTab("customer");
}
