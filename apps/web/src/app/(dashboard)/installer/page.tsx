import { redirectToDefaultTab } from "@/components/dashboard-shell";

export default async function InstallerIndex() {
  await redirectToDefaultTab("installer");
}
