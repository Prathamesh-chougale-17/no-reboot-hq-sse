import type { Route } from 'next';
import Link from 'next/link';

import { Badge, Button } from '@acme/ui';

import { publicEnv } from '@/lib/env';

const platformAreas: Array<{
  title: string;
  description: string;
  href: Route | `/${string}`;
  kind?: 'page' | 'link';
  status: 'ready' | 'configured' | 'optional';
}> = [
  {
    title: 'Members',
    description: 'Review organization access, roles, invitations, and audit activity.',
    href: '/users',
    status: 'ready',
  },
  {
    title: 'Health',
    description: 'Inspect API checks, service metadata, and the current runtime payload.',
    href: '/health',
    status: 'configured',
  },
  {
    title: 'API Docs',
    description: 'Open the generated service contract for the versioned Hono API.',
    href: '/api/v1/docs',
    kind: 'link',
    status: 'ready',
  },
];

const statusLabels: Record<(typeof platformAreas)[number]['status'], string> = {
  ready: 'Ready',
  configured: 'Configured',
  optional: 'Optional',
};

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
const dataRowClassName =
  'flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 pt-3 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Platform Overview
          </p>
          <h1 className="mt-1 text-4xl font-semibold leading-none text-slate-950 dark:text-slate-50 md:text-6xl">
            ACME Platform
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
            A clean operating surface for the starter: authenticated workspaces, member workflows,
            API health, and production configuration in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/users">
            <Button>Open workspace</Button>
          </Link>
          <Link href="/health">
            <Button variant="secondary">View health</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Environment</p>
          <p className={metricValueClassName}>{publicEnv.NEXT_PUBLIC_APP_ENV}</p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>API path</p>
          <p className="mt-3 break-all font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
            /api/v1
          </p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Application state</p>
          <p className={metricValueClassName}>Operational</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.8fr)]">
        <div className={panelClassName}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>Workspace Areas</h2>
              <p className={sectionCopyClassName}>Primary places a team will use after setup.</p>
            </div>
          </div>
          <div>
            {platformAreas.map((area) => {
              const content = (
                <div
                  className={`${dataRowClassName} transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/70`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-950 dark:text-slate-50">{area.title}</p>
                      <Badge variant="outline">{statusLabels[area.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {area.description}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-teal-700 dark:text-teal-300">Open</span>
                </div>
              );

              if (area.kind === 'link') {
                return (
                  <a key={area.title} href={area.href}>
                    {content}
                  </a>
                );
              }

              return (
                <Link key={area.title} href={area.href as Route}>
                  {content}
                </Link>
              );
            })}
          </div>
        </div>

        <div className={panelClassName}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>Readiness</h2>
              <p className={sectionCopyClassName}>Core platform concerns wired into the app.</p>
            </div>
          </div>
          <div>
            {['Auth session', 'Organization RBAC', 'Shared DTOs', 'Health contract'].map((item) => (
              <div key={item} className={dataRowClassName}>
                <span className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span className="size-2 rounded-full bg-teal-600 dark:bg-teal-400" />
                  {item}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">Live</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
