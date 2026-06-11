import { CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Shared scaffold for Leads Dashboard tab modules.
 *
 * Each tab module imports this and supplies:
 *  - title / description for the tab header
 *  - a short list of planned features (rendered as a checklist)
 *  - optional `metrics` cards across the top
 *  - optional `children` for any custom UI the tab already has
 *
 * The point: every tab has the same scaffold today, and gets replaced piece-
 * by-piece with real components without changing the routing or permission
 * plumbing around it.
 */

export interface ScaffoldMetric {
  label: string;
  value: string | number;
}

interface Props {
  title: string;
  description: string;
  features: string[];
  metrics?: ScaffoldMetric[];
  children?: React.ReactNode;
}

const DEFAULT_METRICS: ScaffoldMetric[] = [
  { label: "Records", value: "—" },
  { label: "This week", value: "—" },
  { label: "Open items", value: "—" },
];

export function TabScaffold({
  title,
  description,
  features,
  metrics = DEFAULT_METRICS,
  children,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((m) => (
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

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Planned features
          </p>
          <ul className="space-y-2">
            {features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground/60 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {children}
    </div>
  );
}
