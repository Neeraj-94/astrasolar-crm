import { cn } from "@/lib/utils";

interface DataTableProps {
  className?: string;
  children: React.ReactNode;
  /** Adds horizontal scroll for wide tables */
  scroll?: boolean;
  maxHeight?: string;
}

/**
 * Lightweight table wrapper with consistent styling, sticky header, and
 * subtle row hover. Designed for use inside <Section flush>.
 */
export function DataTable({
  className,
  children,
  scroll = true,
  maxHeight,
}: DataTableProps) {
  return (
    <div
      className={cn(scroll && "overflow-auto", "relative")}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table
        className={cn(
          "w-full text-sm border-separate border-spacing-0",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-muted/50 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
      {children}
    </thead>
  );
}

export function TH({
  children,
  className,
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer",
        selected
          ? "bg-primary/5"
          : "hover:bg-muted/40",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  align = "left",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-4 py-3 align-middle border-b border-border/60",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}
