import { cn } from "@/lib/utils";

interface ToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Filter/action bar that sits above tables. Two flex zones (left/right)
 * with wrap support on small screens. Falls back to rendering `children`
 * if neither slot is supplied.
 */
export function Toolbar({ left, right, className, children }: ToolbarProps) {
  if (children) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border bg-card/50 p-3",
          className,
        )}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/50 p-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}
