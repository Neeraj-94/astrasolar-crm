"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "./notifications-context";

function fmtAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 90_000) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
  });
}

interface Props {
  items: NotificationItem[];
  unread: number;
  onMarkAllRead: () => void;
  onActivate: (n: NotificationItem) => void;
}

/**
 * Presentational notification centre (title bar + scrollable list). Shared by
 * the header bell dropdown and the floating dock panel so both render
 * identically and stay in sync via the notifications context.
 */
export function NotificationList({
  items,
  unread,
  onMarkAllRead,
  onActivate,
}: Props) {
  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">Notifications</span>
        {unread > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Check className="h-3 w-3" />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onActivate(n)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent",
                !n.readAt && "bg-primary/[0.04]",
              )}
            >
              <div className="flex w-full items-center gap-2">
                {!n.readAt && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <span className="flex-1 truncate text-sm font-medium">
                  {n.title}
                </span>
                <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                  {fmtAgo(n.createdAt)}
                </span>
              </div>
              {n.body && (
                <p className="line-clamp-2 pl-3.5 text-xs text-muted-foreground">
                  {n.body}
                </p>
              )}
            </button>
          ))
        )}
      </div>
    </>
  );
}
