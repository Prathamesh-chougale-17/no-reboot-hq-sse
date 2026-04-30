import { subscribeToConfigEvents } from "@acme/events";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { jsonSuccess } from "../../lib/http";
import {
  decrementConfigSseConnections,
  incrementConfigSseConnections,
} from "../../lib/metrics";
import type { AppContext } from "../../middleware/request-context";
import type { ConfigService } from "../../services/config-service";

export const createClientConfigRoutes = ({
  configService,
}: {
  configService: ConfigService;
}) => {
  const router = new Hono<AppContext>();

  router.get("/client/config", async (c) => {
    const serviceToken = await configService.authenticateServiceClient(
      new Headers(c.req.raw.headers),
    );
    const snapshot = await configService.getServiceSnapshot(serviceToken);

    return jsonSuccess(c, 200, snapshot);
  });

  router.get("/client/config/events", async (c) => {
    const serviceToken = await configService.authenticateServiceClient(
      new Headers(c.req.raw.headers),
    );

    return streamSSE(c, async (stream) => {
      const abortController = new AbortController();
      incrementConfigSseConnections("client");
      stream.onAbort(() => {
        abortController.abort();
        decrementConfigSseConnections("client");
      });

      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({
          environmentId: serviceToken.environmentId,
        }),
      });

      await subscribeToConfigEvents({
        groupId: `nrhq-client-${serviceToken.environmentId}-${crypto.randomUUID()}`,
        signal: abortController.signal,
        onEvent: async (event) => {
          if (!configService.serviceTokenCanReadEvent(serviceToken, event)) {
            return;
          }

          await stream.writeSSE({
            id: event.id,
            event: event.eventType,
            data: JSON.stringify(event),
          });
        },
      });

      while (!abortController.signal.aborted) {
        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        });
        await stream.sleep(15_000);
      }
    });
  });

  return router;
};
