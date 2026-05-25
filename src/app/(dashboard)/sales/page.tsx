import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function SalesIndex() {
  await redirectToDefaultTab("sales");
}
