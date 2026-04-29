import Link from 'next/link';

import { APP_NAME } from '@acme/shared';

const panelClassName =
  'rounded-xl border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none';
const panelHeaderClassName =
  'flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800';

export function AuthShell({
  eyebrow,
  title,
  description,
  alternateHref,
  alternateLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  alternateHref?: string;
  alternateLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,0.7fr)] lg:items-start">
      <section className="space-y-8 pt-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {eyebrow}
          </p>
          <h1 className="mt-1 max-w-3xl text-4xl font-semibold leading-none text-slate-950 dark:text-slate-50 md:text-6xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
            {description}
          </p>
        </div>

        <div className={`${panelClassName} max-w-2xl`}>
          <div className={panelHeaderClassName}>
            <div>
              <p className="text-base font-semibold text-slate-950 dark:text-slate-50">
                {APP_NAME}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Auth, organizations, and API access in one flow.
              </p>
            </div>
          </div>
          <div className="grid gap-0 sm:grid-cols-3">
            {['Sessions', 'RBAC', 'Contracts'].map((item) => (
              <div
                key={item}
                className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 last:border-b-0 dark:border-slate-800 dark:text-slate-300 sm:border-b-0 sm:border-r sm:last:border-r-0"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        {alternateHref && alternateLabel ? (
          <Link
            href={alternateHref as never}
            className="text-sm font-semibold text-teal-700 dark:text-teal-300"
          >
            {alternateLabel}
          </Link>
        ) : null}
      </section>

      <section className={panelClassName}>
        <div className="p-4">{children}</div>
      </section>
    </div>
  );
}
