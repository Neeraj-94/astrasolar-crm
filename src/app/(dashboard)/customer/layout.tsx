import { DashboardShell } from "@/components/dashboard-shell";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell dashboard="customer">{children}</DashboardShell>;
}
