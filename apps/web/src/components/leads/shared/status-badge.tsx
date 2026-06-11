import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

interface Props {
  tone?: BadgeTone;
  /** Visual variant — soft = filled tinted, outline = bordered */
  variant?: "soft" | "outline" | "solid";
  className?: string;
  dot?: boolean;
  children: React.ReactNode;
}

const TONES: Record<BadgeTone, { soft: string; outline: string; solid: string; dot: string }> = {
  neutral: {
    soft: "bg-muted text-foreground",
    outline: "border-border text-foreground",
    solid: "bg-foreground text-background",
    dot: "bg-muted-foreground",
  },
  primary: {
    soft: "bg-primary/10 text-primary",
    outline: "border-primary/40 text-primary",
    solid: "bg-primary text-primary-foreground",
    dot: "bg-primary",
  },
  success: {
    soft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    outline: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
    solid: "bg-emerald-600 text-white",
    dot: "bg-emerald-500",
  },
  warning: {
    soft: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    outline: "border-amber-500/40 text-amber-700 dark:text-amber-300",
    solid: "bg-amber-500 text-white",
    dot: "bg-amber-500",
  },
  danger: {
    soft: "bg-red-500/10 text-red-700 dark:text-red-300",
    outline: "border-red-500/40 text-red-700 dark:text-red-300",
    solid: "bg-red-600 text-white",
    dot: "bg-red-500",
  },
  info: {
    soft: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    outline: "border-sky-500/40 text-sky-700 dark:text-sky-300",
    solid: "bg-sky-600 text-white",
    dot: "bg-sky-500",
  },
  purple: {
    soft: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    outline: "border-violet-500/40 text-violet-700 dark:text-violet-300",
    solid: "bg-violet-600 text-white",
    dot: "bg-violet-500",
  },
};

export function StatusBadge({
  tone = "neutral",
  variant = "soft",
  className,
  dot,
  children,
}: Props) {
  const tones = TONES[tone];
  const variantClass =
    variant === "outline"
      ? cn("border bg-transparent", tones.outline)
      : variant === "solid"
        ? tones.solid
        : tones.soft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        variantClass,
        className,
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", tones.dot)} />
      )}
      {children}
    </span>
  );
}
