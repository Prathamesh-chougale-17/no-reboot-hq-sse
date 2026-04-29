import { Writable } from 'node:stream';

import pino, { multistream, type Logger, type LoggerOptions, type StreamEntry } from 'pino';
import pretty from 'pino-pretty';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type AppLogger = Logger;

export type LoggerBindings = {
  requestId?: string;
  traceId?: string;
  route?: string;
  method?: string;
  userId?: string;
  organizationId?: string;
  role?: string;
  statusCode?: number;
  latency?: number;
};

export type CreateLoggerOptions = {
  serviceName: string;
  environment: string;
  level?: LogLevel;
  lokiUrl?: string;
  enablePretty?: boolean;
  enableLoki?: boolean;
};

export const getLoggerBindings = (bindings: LoggerBindings): LoggerBindings =>
  Object.fromEntries(Object.entries(bindings).filter(([, value]) => value !== undefined));

type LokiPayload = {
  streams: Array<{
    stream: Record<string, string>;
    values: Array<[string, string]>;
  }>;
};

class LokiWriteStream extends Writable {
  private readonly endpoint: string;
  private readonly level: LogLevel;
  private readonly batchingEnabled: boolean;
  private readonly intervalSeconds: number;
  private readonly baseLabels: Record<string, string>;
  private readonly queue: Array<{
    labels: Record<string, string>;
    line: string;
    timestamp: string;
  }> = [];
  private readonly timer?: NodeJS.Timeout;
  private flushPromise: Promise<void> | undefined;
  private lastFailureLogAt = 0;

  constructor(options: {
    host: string;
    serviceName: string;
    environment: string;
    level: LogLevel;
    batchingEnabled: boolean;
    intervalSeconds: number;
  }) {
    super();

    this.endpoint = new URL('/loki/api/v1/push', options.host).toString();
    this.level = options.level;
    this.batchingEnabled = options.batchingEnabled;
    this.intervalSeconds = options.intervalSeconds;
    this.baseLabels = {
      service: options.serviceName,
      service_name: options.serviceName,
      environment: options.environment,
    };

    if (this.batchingEnabled) {
      this.timer = setInterval(() => {
        void this.flush();
      }, this.intervalSeconds * 1000);
      this.timer.unref();
    }
  }

  override _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      this.enqueueChunk(chunk.toString());

      if (!this.batchingEnabled) {
        void this.flush().finally(() => callback());
        return;
      }

      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    void this.flush()
      .then(() => callback())
      .catch((error) => callback(error as Error));
  }

  private enqueueChunk(rawChunk: string): void {
    const lines = rawChunk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const timestamp = this.toUnixNano(parsed.time);

      this.queue.push({
        labels: {
          ...this.baseLabels,
          level: this.resolveLevel(parsed.level),
        },
        line,
        timestamp,
      });
    }
  }

  private resolveLevel(level: unknown): string {
    if (typeof level === 'string') {
      return level;
    }

    if (typeof level === 'number') {
      if (level >= 60) return 'fatal';
      if (level >= 50) return 'error';
      if (level >= 40) return 'warn';
      if (level >= 30) return 'info';
      if (level >= 20) return 'debug';
      return 'trace';
    }

    return this.level;
  }

  private toUnixNano(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${Math.trunc(value)}000000`;
    }

    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return `${parsed}000000`;
      }
    }

    return `${Date.now()}000000`;
  }

  private logFlushFailure(error: unknown): void {
    const now = Date.now();
    const oneMinuteMs = 60_000;

    if (now - this.lastFailureLogAt < oneMinuteMs) {
      return;
    }

    this.lastFailureLogAt = now;

    console.warn(
      '[logger] failed to push logs to Loki; check LOKI_URL or disable API_LOG_TO_LOKI',
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  async flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    if (this.queue.length === 0) {
      return;
    }

    const entries = this.queue.splice(0, this.queue.length);
    const streamsMap = new Map<string, LokiPayload['streams'][number]>();

    for (const entry of entries) {
      const key = JSON.stringify(entry.labels);
      const existing = streamsMap.get(key);

      if (existing) {
        existing.values.push([entry.timestamp, entry.line]);
        continue;
      }

      streamsMap.set(key, {
        stream: entry.labels,
        values: [[entry.timestamp, entry.line]],
      });
    }

    const payload: LokiPayload = {
      streams: Array.from(streamsMap.values()),
    };

    this.flushPromise = fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Loki push failed (${response.status}): ${body}`);
        }
      })
      .catch((error) => {
        this.logFlushFailure(error);
      })
      .finally(() => {
        this.flushPromise = undefined;
      });

    await this.flushPromise;
  }
}

const createDestination = (options: CreateLoggerOptions) => {
  const streams: StreamEntry[] = [];

  if (options.enablePretty) {
    streams.push({
      level: options.level ?? 'info',
      stream: pretty({
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:standard',
      }),
    });
  } else {
    streams.push({
      level: options.level ?? 'info',
      stream: pino.destination({ dest: 1, sync: false }),
    });
  }

  if (options.enableLoki && options.lokiUrl) {
    streams.push({
      level: options.level ?? 'info',
      stream: new LokiWriteStream({
        host: options.lokiUrl,
        serviceName: options.serviceName,
        environment: options.environment,
        level: options.level ?? 'info',
        batchingEnabled: !options.enablePretty,
        intervalSeconds: 5,
      }),
    });
  }

  return multistream(streams, {
    dedupe: false,
  });
};

export const createLogger = (options: CreateLoggerOptions): Logger => {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? 'info',
    name: options.serviceName,
    base: {
      service: options.serviceName,
      environment: options.environment,
    },
    // Keep timestamps numeric so Loki can turn them into valid nanosecond log timestamps.
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
  };

  return pino(loggerOptions, createDestination(options));
};
