import { cn } from "@/lib/utils";

interface SectionProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove the inner padding — useful when content is a table */
  flush?: boolean;
}

/**
 * A surface (card) with an optional header and right-aligned actions.
 * Used as the primary content container inside every tab.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: SectionProps) {
  const hasHeader = title || description || actions;
  return (
    <section
      className={cn(
        "rounded-xl border bg-card shadow-sm overflow-hidden",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b">
          <div className="min-w-0">
            {title && (
              <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          )}
        </div>
      )}
      <div className={cn(flush ? "" : "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
