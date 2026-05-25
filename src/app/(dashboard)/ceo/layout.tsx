import { DashboardShell } from "@/components/dashboard-shell";

export default function CeoLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell dashboard="ceo">{children}</DashboardShell>;
}
