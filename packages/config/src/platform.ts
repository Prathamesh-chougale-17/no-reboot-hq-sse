import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.url().optional());

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const FeatureFlagOverridesSchema = z.object({
  asyncInviteEmail: z.boolean().optional(),
  outgoingWebhooks: z.boolean().optional(),
});

export const AsyncPlatformEnvSchema = z.object({
  REDIS_URL: optionalUrl,
  REDIS_PREFIX: z.string().trim().min(1).default("no-reboot-hq"),
  FEATURE_FLAGS_JSON: optionalString,
  KAFKA_BROKERS: optionalString,
  CONFIG_EVENTS_TOPIC: z.string().trim().min(1).default("config.events"),
  CONFIG_ENCRYPTION_KEY: z
    .string()
    .trim()
    .min(32)
    .default("local-config-encryption-key-32-bytes"),
  CONFIG_TOKEN_PEPPER: z
    .string()
    .trim()
    .min(32)
    .default("local-config-token-pepper-32-bytes"),
  CONFIG_OUTBOX_PUBLISH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),
});

export type AsyncPlatformEnv = z.infer<typeof AsyncPlatformEnvSchema>;
export type ServerFeatureFlags = {
  asyncInviteEmail: boolean;
  outgoingWebhooks: boolean;
};

const parseFeatureFlagOverrides = (
  rawValue: string | undefined,
): z.infer<typeof FeatureFlagOverridesSchema> => {
  if (!rawValue) {
    return {};
  }

  const parsed = JSON.parse(rawValue) as unknown;
  return FeatureFlagOverridesSchema.parse(parsed);
};

export const loadAsyncPlatformEnv = (
  source: Record<string, string | undefined> = process.env,
): AsyncPlatformEnv => AsyncPlatformEnvSchema.parse(source);

export const resolveServerFeatureFlags = (
  source: Record<string, string | undefined> = process.env,
): ServerFeatureFlags => {
  const env = loadAsyncPlatformEnv(source);
  const overrides = parseFeatureFlagOverrides(env.FEATURE_FLAGS_JSON);
  const defaultValue = Boolean(env.REDIS_URL);

  return {
    asyncInviteEmail: overrides.asyncInviteEmail ?? defaultValue,
    outgoingWebhooks: overrides.outgoingWebhooks ?? defaultValue,
  };
};
