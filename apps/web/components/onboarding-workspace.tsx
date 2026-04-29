'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { Alert, AlertDescription, AlertTitle, Button, Input, Skeleton } from '@acme/ui';

import { authClient } from '@/lib/auth-client';
import { apiClient } from '@/lib/api-client';
import { useOnboardingQuery } from '@/lib/queries';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to complete onboarding right now.';

const pageHeaderClassName =
  'flex flex-col gap-4 border-b border-slate-200 pb-5 pt-3 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between';
const eyebrowClassName =
  'text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400';
const pageTitleClassName =
  'mt-1 text-4xl font-semibold leading-none text-slate-950 dark:text-slate-50 md:text-6xl';
const pageSubtitleClassName =
  'mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300';
const panelClassName =
  'rounded-xl border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none';
const panelHeaderClassName =
  'flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800';
const panelBodyClassName = 'p-4';
const sectionTitleClassName = 'text-base font-semibold text-slate-950 dark:text-slate-50';
const sectionCopyClassName = 'mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400';
const dataRowClassName =
  'flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800';

export function OnboardingWorkspace({ redirectTo = '/users' }: { redirectTo?: string }) {
  const router = useRouter();
  const onboardingQuery = useOnboardingQuery();
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, startCreating] = useTransition();
  const [isSelecting, startSelecting] = useTransition();

  const state = onboardingQuery.data;
  const organizations = state?.viewer.organizations ?? [];
  const onlyOrganization = organizations.length === 1 ? organizations[0] : null;
  const destination = useMemo(() => redirectTo || '/users', [redirectTo]);

  useEffect(() => {
    if (!state) {
      return;
    }

    if (state.nextStep === 'ready') {
      router.replace(destination as never);
      return;
    }

    if (state.nextStep === 'select-workspace' && onlyOrganization) {
      setError(null);
      startSelecting(async () => {
        try {
          const response = (await authClient.organization.setActive({
            organizationId: onlyOrganization.id,
          })) as {
            error?: {
              message?: string;
            } | null;
          };

          if (response.error) {
            setError(response.error.message ?? 'Unable to activate the workspace.');
            return;
          }

          router.replace(destination as never);
          router.refresh();
        } catch (caughtError) {
          setError(getErrorMessage(caughtError));
        }
      });
    }
  }, [destination, onlyOrganization, router, state]);

  const activateWorkspace = (organizationId: string) => {
    setError(null);
    startSelecting(async () => {
      try {
        const response = (await authClient.organization.setActive({
          organizationId,
        })) as {
          error?: {
            message?: string;
          } | null;
        };

        if (response.error) {
          setError(response.error.message ?? 'Unable to activate the workspace.');
          return;
        }

        router.replace(destination as never);
        router.refresh();
      } catch (caughtError) {
        setError(getErrorMessage(caughtError));
      }
    });
  };

  const createWorkspace = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startCreating(async () => {
      try {
        const slug = slugify(workspaceName);

        if (!slug) {
          setError('Please choose a workspace name.');
          return;
        }

        await apiClient.createWorkspace({
          name: workspaceName.trim(),
          slug,
        });
        router.replace(destination as never);
        router.refresh();
      } catch (caughtError) {
        setError(getErrorMessage(caughtError));
      }
    });
  };

  if (onboardingQuery.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <section className={pageHeaderClassName}>
          <div>
            <p className={eyebrowClassName}>Onboarding</p>
            <h1 className={pageTitleClassName}>Preparing Workspace</h1>
          </div>
        </section>
        <section className={panelClassName}>
          <div className="space-y-2 p-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </section>
      </div>
    );
  }

  if (onboardingQuery.isError || !state) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Onboarding unavailable</AlertTitle>
        <AlertDescription>{getErrorMessage(onboardingQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={pageHeaderClassName}>
        <div>
          <p className={eyebrowClassName}>Onboarding</p>
          <h1 className={pageTitleClassName}>Choose Workspace</h1>
          <p className={pageSubtitleClassName}>
            Join an invited organization or create the first workspace for your account.
          </p>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Onboarding needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className={panelClassName}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>Available Workspaces</h2>
              <p className={sectionCopyClassName}>Memberships and invitations for this account.</p>
            </div>
          </div>
          <div>
            {state.pendingInvitations.length > 0
              ? state.pendingInvitations.map((invitation) => (
                  <div key={invitation.id} className={dataRowClassName}>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950 dark:text-slate-50">
                        {invitation.organizationName}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                        {invitation.role} invite for {invitation.email}
                      </p>
                    </div>
                    <Link
                      href={
                        `/accept-invite?invitationId=${encodeURIComponent(invitation.id)}` as never
                      }
                    >
                      <Button variant="secondary">Review</Button>
                    </Link>
                  </div>
                ))
              : null}

            {state.nextStep === 'select-workspace' && organizations.length > 1
              ? organizations.map((organization) => (
                  <div key={organization.id} className={dataRowClassName}>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950 dark:text-slate-50">
                        {organization.name}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                        {organization.slug}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={isSelecting}
                      onClick={() => activateWorkspace(organization.id)}
                    >
                      {isSelecting ? 'Activating' : 'Use workspace'}
                    </Button>
                  </div>
                ))
              : null}

            {state.nextStep === 'select-workspace' && onlyOrganization ? (
              <div className={dataRowClassName}>
                <div>
                  <p className="font-medium text-slate-950 dark:text-slate-50">
                    {onlyOrganization.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    This workspace is being selected for the session.
                  </p>
                </div>
                <Button disabled>{isSelecting ? 'Activating' : 'Activate'}</Button>
              </div>
            ) : null}

            {state.pendingInvitations.length === 0 &&
            !(state.nextStep === 'select-workspace' && organizations.length > 0) ? (
              <div className={panelBodyClassName}>
                <Alert>
                  <AlertTitle>No workspaces found</AlertTitle>
                  <AlertDescription>Create a workspace to continue.</AlertDescription>
                </Alert>
              </div>
            ) : null}
          </div>
        </div>

        {state.canCreateWorkspace ? (
          <div className={panelClassName}>
            <div className={panelHeaderClassName}>
              <div>
                <h2 className={sectionTitleClassName}>Create Workspace</h2>
                <p className={sectionCopyClassName}>Use a clear organization name.</p>
              </div>
            </div>
            <div className={panelBodyClassName}>
              <form className="space-y-3" onSubmit={createWorkspace}>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                    htmlFor="workspace-name"
                  >
                    Workspace name
                  </label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="Acme Platform"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isCreating}>
                  {isCreating ? 'Creating workspace' : 'Create workspace'}
                </Button>
              </form>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
