'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { OrganizationSummaryDto } from '@acme/shared';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@acme/ui';

import { authClient } from '@/lib/auth-client';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to switch the active workspace right now.';

export function OrganizationSwitcher({
  organizations: initialOrganizations,
  currentOrganizationId,
  currentOrganizationName,
  className,
  showLabel = true,
  forceVisible = false,
  onSwitchComplete,
}: {
  organizations: OrganizationSummaryDto[];
  currentOrganizationId: string | null;
  currentOrganizationName?: string | null;
  className?: string;
  showLabel?: boolean;
  forceVisible?: boolean;
  onSwitchComplete?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const organizationsQuery = authClient.useListOrganizations();
  const activeOrganizationQuery = authClient.useActiveOrganization();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const organizations = organizationsQuery.data ?? initialOrganizations;
  const activeOrganizationId =
    activeOrganizationQuery.data?.id ?? currentOrganizationId ?? undefined;
  const activeOrganizationName =
    organizations.find((organization) => organization.id === activeOrganizationId)?.name ??
    activeOrganizationQuery.data?.name ??
    currentOrganizationName ??
    organizations[0]?.name ??
    'Choose workspace';
  const deniedTarget = searchParams.get('denied');
  const nextRoute = useMemo(() => {
    if (deniedTarget?.startsWith('/')) {
      return deniedTarget;
    }

    return pathname ?? '/users';
  }, [deniedTarget, pathname]);

  if (organizations.length <= 1) {
    return (
      <div
        className={cn(
          'min-w-72 flex-col gap-1.5',
          forceVisible ? 'flex' : 'hidden md:flex',
          className,
        )}
      >
        {showLabel ? (
          <span className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Workspace
          </span>
        ) : null}
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
          <span className="block truncate">{currentOrganizationName}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('min-w-72 flex-col gap-2', forceVisible ? 'flex' : 'hidden md:flex', className)}
    >
      {showLabel ? (
        <span className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          Workspace
        </span>
      ) : null}
      <Select
        value={activeOrganizationId}
        onValueChange={(organizationId: string | null) => {
          if (!organizationId) {
            return;
          }

          if (organizationId === activeOrganizationId) {
            return;
          }

          setError(null);
          startTransition(async () => {
            try {
              const response = (await authClient.organization.setActive({
                organizationId,
              })) as {
                error?: {
                  message?: string;
                } | null;
              };

              if (response.error) {
                setError(response.error.message ?? 'Unable to switch organization.');
                return;
              }

              router.push(nextRoute as never);
              router.refresh();
              onSwitchComplete?.();
            } catch (caughtError) {
              setError(getErrorMessage(caughtError));
            }
          });
        }}
        disabled={isPending || organizationsQuery.isPending}
      >
        <SelectTrigger className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-none focus-visible:border-teal-500/40 focus-visible:ring-2 focus-visible:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:focus-visible:border-teal-400/40 dark:focus-visible:ring-teal-400/20">
          <SelectValue placeholder={currentOrganizationName}>
            {(value: string | null) =>
              organizations.find((organization) => organization.id === value)?.name ??
              activeOrganizationName
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-slate-950">
          {organizations.map((organization) => (
            <SelectItem
              key={organization.id}
              value={organization.id}
              className="rounded-md text-slate-700 dark:text-slate-300"
            >
              {organization.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertTitle>Workspace switch failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
