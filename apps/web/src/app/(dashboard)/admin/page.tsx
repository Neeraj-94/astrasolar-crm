import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function AdminIndex() {
  await redirectToDefaultTab("admin");
}
