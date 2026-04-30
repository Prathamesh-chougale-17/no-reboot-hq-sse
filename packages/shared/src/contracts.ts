import { z } from "zod";

export const AuthRoleSchema = z.enum(["owner", "admin", "member"]);

export const UserDtoSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().url().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const OrganizationSummaryDtoSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  logo: z.string().url().nullable(),
  createdAt: z.iso.datetime(),
  metadata: z.record(z.string(), z.unknown()).nullable().default({}),
});

export const ActiveOrganizationDtoSchema = OrganizationSummaryDtoSchema;

export const OrganizationMemberDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  role: AuthRoleSchema,
  createdAt: z.iso.datetime(),
  user: UserDtoSchema,
});

export const PendingInvitationDtoSchema = z.object({
  id: z.uuid(),
  email: z.string().email(),
  role: AuthRoleSchema,
  status: z.string(),
  expiresAt: z.iso.datetime(),
  organizationId: z.uuid(),
  inviterId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export const AuditEventTypeSchema = z.enum([
  "organization.created",
  "invitation.created",
  "invitation.accepted",
  "config.app.created",
  "config.environment.created",
  "config.entry.created",
  "config.entry.updated",
  "config.entry.rollback",
  "config.token.created",
  "config.token.revoked",
  "config.event.publish_failed",
]);

export const WebhookEventTypeSchema = AuditEventTypeSchema;

export const AuditActorDtoSchema = z.object({
  userId: z.uuid(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: AuthRoleSchema.nullable(),
});

export const AuditLogEntryDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  eventType: AuditEventTypeSchema,
  actor: AuditActorDtoSchema.nullable(),
  targetUserId: z.uuid().nullable(),
  targetEmail: z.string().email().nullable(),
  targetInvitationId: z.uuid().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().default({}),
  createdAt: z.iso.datetime(),
});

export const AuditLogListDtoSchema = z.object({
  items: z.array(AuditLogEntryDtoSchema),
});

export const WebhookEndpointDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  url: z.url(),
  eventTypes: z.array(WebhookEventTypeSchema).min(1),
  active: z.boolean(),
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const WebhookEndpointListDtoSchema = z.object({
  items: z.array(WebhookEndpointDtoSchema),
});

export const CurrentUserDtoSchema = z.object({
  user: UserDtoSchema,
  organization: ActiveOrganizationDtoSchema.nullable(),
  organizations: z.array(OrganizationSummaryDtoSchema),
  role: AuthRoleSchema.nullable(),
});

export const UsersWorkspaceDtoSchema = z.object({
  viewer: CurrentUserDtoSchema,
  members: z.array(OrganizationMemberDtoSchema),
  invitations: z.array(PendingInvitationDtoSchema),
});

export const InvitationPreviewDtoSchema = z.object({
  id: z.uuid(),
  email: z.string().email(),
  role: AuthRoleSchema,
  status: z.string(),
  expiresAt: z.iso.datetime(),
  organizationName: z.string().min(1),
});

export const OnboardingNextStepSchema = z.enum([
  "ready",
  "join-invitation",
  "select-workspace",
  "create-workspace",
]);

export const OnboardingStateDtoSchema = z.object({
  viewer: CurrentUserDtoSchema,
  pendingInvitations: z.array(InvitationPreviewDtoSchema),
  nextStep: OnboardingNextStepSchema,
  canCreateWorkspace: z.boolean(),
});

export const SignInInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  redirectTo: z.string().trim().optional(),
});

export const AccountSignUpInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  redirectTo: z.string().trim().optional(),
  invitationId: z.uuid().optional(),
});

export const CreateInvitationInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  role: AuthRoleSchema.default("member"),
});

export const CreateWebhookEndpointInputSchema = z.object({
  url: z.url(),
  eventTypes: z
    .array(WebhookEventTypeSchema)
    .min(1)
    .transform((value) => Array.from(new Set(value))),
});

export const CreateOrganizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Organization slug must be kebab-case",
    ),
});

