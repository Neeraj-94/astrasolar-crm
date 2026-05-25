"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface TopNavTab {
  key: string;
  name: string;
}

interface Props {
  dashboardKey: string;
  tabs: TopNavTab[];
}

export function TopNav({ dashboardKey, tabs }: Props) {
  const pathname = usePathname();

  if (tabs.length === 0) return null;

  return (
    <nav className="flex gap-1 border-b -mx-6 px-6 overflow-x-auto">
      {tabs.map((t) => {
        const href = `/${dashboardKey}/${t.key}`;
        const active = pathname === href || pathname.endsWith(`/${t.key}`);
        return (
          <Link
            key={t.key}
            href={href}
            className={cn(
              "px-3 py-3 -mb-px text-sm border-b-2 transition-colors whitespace-nowrap",
              active
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.name}
          </Link>
        );
      })}
    </nav>
  );
}
