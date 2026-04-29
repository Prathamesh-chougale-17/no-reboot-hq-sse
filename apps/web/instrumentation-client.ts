import * as Sentry from '@sentry/nextjs';

import { publicEnv } from '@/lib/env';

Sentry.init({
  dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
  enabled:
    Boolean(publicEnv.NEXT_PUBLIC_SENTRY_DSN) && publicEnv.NEXT_PUBLIC_APP_ENV === 'production',
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
