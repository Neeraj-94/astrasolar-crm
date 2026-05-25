import { DashboardShell } from "@/components/dashboard-shell";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell dashboard="manager">{children}</DashboardShell>;
}