export const CreateWorkspaceInputSchema = CreateOrganizationInputSchema;

export const CreateOrganizationResultDtoSchema = z.object({
  organizationId: z.uuid(),
});

export const CreateWorkspaceResultDtoSchema = z.object({
  workspaceId: z.uuid(),
});

export const CreateInvitationResultDtoSchema = z.object({
  invitationId: z.uuid(),
});

export const CreateWebhookEndpointResultDtoSchema = z.object({
  endpoint: WebhookEndpointDtoSchema,
  secret: z.string().min(1),
});

export const DeleteWebhookEndpointResultDtoSchema = z.object({
  endpointId: z.uuid(),
});

export const AcceptInvitationResultDtoSchema = z.object({
  invitationId: z.uuid(),
  organizationId: z.uuid(),
});

export const AcceptInvitationInputSchema = z.object({
  invitationId: z.uuid(),
});

export const ConfigValueTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "json",
  "secret",
]);

export const ConfigAppDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  environmentCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ConfigEnvironmentDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  appId: z.uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ConfigEntryDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  environmentId: z.uuid(),
  key: z.string().min(1),
  valueType: ConfigValueTypeSchema,
  description: z.string().nullable(),
  currentVersion: z.number().int().nonnegative(),
  value: z.unknown(),
  checksum: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ConfigEntryVersionDtoSchema = z.object({
  id: z.uuid(),
  entryId: z.uuid(),
  organizationId: z.uuid(),
  environmentId: z.uuid(),
  version: z.number().int().positive(),
  valueType: ConfigValueTypeSchema,
  value: z.unknown(),
  checksum: z.string().min(1),
  changeReason: z.string().nullable(),
  rollbackFromVersion: z.number().int().positive().nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export const ConfigServiceTokenDtoSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  environmentId: z.uuid(),
  name: z.string().min(1),
  tokenPrefix: z.string().min(1),
  active: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const ConfigEventDtoSchema = z.object({
  id: z.uuid(),
  eventType: z.enum([
    "config.app.created",
    "config.environment.created",
    "config.entry.created",
    "config.entry.updated",
    "config.entry.rollback",
    "config.token.created",
    "config.token.revoked",
  ]),
  organizationId: z.uuid(),
  appId: z.uuid().nullable(),
  environmentId: z.uuid().nullable(),
  entryId: z.uuid().nullable(),
  entryKey: z.string().nullable(),
  version: z.number().int().positive().nullable(),
  revision: z.number().int().nonnegative().nullable(),
  checksum: z.string().min(1).nullable(),
  occurredAt: z.iso.datetime(),
});

export const ConfigSnapshotDtoSchema = z.object({
  app: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
  }),
  environment: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
  }),
  revision: z.number().int().nonnegative(),
  config: z.record(z.string(), z.unknown()),
  generatedAt: z.iso.datetime(),
});

export const ConfigAppListDtoSchema = z.object({
  items: z.array(ConfigAppDtoSchema),
});

export const ConfigEnvironmentListDtoSchema = z.object({
  items: z.array(ConfigEnvironmentDtoSchema),
});

export const ConfigEntryListDtoSchema = z.object({
  items: z.array(ConfigEntryDtoSchema),
});

export const ConfigEntryVersionListDtoSchema = z.object({
  items: z.array(ConfigEntryVersionDtoSchema),
});

export const ConfigServiceTokenListDtoSchema = z.object({
  items: z.array(ConfigServiceTokenDtoSchema),
});

export const ConfigWorkspaceDtoSchema = z.object({
  apps: z.array(ConfigAppDtoSchema),
  selectedApp: ConfigAppDtoSchema.nullable(),
  environments: z.array(ConfigEnvironmentDtoSchema),
  selectedEnvironment: ConfigEnvironmentDtoSchema.nullable(),
  entries: z.array(ConfigEntryDtoSchema),
  tokens: z.array(ConfigServiceTokenDtoSchema),
});

