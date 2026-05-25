import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function ManagerIndex() {
  await redirectToDefaultTab("manager");
}
