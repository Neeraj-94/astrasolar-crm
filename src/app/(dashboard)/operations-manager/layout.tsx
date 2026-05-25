import { DashboardShell } from "@/components/dashboard-shell";

export default function OperationsManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell dashboard="operations-manager">{children}</DashboardShell>
  );
}
