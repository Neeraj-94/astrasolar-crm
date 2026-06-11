import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function LeadsIndex() {
  await redirectToDefaultTab("leads");
}
