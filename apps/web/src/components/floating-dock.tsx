"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator, Plus, Sparkles, X } from "lucide-react";
import { NovaWidget } from "@/components/nova/nova-widget";
import { PriceCalcModal } from "@/components/price-calc/price-calc-widget";
import { apiGet } from "@/lib/api/client";

const ACCENT = "#00d4ff";

type Panel = "nova" | "calc" | null;

interface Props {
  userName?: string;
  canUseNova?: boolean;
  canUsePriceCalc?: boolean;
}

/**
 * Floating action cluster (speed-dial). A single button bottom-right expands to
 * reveal the in-app tools — the System Price Calculator and Ask Nova — and
 * collapses them back under one entity. Notifications live in the header bell.
 */
export function FloatingDock({ userName, canUseNova, canUsePriceCalc }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<Panel>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const briefingFetched = useRef(false);

  // On app open, fetch Nova's daily briefing. The server returns it only the
  // first time per day (`fresh`); when it does, we pop Nova open and let her
  // read it aloud. Subsequent opens that day return nothing, so nothing happens.
  useEffect(() => {
    if (!canUseNova || briefingFetched.current) return;
    briefingFetched.current = true;
    apiGet<{ fresh: boolean; text: string | null }>("/nova/briefing")
      .then((res) => {
        if (res?.fresh && res.text) {
          setBriefing(res.text);
          setActive((cur) => cur ?? "nova"); // don't steal focus from an open panel
        }
      })
      .catch(() => {
        /* no briefing on failure — stay quiet */
      });
  }, [canUseNova]);

  // Mini-actions, in the order they stack upward from the main button.
  const actions: {
    key: Exclude<Panel, null>;
    label: string;
    icon: React.ReactNode;
    show: boolean;
    style?: React.CSSProperties;
    className: string;
  }[] = [
    {
      key: "calc",
      label: "Price Calculator",
      icon: <Calculator size={20} />,
      show: !!canUsePriceCalc,
      className: "bg-success text-success-foreground ring-1 ring-border",
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
      {/* Cluster — hidden while the Nova corner panel is open so it doesn't overlap. */}
      {active !== "nova" && (
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
          briefing={briefing}
        />
      )}

      {canUsePriceCalc && active === "calc" && (
        <PriceCalcModal onClose={() => setActive(null)} />
      )}
    </>
  );
}
