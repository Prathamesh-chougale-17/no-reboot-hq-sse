'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { SignInInputSchema } from '@acme/shared';
import { Button, Input } from '@acme/ui';

import { authClient } from '@/lib/auth-client';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to sign you in right now.';

export function SignInForm({ redirectTo }: { redirectTo: string | undefined }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const targetPath = useMemo(() => redirectTo || '/onboarding', [redirectTo]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          try {
            const payload = SignInInputSchema.parse({
              email: formData.get('email'),
              password: formData.get('password'),
              redirectTo: targetPath,
            });
            const { error: signInError } = await authClient.signIn.email(payload);

            if (signInError) {
              setError(signInError.message ?? 'Unable to sign you in.');
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
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700 dark:text-slate-300"
          htmlFor="sign-in-email"
        >
          Work email
        </label>
        <Input id="sign-in-email" name="email" type="email" placeholder="jane@acme.com" required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label
            className="text-sm font-medium text-slate-700 dark:text-slate-300"
            htmlFor="sign-in-password"
          >
            Password
          </label>
          <Link
            href={'/forgot-password' as never}
            className="text-xs font-semibold text-teal-700 dark:text-teal-300"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="sign-in-password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
        />
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  );
}
