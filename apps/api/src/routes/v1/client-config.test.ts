import { loadApiEnv } from "@acme/config";
import type { ServiceTokenRecord } from "@acme/db";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AppContext } from "../../middleware/request-context";
import type { ConfigService } from "../../services/config-service";
import { createClientConfigRoutes } from "./client-config";

const serviceToken: ServiceTokenRecord = {
  id: "aa20a6f7-85c2-4f03-8573-1a4074e3db0f",
  organizationId: "0faef1a3-1a0f-4cf6-96a0-a9382c006f17",
  environmentId: "6db490ed-fbda-4c58-9d65-c6eb4734c769",
  appId: "79d2b571-0bb3-445d-9c5c-2a2523df0f68",
  active: true,
  expiresAt: null,
  revokedAt: null,
};

const env = loadApiEnv({
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/acme_platform",
  KAFKA_BROKERS: undefined,
});

describe("client config SSE routes", () => {
  it("reports unavailable instead of connected when event streaming is disabled", async () => {
    const configService = {
      authenticateServiceClient: vi.fn(async () => serviceToken),
      serviceTokenCanReadEvent: vi.fn(() => true),
    } as unknown as ConfigService;
    const app = new Hono<AppContext>().route(
      "/api/v1",
      createClientConfigRoutes({ env, configService }),
    );

    const response = await app.request("/api/v1/client/config/events", {
      headers: {
        authorization: "Bearer nrhq_sk_test-token-secret",
      },
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("event: unavailable");
    expect(body).toContain("config_event_streaming_disabled");
    expect(body).not.toContain("event: connected");
  });
});
