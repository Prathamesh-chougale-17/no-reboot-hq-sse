'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { AccountSignUpInputSchema } from '@acme/shared';
import { Button, Input } from '@acme/ui';

import { authClient } from '@/lib/auth-client';
import { useInvitationPreviewQuery } from '@/lib/queries';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to finish sign-up right now.';

export function SignUpForm({
  redirectTo,
  invitationId,
}: {
  redirectTo: string | undefined;
  invitationId: string | undefined;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const invitationPreviewQuery = useInvitationPreviewQuery(invitationId);
  const invitationPreview = invitationPreviewQuery.data;
  const targetPath = useMemo(
    () =>
      redirectTo ||
      (invitationId
        ? `/accept-invite?invitationId=${encodeURIComponent(invitationId)}`
        : '/onboarding'),
    [invitationId, redirectTo],
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          try {
            if (invitationId && !invitationPreview?.email) {
              setError('Invitation details are still loading. Try again in a moment.');
              return;
            }

            const payload = AccountSignUpInputSchema.parse({
              name: formData.get('name'),
              email: invitationPreview?.email ?? formData.get('email'),
              password: formData.get('password'),
              redirectTo: targetPath,
              invitationId,
            });

            const { error: signUpError } = await authClient.signUp.email({
              name: payload.name,
              email: payload.email,
              password: payload.password,
            });

            if (signUpError) {
              setError(signUpError.message ?? 'Unable to create your account.');
              return;
            }

            router.push(targetPath as never);
            router.refresh();
          } catch (caughtError) {
            setError(getErrorMessage(caughtError));
          }
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-700 dark:text-slate-300"
            htmlFor="sign-up-name"
          >
            Full name
          </label>
          <Input id="sign-up-name" name="name" placeholder="Jane Doe" required />
        </div>
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-700 dark:text-slate-300"
            htmlFor="sign-up-email"
          >
            Work email
          </label>
          {invitationId ? (
            <>
              <Input
                id="sign-up-email"
                value={
                  invitationPreviewQuery.isPending
                    ? 'Loading invited email...'
                    : (invitationPreview?.email ?? '')
                }
                disabled
                readOnly
              />
              {invitationPreview?.email ? (
                <input name="email" type="hidden" value={invitationPreview.email} />
              ) : null}
            </>
          ) : (
            <Input
              id="sign-up-email"
              name="email"
              type="email"
              placeholder="jane@acme.com"
              required
            />
          )}
        </div>
      </div>
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700 dark:text-slate-300"
          htmlFor="sign-up-password"
        >
          Password
        </label>
        <Input
          id="sign-up-password"
          name="password"
          type="password"
          placeholder="At least 8 characters"
          required
        />
      </div>
      {invitationPreview ? (
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          This account will be created for an invitation to{' '}
          <strong className="text-slate-950 dark:text-slate-50">
            {invitationPreview.organizationName}
          </strong>
          .
        </p>
      ) : null}
      {invitationPreviewQuery.isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">Unable to load invitation details.</p>
      ) : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button
        type="submit"
        className="w-full"
        disabled={isPending || (Boolean(invitationId) && !invitationPreview)}
      >
        {isPending ? 'Creating account...' : 'Create account'}
      </Button>
    </form>
  );
}
