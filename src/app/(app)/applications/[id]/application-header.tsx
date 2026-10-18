import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageBar } from "@/components/page-header";

/**
 * The top of an application's page (APP-1): the page bar with the breadcrumb,
 * the title and the actions (status, downloads), then the meta line and the
 * tabs.
 */
export function ApplicationHeader({
  title,
  meta,
  actions,
  children,
}: {
  title: string;
  /** Location, work mode, salary, deadline, created: whichever are known. */
  meta: string[];
  actions: ReactNode;
  /** The tab list, drawn on the header's bottom line. */
  children?: ReactNode;
}) {
  const name = title.trim() || "Untitled application";
  return (
    <>
      <PageBar>
        <div className="flex min-w-0 items-center gap-1.5">
          <nav aria-label="Breadcrumb" className="shrink-0">
            <ol className="flex items-center gap-1.5 text-base font-semibold text-muted">
              <li>
                <Link href="/applications" className="text-muted hover:text-ink">
                  Applications
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight size={16} />
              </li>
            </ol>
          </nav>
          <h1 className="truncate text-base font-semibold">{name}</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </PageBar>
      <div className="flex flex-col gap-[18px] border-b border-line px-10 pt-5">
        {meta.length > 0 && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-muted">
            {meta.map((part) => (
              <span key={part}>{part}</span>
            ))}
          </p>
        )}
        {children}
      </div>
    </>
  );
}
