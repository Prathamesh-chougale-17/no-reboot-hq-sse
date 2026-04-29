import * as Sentry from '@sentry/node';
import { serve } from '@hono/node-server';
import { loadApiEnv } from '@acme/config';
import { createLogger } from '@acme/logger';
import { startObservability, stopObservability } from '@acme/observability';

import { createApp } from './app';

const SERVER_SHUTDOWN_TIMEOUT_MS = 10_000;
const SENTRY_FLUSH_TIMEOUT_MS = 2_000;

type GracefulServer = ReturnType<typeof serve> & {
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
};

const env = loadApiEnv(process.env);
const enableLoki = env.API_LOG_TO_LOKI && Boolean(env.LOKI_URL);
const bootstrapLogger = createLogger({
  serviceName: env.API_SERVICE_NAME,
  environment: env.NODE_ENV,
  level: env.API_LOG_LEVEL,
  ...(env.LOKI_URL ? { lokiUrl: env.LOKI_URL } : {}),
  enablePretty: env.NODE_ENV !== 'production',
  enableLoki,
});

bootstrapLogger.info(
  {
    port: env.PORT,
    logToLoki: enableLoki,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  'bootstrapping api server',
);

let server: GracefulServer | undefined;
let shutdownPromise: Promise<void> | undefined;

const withTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      });
  });

const closeServer = async (): Promise<void> => {
  if (!server?.listening) {
    return;
  }

  server.closeIdleConnections?.();

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }),
    SERVER_SHUTDOWN_TIMEOUT_MS,
    () => {
      server?.closeAllConnections?.();
    },
  );
};

const shutdown = async ({
  reason,
  exitCode,
  error,
}: {
  reason: string;
  exitCode: number;
  error?: unknown;
}): Promise<void> => {
  if (shutdownPromise) {
    bootstrapLogger.warn({ reason }, 'shutdown already in progress');
    return shutdownPromise;
  }

  process.exitCode = exitCode;

  shutdownPromise = (async () => {
    if (error) {
      bootstrapLogger.error({ err: error, reason }, 'fatal error triggered shutdown');
      Sentry.captureException(error);
    } else {
      bootstrapLogger.info({ reason }, 'shutting down api server');
    }

    try {
      await closeServer();
      bootstrapLogger.info('http server closed');
    } catch (shutdownError) {
      bootstrapLogger.error({ err: shutdownError }, 'failed to close http server cleanly');
    }

    try {
      await stopObservability();
      bootstrapLogger.info('observability stopped');
    } catch (shutdownError) {
      bootstrapLogger.error({ err: shutdownError }, 'failed to stop observability cleanly');
    }

    try {
      await Sentry.close(SENTRY_FLUSH_TIMEOUT_MS);
      bootstrapLogger.info('sentry flushed');
    } catch (shutdownError) {
      bootstrapLogger.error({ err: shutdownError }, 'failed to flush sentry cleanly');
    }

    bootstrapLogger.flush?.();
  })();

  await shutdownPromise;
};

const main = async () => {
  await startObservability({
    serviceName: env.API_SERVICE_NAME,
    environment: env.NODE_ENV,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  const app = createApp({ env });

  server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      bootstrapLogger.info(
        {
          port: info.port,
        },
        'api server started',
      );
    },
  ) as GracefulServer;
};

process.on('SIGINT', () => {
  void shutdown({ reason: 'SIGINT', exitCode: 0 });
});

process.on('SIGTERM', () => {
  void shutdown({ reason: 'SIGTERM', exitCode: 0 });
});

process.on('uncaughtException', (error) => {
  void shutdown({ reason: 'uncaughtException', exitCode: 1, error });
});

process.on('unhandledRejection', (reason) => {
  void shutdown({
    reason: 'unhandledRejection',
    exitCode: 1,
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
});

const start = async () => {
  try {
    await main();
  } catch (error) {
    await shutdown({ reason: 'startupFailure', exitCode: 1, error });
  }
};

void start();
