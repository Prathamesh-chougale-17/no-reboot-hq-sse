import {
  CreateConfigAppInputSchema,
  CreateConfigEnvironmentInputSchema,
  CreateConfigServiceTokenInputSchema,
  RollbackConfigEntryInputSchema,
  UpsertConfigEntryInputSchema,
} from "@acme/shared";
import { subscribeToConfigEvents } from "@acme/events";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { AppError, jsonSuccess } from "../../lib/http";
import {
  decrementConfigSseConnections,
  incrementConfigSseConnections,
} from "../../lib/metrics";
import { requireAuthenticatedUser } from "../../middleware/auth-context";
import type { AppContext } from "../../middleware/request-context";
import type { ConfigService } from "../../services/config-service";

const IdParamSchema = z.object({
  appId: z.uuid().optional(),
  environmentId: z.uuid().optional(),
  entryId: z.uuid().optional(),
  tokenId: z.uuid().optional(),
});

const getClientIpAddress = (headers: Headers): string | null => {
  const forwardedFor = headers.get("x-forwarded-for");

  if (forwardedFor) {
    const [firstAddress] = forwardedFor
      .split(",")
      .map((candidate) => candidate.trim())
      .filter(Boolean);

    if (firstAddress) {
      return firstAddress;
    }
  }

  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? null;
};

const getAuditRequestMetadata = (c: Parameters<typeof jsonSuccess>[0]) => {
  const requestHeaders = new Headers(c.req.raw.headers);

  return {
    requestId: c.get("requestId"),
    ipAddress: getClientIpAddress(requestHeaders),
    userAgent: requestHeaders.get("user-agent"),
  };
};

const getAuthContext = (c: Parameters<typeof jsonSuccess>[0]) => {
  const authContext = c.get("auth");

  if (!authContext) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  return authContext;
};

export const createConfigRoutes = ({
  configService,
}: {
  configService: ConfigService;
}) => {
  const router = new Hono<AppContext>();

  router.use("/config/*", requireAuthenticatedUser());

  router.get("/config/apps", async (c) => {
    const apps = await configService.listApps(getAuthContext(c));
    return jsonSuccess(c, 200, { items: apps });
  });

  router.post(
    "/config/apps",
    zValidator("json", CreateConfigAppInputSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config app payload is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const result = await configService.createApp(
        getAuthContext(c),
        c.req.valid("json"),
        getAuditRequestMetadata(c),
      );

      return jsonSuccess(c, 201, result);
    },
  );

  router.get(
    "/config/apps/:appId/environments",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config app id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { appId } = c.req.valid("param");

      if (!appId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config app id is required",
        );
      }

      const environments = await configService.listEnvironments(
        getAuthContext(c),
        appId,
      );
      return jsonSuccess(c, 200, { items: environments });
    },
  );

  router.post(
    "/config/apps/:appId/environments",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config app id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    zValidator("json", CreateConfigEnvironmentInputSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment payload is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { appId } = c.req.valid("param");

      if (!appId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config app id is required",
        );
      }

      const result = await configService.createEnvironment(
        getAuthContext(c),
        appId,
        c.req.valid("json"),
        getAuditRequestMetadata(c),
      );

      return jsonSuccess(c, 201, result);
    },
  );

  router.get(
    "/config/environments/:environmentId/entries",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { environmentId } = c.req.valid("param");

      if (!environmentId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is required",
        );
      }

      const entries = await configService.listEntries(
        getAuthContext(c),
        environmentId,
      );
      return jsonSuccess(c, 200, entries);
    },
  );

  router.post(
    "/config/environments/:environmentId/entries",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    zValidator("json", UpsertConfigEntryInputSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config entry payload is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { environmentId } = c.req.valid("param");

      if (!environmentId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is required",
        );
      }

      const result = await configService.upsertEntry(
        getAuthContext(c),
        environmentId,
        c.req.valid("json"),
        getAuditRequestMetadata(c),
      );

      return jsonSuccess(c, 200, result);
    },
  );

  router.get(
    "/config/entries/:entryId/versions",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config entry id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { entryId } = c.req.valid("param");

      if (!entryId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config entry id is required",
        );
      }

      const versions = await configService.listEntryVersions(
        getAuthContext(c),
        entryId,
      );
      return jsonSuccess(c, 200, versions);
    },
  );

  router.post(
    "/config/entries/:entryId/rollback",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config entry id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    zValidator("json", RollbackConfigEntryInputSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Rollback payload is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { entryId } = c.req.valid("param");

      if (!entryId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config entry id is required",
        );
      }

      const result = await configService.rollbackEntry(
        getAuthContext(c),
        entryId,
        c.req.valid("json"),
        getAuditRequestMetadata(c),
      );

      return jsonSuccess(c, 200, result);
    },
  );

  router.get(
    "/config/environments/:environmentId/tokens",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { environmentId } = c.req.valid("param");

      if (!environmentId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is required",
        );
      }

      const tokens = await configService.listServiceTokens(
        getAuthContext(c),
        environmentId,
      );
      return jsonSuccess(c, 200, tokens);
    },
  );

  router.post(
    "/config/environments/:environmentId/tokens",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    zValidator("json", CreateConfigServiceTokenInputSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Service token payload is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { environmentId } = c.req.valid("param");

      if (!environmentId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is required",
        );
      }

      const result = await configService.createServiceToken(
        getAuthContext(c),
        environmentId,
        c.req.valid("json"),
        getAuditRequestMetadata(c),
      );

      return jsonSuccess(c, 201, result);
    },
  );

  router.delete(
    "/config/tokens/:tokenId",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Service token id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { tokenId } = c.req.valid("param");

      if (!tokenId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Service token id is required",
        );
      }

      const result = await configService.revokeServiceToken(
        getAuthContext(c),
        tokenId,
        getAuditRequestMetadata(c),
      );

      return jsonSuccess(c, 200, result);
    },
  );

  router.get(
    "/config/environments/:environmentId/events",
    zValidator("param", IdParamSchema, (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is invalid",
          {
            issues: result.error.issues,
          },
        );
      }
    }),
    async (c) => {
      const { environmentId } = c.req.valid("param");

      if (!environmentId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Config environment id is required",
        );
      }

      const environment = await configService.canReadEnvironmentEvent(
        getAuthContext(c),
        environmentId,
      );

      if (!environment) {
        throw new AppError(404, "NOT_FOUND", "Config environment not found");
      }

      return streamSSE(c, async (stream) => {
        const abortController = new AbortController();
        incrementConfigSseConnections("dashboard");
        stream.onAbort(() => {
          abortController.abort();
          decrementConfigSseConnections("dashboard");
        });

        await stream.writeSSE({
          event: "connected",
          data: JSON.stringify({ environmentId }),
        });

        await subscribeToConfigEvents({
          groupId: `nrhq-dashboard-${environmentId}-${crypto.randomUUID()}`,
          signal: abortController.signal,
          onEvent: async (event) => {
            if (event.environmentId !== environmentId) {
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
    },
  );

  return router;
};
