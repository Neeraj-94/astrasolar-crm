"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, apiPatch, apiPost } from "@/lib/api/client";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 60_000;

interface NotificationsValue {
  items: NotificationItem[];
  unread: number;
  loadList: () => Promise<void>;
  markRead: (n: NotificationItem) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Single source of truth for in-app notifications. Polls the unread count once
 * for the whole app so every entry point (header bell + floating dock) shows a
 * consistent badge and stays in sync when items are marked read.
 */
export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const r = await api<{ count: number }>("/notifications/unread-count");
      setUnread(r.count);
    } catch {
      // silent — chrome shouldn't surface transient errors
    }
  }, []);

  const loadList = useCallback(async () => {
    try {
      setItems(await api<NotificationItem[]>("/notifications"));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadCount();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadCount();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadCount]);

  const markRead = useCallback(
    async (n: NotificationItem) => {
      if (n.readAt) return;
      setItems((prev) =>
        prev.map((i) =>
          i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
      try {
        await apiPatch(`/notifications/${n.id}/read`, {});
      } catch {
        loadCount();
        loadList();
      }
    },
    [loadCount, loadList],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) =>
      prev.map((i) =>
        i.readAt ? i : { ...i, readAt: new Date().toISOString() },
      ),
    );
    setUnread(0);
    try {
      await apiPost("/notifications/read-all", {});
    } catch {
      loadCount();
      loadList();
    }
  }, [loadCount, loadList]);

  return (
    <NotificationsContext.Provider
      value={{ items, unread, loadList, markRead, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}

/** Deep-link target for a notification, or null if it isn't actionable. */
export function notificationHref(n: NotificationItem): string | null {
  if (n.type === "LEAD_NEEDS_REBOOKING") return "/leads/leads-schedule";
  return null;
}
