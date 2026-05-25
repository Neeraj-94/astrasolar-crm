import { DashboardShell } from "@/components/dashboard-shell";

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell dashboard="leads">{children}</DashboardShell>;
}
