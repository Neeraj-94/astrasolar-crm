import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function OperationsManagerIndex() {
  await redirectToDefaultTab("operations-manager");
}
