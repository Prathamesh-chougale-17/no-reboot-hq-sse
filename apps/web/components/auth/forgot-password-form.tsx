'use client';

import { useState, useTransition } from 'react';

import { ForgotPasswordInputSchema } from '@acme/shared';
import { Button, Input } from '@acme/ui';

import { authClient } from '@/lib/auth-client';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to send reset instructions.';

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setNotice(null);
        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          try {
            const payload = ForgotPasswordInputSchema.parse({
              email: formData.get('email'),
              redirectTo: `${window.location.origin}/reset-password`,
            });
            const response = (await authClient.requestPasswordReset(payload)) as {
              error?: {
                message?: string;
              } | null;
            };
            const requestError = response.error;

            if (requestError) {
              setError(requestError.message ?? 'Unable to send reset instructions.');
              return;
            }

            setNotice('Password reset instructions were sent if the account exists.');
          } catch (caughtError) {
            setError(getErrorMessage(caughtError));
          }
        });
      }}
    >
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700 dark:text-slate-300"
          htmlFor="forgot-email"
        >
          Account email
        </label>
        <Input id="forgot-email" name="email" type="email" placeholder="jane@acme.com" required />
      </div>
      {notice ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Sending reset link...' : 'Send reset link'}
      </Button>
    </form>
  );
}
