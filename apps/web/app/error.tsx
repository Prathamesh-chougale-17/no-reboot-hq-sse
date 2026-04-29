'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { Button } from '@acme/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <section className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800">
          <div>
            <h1 className="text-base font-semibold text-slate-950 dark:text-slate-50">
              Something went wrong
            </h1>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              The web app hit an unexpected error while rendering this page. The failure is safe to
              retry and, when configured, will be captured by Sentry.
            </p>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Resetting will re-run the current route and fetch the latest server state.
          </p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </section>
    </div>
  );
}
