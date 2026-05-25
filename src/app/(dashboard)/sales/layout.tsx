import { DashboardShell } from "@/components/dashboard-shell";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell dashboard="sales">{children}</DashboardShell>;
}
