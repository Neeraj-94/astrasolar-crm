import {
  Magnet,
  TrendingUp,
  Users,
  Crown,
  Banknote,
  Shield,
  User,
  Wrench,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

const REGISTRY: Record<string, LucideIcon> = {
  Magnet,
  TrendingUp,
  Users,
  Crown,
  Banknote,
  Shield,
  User,
  Wrench,
  LayoutGrid,
};

interface Props {
  iconKey?: string | null;
  className?: string;
}

export function DashboardIcon({ iconKey, className }: Props) {
  const Icon = (iconKey && REGISTRY[iconKey]) || LayoutGrid;
  return <Icon className={className} />;
}
