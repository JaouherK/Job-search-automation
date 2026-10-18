import { LogOut, Plus } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { signOut } from "@/lib/auth/actions";
import type { ColorScheme } from "@/lib/ui-preferences";
import { appVersion } from "@/lib/version";

import { NavLinks } from "./nav-links";
import { SidebarFrame } from "./sidebar-frame";
import { ThemeToggle } from "./theme-toggle";

/** Up to two initials for the avatar, e.g. "Jane Doe" → "JD". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
}

/** The signed-in sidebar: brand header, "+ New application", navigation and the account footer. */
export function Sidebar({
  userName,
  collapsed,
  colorScheme,
  counts,
}: {
  userName: string;
  /** Collapsed to its icons, as last left. */
  collapsed: boolean;
  /** The scheme the switch chose last, if any. */
  colorScheme?: ColorScheme;
  /** Badges by nav item, e.g. replies waiting in the inbox. */
  counts?: Record<string, number>;
}) {
  return (
    <SidebarFrame
      initialCollapsed={collapsed}
      brand={
        <>
          <BrandMark />
          <div className="flex min-w-0 flex-col group-data-collapsed/sidebar:hidden">
            <span className="text-sm font-semibold">Dossier</span>
            <span className="truncate text-xs text-muted">Your job search, on your server</span>
          </div>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-1 p-2 group-data-collapsed/sidebar:px-1">
        {/* Always a fresh start, whatever an open draft holds (E7-7). */}
        <Link
          href="/new?fresh=1"
          title="New application"
          className="mb-2 flex min-h-[34px] items-center gap-1.5 rounded-control bg-primary px-3 text-sm font-semibold text-on-primary shadow-cta hover:bg-primary-hover hover:text-on-primary motion-safe:transition-colors group-data-collapsed/sidebar:justify-center group-data-collapsed/sidebar:px-1.5"
        >
          <Plus size={16} aria-hidden="true" className="shrink-0" />
          {/* Hidden while collapsed, but still the link's name. */}
          <span className="group-data-collapsed/sidebar:sr-only">New application</span>
        </Link>

        <NavLinks counts={counts} />
      </div>

      <div className="flex flex-col gap-0.5 border-t border-line p-2 group-data-collapsed/sidebar:px-1">
        <ThemeToggle serverScheme={colorScheme} />
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3 group-data-collapsed/sidebar:flex-col group-data-collapsed/sidebar:px-1">
        <span
          aria-hidden="true"
          title={userName}
          className="grid size-[26px] shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-white"
        >
          {initials(userName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col group-data-collapsed/sidebar:hidden">
          <span className="truncate text-xs font-medium">{userName}</span>
          <span className="truncate text-[11px] text-muted">Self-hosted · v{appVersion}</span>
        </span>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="grid size-[26px] place-items-center rounded-control text-muted hover:bg-hover hover:text-ink"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </form>
      </div>
    </SidebarFrame>
  );
}
