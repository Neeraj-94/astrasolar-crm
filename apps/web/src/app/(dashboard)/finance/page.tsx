import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function FinanceIndex() {
  await redirectToDefaultTab("finance");
}
