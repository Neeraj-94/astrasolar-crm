"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { NotificationList } from "@/components/notifications/notification-list";
import {
  notificationHref,
  useNotifications,
  type NotificationItem,
} from "@/components/notifications/notifications-context";

/**
 * In-app notification centre (header bell). Reads from the shared notifications
 * context so it stays in sync with the floating dock's notification button.
 */
export function NotificationBell() {
  const router = useRouter();
  const { items, unread, loadList, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) await loadList();
  }

  function activate(n: NotificationItem) {
    markRead(n);
    const href = notificationHref(n);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-semibold leading-4 text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <NotificationList
            items={items}
            unread={unread}
            onMarkAllRead={markAllRead}
            onActivate={activate}
          />
        </div>
      )}
    </div>
  );
}
