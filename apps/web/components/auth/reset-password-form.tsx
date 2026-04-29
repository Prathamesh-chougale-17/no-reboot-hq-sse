'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { ResetPasswordInputSchema } from '@acme/shared';
import { Button, Input } from '@acme/ui';

import { authClient } from '@/lib/auth-client';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to reset your password.';

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!token) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">Reset token missing or expired.</p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          try {
            const payload = ResetPasswordInputSchema.parse({
              token,
              newPassword: formData.get('newPassword'),
            });
            const response = (await authClient.resetPassword(payload)) as {
              error?: {
                message?: string;
              } | null;
            };
            const resetError = response.error;

            if (resetError) {
              setError(resetError.message ?? 'Unable to reset your password.');
              return;
            }

            router.push('/sign-in?reset=success' as never);
            router.refresh();
          } catch (caughtError) {
            setError(getErrorMessage(caughtError));
          }
        });
      }}
    >
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700 dark:text-slate-300"
          htmlFor="reset-password"
        >
          New password
        </label>
        <Input
          id="reset-password"
          name="newPassword"
          type="password"
          placeholder="At least 8 characters"
          required
        />
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Updating password...' : 'Reset password'}
      </Button>
    </form>
  );
}