const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case");

export const ConfigKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^[A-Za-z][A-Za-z0-9_.:-]*$/,
    "Config keys must start with a letter and contain only letters, numbers, _, ., :, or -",
  );

export const CreateConfigAppInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: SlugSchema.optional(),
  description: z.string().trim().max(500).optional(),
});

export const CreateConfigEnvironmentInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: SlugSchema.optional(),
  description: z.string().trim().max(500).optional(),
});

export const UpsertConfigEntryInputSchema = z.object({
  key: ConfigKeySchema,
  valueType: ConfigValueTypeSchema,
  value: z.unknown(),
  expectedVersion: z.number().int().nonnegative().nullable().optional(),
  description: z.string().trim().max(500).optional(),
  changeReason: z.string().trim().max(500).optional(),
});

export const RollbackConfigEntryInputSchema = z.object({
  targetVersion: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
  changeReason: z.string().trim().max(500).optional(),
});

export const CreateConfigServiceTokenInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  expiresAt: z.iso.datetime().optional(),
});

export const CreateConfigAppResultDtoSchema = z.object({
  app: ConfigAppDtoSchema,
});

export const CreateConfigEnvironmentResultDtoSchema = z.object({
  environment: ConfigEnvironmentDtoSchema,
});

export const UpsertConfigEntryResultDtoSchema = z.object({
  entry: ConfigEntryDtoSchema,
  event: ConfigEventDtoSchema,
});

export const RollbackConfigEntryResultDtoSchema =
  UpsertConfigEntryResultDtoSchema;

export const CreateConfigServiceTokenResultDtoSchema = z.object({
  token: ConfigServiceTokenDtoSchema,
  secret: z.string().min(1),
});

export const DeleteConfigServiceTokenResultDtoSchema = z.object({
  tokenId: z.uuid(),
});

export const ForgotPasswordInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  redirectTo: z.string().trim().optional(),
});

export const ResetPasswordInputSchema = z.object({
  token: z.string().trim().min(1),
  newPassword: z.string().min(8).max(128),
});

export const HealthCheckSchema = z.object({
  status: z.enum(["up", "degraded", "down"]),
  detail: z.string(),
});

export const HealthDtoSchema = z.object({
  service: z.string(),
  environment: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
  checks: z.object({
    api: HealthCheckSchema,
    database: HealthCheckSchema,
    observability: HealthCheckSchema,
  }),
});

export type UserDto = z.infer<typeof UserDtoSchema>;
export type AuthRole = z.infer<typeof AuthRoleSchema>;
export type OrganizationSummaryDto = z.infer<
  typeof OrganizationSummaryDtoSchema
>;
export type ActiveOrganizationDto = z.infer<typeof ActiveOrganizationDtoSchema>;
export type OrganizationMemberDto = z.infer<typeof OrganizationMemberDtoSchema>;
export type PendingInvitationDto = z.infer<typeof PendingInvitationDtoSchema>;
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;
export type AuditActorDto = z.infer<typeof AuditActorDtoSchema>;
export type AuditLogEntryDto = z.infer<typeof AuditLogEntryDtoSchema>;
export type AuditLogListDto = z.infer<typeof AuditLogListDtoSchema>;
export type WebhookEndpointDto = z.infer<typeof WebhookEndpointDtoSchema>;
export type WebhookEndpointListDto = z.infer<
  typeof WebhookEndpointListDtoSchema
>;
export type CurrentUserDto = z.infer<typeof CurrentUserDtoSchema>;
export type UsersWorkspaceDto = z.infer<typeof UsersWorkspaceDtoSchema>;
export type InvitationPreviewDto = z.infer<typeof InvitationPreviewDtoSchema>;
export type OnboardingNextStep = z.infer<typeof OnboardingNextStepSchema>;
export type OnboardingStateDto = z.infer<typeof OnboardingStateDtoSchema>;
export type SignInInput = z.infer<typeof SignInInputSchema>;
export type AccountSignUpInput = z.infer<typeof AccountSignUpInputSchema>;
export type CreateInvitationInput = z.infer<typeof CreateInvitationInputSchema>;
export type CreateWebhookEndpointInput = z.infer<
  typeof CreateWebhookEndpointInputSchema
