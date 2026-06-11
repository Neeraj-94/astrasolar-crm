import { cn } from "@/lib/utils";

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Consistent tab header used at the top of every Leads dashboard tab.
 * Establishes the same visual rhythm across the dashboard:
 *
 *   [eyebrow]
 *   <Title>          [actions]
 *   <description>
 *
 *   [optional KPI row / quick filters]
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: Props) {
  return (
    <header className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-wider text-primary mb-1">
              {eyebrow}
            </p>
          )}
          <h2 className="text-2xl font-semibold tracking-tight truncate">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {children}
    </header>
  );
}
