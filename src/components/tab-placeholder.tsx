import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dashboardName: string;
  tabName: string;
  tabDescription?: string;
}

export function TabPlaceholder({
  dashboardName,
  tabName,
  tabDescription,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Records", value: "—" },
          { label: "This week", value: "—" },
          { label: "Open items", value: "—" },
        ].map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                {m.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <EmptyState
        icon={<Construction className="h-10 w-10" />}
        title={`${dashboardName} — ${tabName}`}
        description={
          tabDescription ??
          "This tab is wired up with permission checks and routing. Drop in your real components and data here."
        }
      />
    </div>
  );
}
