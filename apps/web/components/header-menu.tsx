'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Route } from 'next';
import type { CurrentUserDto } from '@acme/shared';
import { Badge, Button, Separator, cn } from '@acme/ui';

import { OrganizationSwitcher } from '@/components/organization-switcher';
import { SignOutButton } from '@/components/sign-out-button';

export type HeaderNavItem =
  | { href: Route; label: string; requiresPrivilege?: boolean; kind?: 'page' }
  | { href: `/${string}`; label: string; requiresPrivilege?: boolean; kind: 'link' };

const isNavItemActive = (pathname: string | null, item: HeaderNavItem) => {
  if (!pathname || item.kind === 'link') {
    return false;
  }

  return item.href === '/'
    ? pathname === '/'
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
};

function NavItem({
  item,
  active,
  onClick,
}: {
  item: HeaderNavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    'inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50',
    active && 'bg-teal-50 text-teal-700 dark:bg-teal-950/45 dark:text-teal-200',
  );

  if (item.kind === 'link') {
    return (
      <a href={item.href} className={className} {...(onClick ? { onClick } : {})}>
        {item.label}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className} {...(onClick ? { onClick } : {})}>
      {item.label}
    </Link>
  );
}

export function HeaderMenu({
  currentUser,
  navItems,
}: {
  currentUser: CurrentUserDto | null;
  navItems: HeaderNavItem[];
}) {
  const pathname = usePathname();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const workspaceLabel = useMemo(() => {
    if (!currentUser) return 'Account';
    if (currentUser.organization) return currentUser.organization.name;
    if (currentUser.organizations.length > 0) return 'Select workspace';
    return 'Set up workspace';
  }, [currentUser]);

  const userInitial = currentUser?.user.email.slice(0, 1).toUpperCase() ?? 'A';

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
      <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
        {navItems.map((item) => (
          <NavItem key={item.href} item={item} active={isNavItemActive(pathname, item)} />
        ))}
      </nav>

      <div ref={menuRef} className="relative">
        <Button
          variant="secondary"
          aria-controls={menuId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className="h-10 gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-900"
          onClick={() => {
            setIsOpen((open) => !open);
          }}
        >
          <span className="grid size-6 place-items-center rounded-md bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
            {userInitial}
          </span>
          <span className="hidden max-w-44 truncate sm:block">{workspaceLabel}</span>
          <span
            className={cn(
              'text-slate-400 transition-transform dark:text-slate-500',
              isOpen && 'rotate-180',
            )}
          >
            ▾
          </span>
        </Button>

        {isOpen ? (
          <div
            id={menuId}
            role="dialog"
            aria-label="Header menu"
            className="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white/98 shadow-[0_24px_70px_rgba(15,23,42,0.14),0_1px_2px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950/98 dark:shadow-[0_24px_70px_rgba(0,0,0,0.36)]"
          >
            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                    {currentUser ? currentUser.user.email : 'Not signed in'}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {currentUser?.organization
                      ? currentUser.organization.name
                      : currentUser
                        ? 'Choose or create a workspace to continue.'
                        : 'Sign in to manage workspaces and members.'}
                  </p>
                </div>
                {currentUser?.role ? (
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {currentUser.role}
                  </Badge>
                ) : null}
              </div>

              <Separator />

              <nav aria-label="Primary menu" className="grid gap-1 lg:hidden">
                {navItems.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    active={isNavItemActive(pathname, item)}
                    onClick={() => {
                      setIsOpen(false);
                    }}
                  />
                ))}
              </nav>

              {currentUser ? (
                <>
                  {currentUser.organizations.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                          Workspace
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Switch the active session.
                        </p>
                      </div>
                      <OrganizationSwitcher
                        organizations={currentUser.organizations}
                        currentOrganizationId={currentUser.organization?.id ?? null}
                        currentOrganizationName={currentUser.organization?.name ?? null}
                        forceVisible
                        showLabel={false}
                        className="min-w-0"
                        onSwitchComplete={() => {
                          setIsOpen(false);
                        }}
                      />
                    </div>
                  ) : (
                    <Link
                      className="flex min-h-11 items-center justify-between gap-4 rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-teal-50 hover:text-teal-700 dark:text-slate-300 dark:hover:bg-teal-950/45 dark:hover:text-teal-200"
                      href="/onboarding"
                      onClick={() => {
                        setIsOpen(false);
                      }}
                    >
                      Continue onboarding
                    </Link>
                  )}

                  <Separator />
                  <SignOutButton className="w-full justify-center" />
                </>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link
                    href={'/sign-in' as never}
                    onClick={() => {
                      setIsOpen(false);
                    }}
                  >
                    <Button variant="secondary" className="w-full justify-center">
                      Sign in
                    </Button>
                  </Link>
                  <Link
                    href={'/sign-up' as never}
                    onClick={() => {
                      setIsOpen(false);
                    }}
                  >
                    <Button className="w-full justify-center">Create account</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
