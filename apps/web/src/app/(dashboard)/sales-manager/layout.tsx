import { DashboardShell } from "@/components/dashboard-shell";

export default function SalesManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell dashboard="sales-manager">{children}</DashboardShell>;
}
