import { DashboardShell } from "@/components/dashboard-shell";

export default function InstallerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell dashboard="installer">{children}</DashboardShell>;
}