>;
export type CreateOrganizationInput = z.infer<
  typeof CreateOrganizationInputSchema
>;
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInputSchema>;
export type CreateOrganizationResultDto = z.infer<
  typeof CreateOrganizationResultDtoSchema
>;
export type CreateWorkspaceResultDto = z.infer<
  typeof CreateWorkspaceResultDtoSchema
>;
export type CreateInvitationResultDto = z.infer<
  typeof CreateInvitationResultDtoSchema
>;
export type CreateWebhookEndpointResultDto = z.infer<
  typeof CreateWebhookEndpointResultDtoSchema
>;
export type DeleteWebhookEndpointResultDto = z.infer<
  typeof DeleteWebhookEndpointResultDtoSchema
>;
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationInputSchema>;
export type AcceptInvitationResultDto = z.infer<
  typeof AcceptInvitationResultDtoSchema
>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;
export type HealthDto = z.infer<typeof HealthDtoSchema>;
export type ConfigValueType = z.infer<typeof ConfigValueTypeSchema>;
export type ConfigAppDto = z.infer<typeof ConfigAppDtoSchema>;
export type ConfigEnvironmentDto = z.infer<typeof ConfigEnvironmentDtoSchema>;
export type ConfigEntryDto = z.infer<typeof ConfigEntryDtoSchema>;
export type ConfigEntryVersionDto = z.infer<typeof ConfigEntryVersionDtoSchema>;
export type ConfigServiceTokenDto = z.infer<typeof ConfigServiceTokenDtoSchema>;
export type ConfigEventDto = z.infer<typeof ConfigEventDtoSchema>;
export type ConfigSnapshotDto = z.infer<typeof ConfigSnapshotDtoSchema>;
export type ConfigAppListDto = z.infer<typeof ConfigAppListDtoSchema>;
export type ConfigEnvironmentListDto = z.infer<
  typeof ConfigEnvironmentListDtoSchema
>;
export type ConfigEntryListDto = z.infer<typeof ConfigEntryListDtoSchema>;
export type ConfigEntryVersionListDto = z.infer<
  typeof ConfigEntryVersionListDtoSchema
>;
export type ConfigServiceTokenListDto = z.infer<
  typeof ConfigServiceTokenListDtoSchema
>;
export type ConfigWorkspaceDto = z.infer<typeof ConfigWorkspaceDtoSchema>;
export type CreateConfigAppInput = z.infer<typeof CreateConfigAppInputSchema>;
export type CreateConfigEnvironmentInput = z.infer<
  typeof CreateConfigEnvironmentInputSchema
>;
export type UpsertConfigEntryInput = z.infer<
  typeof UpsertConfigEntryInputSchema
>;
export type RollbackConfigEntryInput = z.infer<
  typeof RollbackConfigEntryInputSchema
>;
export type CreateConfigServiceTokenInput = z.infer<
  typeof CreateConfigServiceTokenInputSchema
>;
export type CreateConfigAppResultDto = z.infer<
  typeof CreateConfigAppResultDtoSchema
>;
export type CreateConfigEnvironmentResultDto = z.infer<
  typeof CreateConfigEnvironmentResultDtoSchema
>;
export type UpsertConfigEntryResultDto = z.infer<
  typeof UpsertConfigEntryResultDtoSchema
>;
export type RollbackConfigEntryResultDto = z.infer<
  typeof RollbackConfigEntryResultDtoSchema
>;
export type CreateConfigServiceTokenResultDto = z.infer<
  typeof CreateConfigServiceTokenResultDtoSchema
>;
export type DeleteConfigServiceTokenResultDto = z.infer<
  typeof DeleteConfigServiceTokenResultDtoSchema
>;
