import { DashboardShell } from "@/components/dashboard-shell";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell dashboard="finance">{children}</DashboardShell>;
}
