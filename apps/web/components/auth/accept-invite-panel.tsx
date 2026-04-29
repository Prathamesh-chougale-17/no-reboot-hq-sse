'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { CurrentUserDto } from '@acme/shared';
import { Button } from '@acme/ui';

import { apiClient } from '@/lib/api-client';
import { useInvitationPreviewQuery } from '@/lib/queries';
import { SignOutButton } from '@/components/sign-out-button';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to accept the invitation right now.';

export function AcceptInvitePanel({
  invitationId,
  viewer,
}: {
  invitationId: string | undefined;
  viewer: CurrentUserDto | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const invitationPreviewQuery = useInvitationPreviewQuery(invitationId);
  const invitation = invitationPreviewQuery.data;
  const isAuthenticated = Boolean(viewer);
  const isWrongAccount =
    Boolean(viewer && invitation) &&
    viewer!.user.email.trim().toLowerCase() !== invitation!.email.trim().toLowerCase();

  if (!invitationId) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">Invitation id missing from the URL.</p>
    );
  }

  if (invitationPreviewQuery.isPending) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">Loading invitation details...</p>
    );
  }

  if (invitationPreviewQuery.isError || !invitation) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">Unable to load invitation details.</p>
    );
  }

  if (!isAuthenticated) {
    const redirectTo = `/accept-invite?invitationId=${encodeURIComponent(invitationId)}`;

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
          <p className="font-semibold text-slate-950 dark:text-slate-50">
            {invitation.organizationName}
          </p>
          <p className="mt-2">Invitee: {invitation.email}</p>
          <p className="mt-1">Role: {invitation.role}</p>
        </div>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          Sign in or create an account with the invited email address before accepting this invite.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}` as never}>
            <Button>Sign in to continue</Button>
          </Link>
          <Link
            href={
              `/sign-up?redirectTo=${encodeURIComponent(redirectTo)}&invitationId=${encodeURIComponent(invitationId)}` as never
            }
          >
            <Button variant="secondary">Create account</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isWrongAccount) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
          <p className="font-semibold text-slate-950 dark:text-slate-50">
            {invitation.organizationName}
          </p>
          <p className="mt-2">Invitee: {invitation.email}</p>
          <p className="mt-1">Signed in as: {viewer?.user.email}</p>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">
          This invitation is for {invitation.email}. Switch accounts to continue.
        </p>
        <SignOutButton variant="secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
        <p className="font-semibold text-slate-950 dark:text-slate-50">
          {invitation.organizationName}
        </p>
        <p className="mt-2">Invitee: {invitation.email}</p>
        <p className="mt-1">Role: {invitation.role}</p>
        <p className="mt-1">Status: {invitation.status}</p>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await apiClient.acceptInvitation(invitationId);
              router.push('/users' as never);
              router.refresh();
            } catch (caughtError) {
              setError(getErrorMessage(caughtError));
            }
          });
        }}
      >
        {isPending ? 'Accepting invitation...' : 'Accept invitation'}
      </Button>
    </div>
  );
}
