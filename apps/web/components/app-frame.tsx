import type { Route } from "next";
import Link from "next/link";

import { canViewOperationalDashboards } from "@acme/auth";
import { APP_NAME, type CurrentUserDto } from "@acme/shared";

import { HeaderMenu, type HeaderNavItem } from "@/components/header-menu";

const headerNavItems: HeaderNavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/configs", label: "Configs" },
  { href: "/health", label: "Health", requiresPrivilege: true },
  { href: "/users", label: "Users" },
  { href: "/api/v1/docs", label: "API Docs", kind: "link" },
];

export const getVisibleHeaderNavItems = (
  currentUser: CurrentUserDto | null,
): HeaderNavItem[] =>
  headerNavItems.filter(
    (item) =>
      !item.requiresPrivilege ||
      canViewOperationalDashboards(currentUser?.role),
  );

export function AppFrame({
  currentUser,
  navItems,
  children,
}: {
  currentUser: CurrentUserDto | null;
  navItems: HeaderNavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate min-h-screen before:pointer-events-none before:fixed before:inset-0 before:-z-10 before:bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] before:bg-[size:48px_48px] before:[mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.45),transparent_38rem)] dark:before:bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] dark:before:[mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.38),transparent_38rem)]">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-lg dark:border-slate-800/90 dark:bg-slate-950/86">
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href={"/" as Route}
            className="flex min-w-fit items-center gap-3 text-sm font-semibold"
          >
            <span className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-slate-900 text-xs font-bold text-white dark:border-slate-700 dark:bg-slate-100 dark:text-slate-950">
              NR
            </span>
            <span className="text-base text-slate-950 dark:text-slate-50">
              {APP_NAME}
            </span>
          </Link>
          <HeaderMenu currentUser={currentUser} navItems={navItems} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
