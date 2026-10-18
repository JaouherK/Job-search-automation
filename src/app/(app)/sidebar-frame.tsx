"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { createContext, use, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { rememberPreference, SIDEBAR_COOKIE } from "@/lib/ui-preferences";

const CollapsedContext = createContext(false);

/** Whether the sidebar is collapsed to its icons, for the parts that need more than CSS. */
export function useSidebarCollapsed(): boolean {
  return use(CollapsedContext);
}

/**
 * The sidebar's frame, collapsible to a strip of icons as in Coordinate AI.
 * The choice is kept in a cookie, so the server renders the next page the
 * same way. Inside, `group-data-collapsed/sidebar:` variants hide what
 * doesn't fit, so the server-rendered parts need no state of their own.
 */
export function SidebarFrame({
  initialCollapsed,
  brand,
  children,
}: {
  initialCollapsed: boolean;
  /** The logo, which the expand button replaces on hover while collapsed. */
  brand: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    setCollapsed(!collapsed);
    rememberPreference(SIDEBAR_COOKIE, collapsed ? "expanded" : "collapsed");
  };
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <CollapsedContext value={collapsed}>
      <aside
        data-collapsed={collapsed || undefined}
        className={cn(
          "group/sidebar sticky top-0 flex h-screen shrink-0 flex-col self-start overflow-x-hidden overflow-y-auto border-r border-line bg-sidebar motion-safe:transition-[width] motion-safe:duration-200",
          collapsed ? "w-12" : "w-[260px]",
        )}
      >
        <div
          className={cn(
            "group/header relative flex items-center gap-2 border-b border-line",
            collapsed ? "justify-center px-1 py-3" : "pt-3 pr-3 pb-4 pl-4",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2",
              // Collapsed, the logo and the expand button share one slot.
              collapsed &&
                "flex-none group-hover/header:opacity-0 group-has-[button:focus-visible]/header:opacity-0 motion-safe:transition-opacity",
            )}
          >
            {brand}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink",
              collapsed &&
                "absolute inset-0 m-auto size-8 bg-surface opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100 motion-safe:transition-opacity",
            )}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </aside>
    </CollapsedContext>
  );
}
