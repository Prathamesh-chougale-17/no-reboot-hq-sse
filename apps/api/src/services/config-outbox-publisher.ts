import { ensureConfigEventsTopic, publishConfigEvent } from "@acme/events";
import type { ApiEnv } from "@acme/config";
import type { ConfigRepository } from "@acme/db";
import type { AppLogger } from "@acme/logger";

import { observeConfigOutboxPublish } from "../lib/metrics";

export class ConfigOutboxPublisher {
  private readonly abortController = new AbortController();
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: ConfigRepository,
    private readonly env: ApiEnv,
    private readonly logger: AppLogger,
  ) {}

  async start(): Promise<void> {
    try {
      await ensureConfigEventsTopic(this.env);
    } catch (error) {
      this.logger.warn(
        { err: error },
        "config event topic setup failed; outbox will retry",
      );
    }

    await this.publishBatch();

    this.interval = setInterval(() => {
      void this.publishBatch();
    }, this.env.CONFIG_OUTBOX_PUBLISH_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    this.abortController.abort();

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async publishBatch(limit = 50): Promise<void> {
    if (this.abortController.signal.aborted) {
      return;
    }

    const events = await this.repository.listPendingOutboxEvents(limit);

    for (const event of events) {
      const startedAt = performance.now();

      try {
        const published = await publishConfigEvent(event.payload, this.env);
        const latency = Number((performance.now() - startedAt).toFixed(2));

        if (!published) {
          await this.repository.markOutboxFailed(
            event.id,
            "KAFKA_BROKERS is not configured; config event streaming is disabled.",
          );
          observeConfigOutboxPublish({ status: "skipped", latency });
          continue;
        }

        await this.repository.markOutboxPublished(event.id);
        observeConfigOutboxPublish({ status: "published", latency });
      } catch (error) {
        const latency = Number((performance.now() - startedAt).toFixed(2));
        const message =
          error instanceof Error
            ? error.message
            : "Config event publish failed";
        await this.repository.markOutboxFailed(event.id, message);
        observeConfigOutboxPublish({ status: "failed", latency });
        this.logger.error(
          {
            eventId: event.id,
            attempts: event.attempts,
            err: error,
          },
          "config outbox publish failed",
        );
      }
    }
  }
}
