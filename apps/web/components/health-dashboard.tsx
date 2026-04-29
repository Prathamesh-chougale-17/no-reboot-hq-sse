'use client';

import { Alert, AlertDescription, AlertTitle, Badge, Button, Skeleton } from '@acme/ui';
import type { HealthDto } from '@acme/shared';

import { useHealthQuery } from '@/lib/queries';

const statusVariants: Record<
  HealthDto['checks']['api']['status'],
  'default' | 'secondary' | 'destructive'
> = {
  up: 'default',
  degraded: 'secondary',
  down: 'destructive',
};

const statusDotClass: Record<HealthDto['checks']['api']['status'], string> = {
  up: 'size-2 rounded-full bg-teal-600',
  degraded: 'size-2 rounded-full bg-amber-600',
  down: 'size-2 rounded-full bg-red-600',
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load backend health';

const metricClassName =
  'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none';
const metricLabelClassName =
  'text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400';
const metricValueClassName =
  'mt-2 text-3xl font-semibold leading-none text-slate-950 dark:text-slate-50';
const panelClassName =
  'rounded-xl border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none';
const panelHeaderClassName =
  'flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800';
const sectionTitleClassName = 'text-base font-semibold text-slate-950 dark:text-slate-50';
const sectionCopyClassName = 'mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400';

export function HealthDashboard({
  environment,
  apiAccessPath,
}: {
  environment: string;
  apiAccessPath: string;
}) {
  const healthQuery = useHealthQuery();
  const health = healthQuery.data;
  const hasBlockingError = healthQuery.isError && !health;
  const requestState = healthQuery.isPending
    ? 'Loading'
    : hasBlockingError
      ? 'Failed'
      : healthQuery.isFetching
        ? 'Refreshing'
        : 'Loaded';

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 pt-3 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Health Dashboard
          </p>
          <h1 className="mt-1 text-4xl font-semibold leading-none text-slate-950 dark:text-slate-50 md:text-6xl">
            Service Status
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
            API checks, environment wiring, and the current health contract payload.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void healthQuery.refetch()}>
          {healthQuery.isFetching && !healthQuery.isPending ? 'Refreshing' : 'Refresh'}
        </Button>
      </section>

      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Frontend env</p>
          <p className={metricValueClassName}>{environment}</p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Backend path</p>
          <p className="mt-3 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
            {apiAccessPath}
          </p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Request state</p>
          <p className={metricValueClassName}>{requestState}</p>
        </div>
      </section>

      {healthQuery.isPending ? (
        <section className={panelClassName}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>Checks</h2>
              <p className={sectionCopyClassName}>Loading latest service status.</p>
            </div>
          </div>
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        </section>
      ) : hasBlockingError ? (
        <Alert variant="destructive">
          <AlertTitle>Backend unavailable</AlertTitle>
          <AlertDescription>{getErrorMessage(healthQuery.error)}</AlertDescription>
        </Alert>
      ) : health ? (
        <>
          <section className={`${panelClassName} overflow-hidden`}>
            <div className={panelHeaderClassName}>
              <div>
                <h2 className={sectionTitleClassName}>Checks</h2>
                <p className={sectionCopyClassName}>Current status returned by the API.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Check</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {Object.entries(health.checks).map(([key, value]) => (
                    <tr key={key} className="bg-white dark:bg-slate-950/60">
                      <td className="px-4 py-3 font-medium capitalize text-slate-950 dark:text-slate-50">
                        {key}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={statusDotClass[value.status]} />
                          <Badge variant={statusVariants[value.status]}>{value.status}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {value.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={panelClassName}>
            <div className={panelHeaderClassName}>
              <div>
                <h2 className={sectionTitleClassName}>Backend Payload</h2>
                <p className={sectionCopyClassName}>
                  {health.service} · version {health.version} · uptime {health.uptimeSeconds}s
                </p>
              </div>
            </div>
            <div className="p-4">
              <pre className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100 dark:border-slate-800">
                {JSON.stringify(health, null, 2)}
              </pre>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
