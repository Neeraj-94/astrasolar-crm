"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Calculator, Plus, Sparkles, X } from "lucide-react";
import { NovaWidget } from "@/components/nova/nova-widget";
import { PriceCalcModal } from "@/components/price-calc/price-calc-widget";
import { NotificationList } from "@/components/notifications/notification-list";
import {
  notificationHref,
  useNotifications,
  type NotificationItem,
} from "@/components/notifications/notifications-context";

const ACCENT = "#00d4ff";

type Panel = "nova" | "calc" | "notify" | null;

interface Props {
  userName?: string;
  canUseNova?: boolean;
  canUsePriceCalc?: boolean;
}

/**
 * Floating action cluster (speed-dial). A single button bottom-right expands to
 * reveal the in-app tools — Notifications, the System Price Calculator, and Ask
 * Nova — and collapses them back under one entity. Each mini-button opens its
 * own panel.
 */
export function FloatingDock({ userName, canUseNova, canUsePriceCalc }: Props) {
  const { unread } = useNotifications();
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<Panel>(null);

  // Mini-actions, in the order they stack upward from the main button.
  const actions: {
    key: Exclude<Panel, null>;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    show: boolean;
    style?: React.CSSProperties;
    className: string;
  }[] = [
    {
      key: "notify",
      label: "Notifications",
      icon: <Bell size={20} />,
      badge: unread,
      show: true,
      className: "bg-card text-foreground ring-1 ring-border",
    },
    {
      key: "calc",
      label: "Price Calculator",
      icon: <Calculator size={20} />,
      show: !!canUsePriceCalc,
      className:
        "bg-success text-success-foreground ring-1 ring-border",
    },
    {
      key: "nova",
      label: "Ask Nova",
      icon: <Sparkles size={20} style={{ color: ACCENT }} />,
      show: !!canUseNova,
      style: {
        background: "linear-gradient(135deg, #0a2540 0%, #00415f 100%)",
        boxShadow: "0 0 0 1px rgba(0,212,255,0.25), 0 8px 24px rgba(0,0,0,0.35)",
      },
      className: "text-white",
    },
  ];

  const visible = actions.filter((a) => a.show);

  function openPanel(key: Exclude<Panel, null>) {
    setActive(key);
    setExpanded(false);
  }

  return (
    <>
      {/* Cluster — hidden while a corner panel is open so it doesn't overlap. */}
      {active !== "nova" && active !== "notify" && (
        <>
          {/* Outside-click catcher while expanded. */}
          {expanded && (
            <button
              aria-hidden
              tabIndex={-1}
              onClick={() => setExpanded(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
          )}

          <div className="fixed bottom-5 right-5 z-50 flex flex-col items-center gap-3">
            {/* Mini actions (top → bottom) appear when expanded. */}
            {expanded &&
              visible.map((a) => (
                <button
                  key={a.key}
                  onClick={() => openPanel(a.key)}
                  aria-label={a.label}
                  title={a.label}
                  style={a.style}
                  className={
                    "relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 " +
                    a.className
                  }
                >
                  {a.icon}
                  {a.badge && a.badge > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-semibold leading-4 text-destructive-foreground">
                      {a.badge > 99 ? "99+" : a.badge}
                    </span>
                  ) : null}
                </button>
              ))}

            {/* Main toggle. */}
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Close menu" : "Open menu"}
              aria-expanded={expanded}
              className="relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
              style={{
                background: "linear-gradient(135deg, #0a2540 0%, #00415f 100%)",
                boxShadow:
                  "0 0 0 1px rgba(0,212,255,0.25), 0 8px 24px rgba(0,0,0,0.35)",
              }}
            >
              {expanded ? (
                <X size={24} style={{ color: ACCENT }} />
              ) : (
                <Plus size={26} style={{ color: ACCENT }} />
              )}
              {/* Aggregate unread badge while collapsed. */}
              {!expanded && unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.62rem] font-semibold leading-4 text-destructive-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          </div>
        </>
      )}

      {/* Panels */}
      {canUseNova && (
        <NovaWidget
          userName={userName}
          open={active === "nova"}
          onClose={() => setActive(null)}
        />
      )}

      {canUsePriceCalc && active === "calc" && (
        <PriceCalcModal onClose={() => setActive(null)} />
      )}

      {active === "notify" && (
        <NotificationPanel onClose={() => setActive(null)} />
      )}
    </>
  );
}

/** Floating notification centre opened from the dock. */
function NotificationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { items, unread, loadList, markRead, markAllRead } = useNotifications();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  function activate(n: NotificationItem) {
    markRead(n);
    const href = notificationHref(n);
    if (href) {
      onClose();
      router.push(href);
    }
  }

  return (
    <div
      ref={ref}
      className="fixed bottom-5 right-5 z-50 w-[min(20rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-popover shadow-2xl"
    >
      <NotificationList
        items={items}
        unread={unread}
        onMarkAllRead={markAllRead}
        onActivate={activate}
      />
      <div className="flex justify-end border-t px-3 py-2">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" /> Close
        </button>
      </div>
    </div>
  );
}
