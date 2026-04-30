export const queryKeys = {
  health: ["health"] as const,
  config: {
    apps: ["config", "apps"] as const,
    environments: (appId: string | null) =>
      ["config", "apps", appId, "environments"] as const,
    entries: (environmentId: string | null) =>
      ["config", "environments", environmentId, "entries"] as const,
    tokens: (environmentId: string | null) =>
      ["config", "environments", environmentId, "tokens"] as const,
    versions: (entryId: string | null) =>
      ["config", "entries", entryId, "versions"] as const,
  },
  invitations: {
    preview: (invitationId: string) =>
      ["invitations", invitationId, "preview"] as const,
  },
  me: ["me"] as const,
  onboarding: ["onboarding"] as const,
  users: {
    audit: (limit: number) => ["users", "audit", limit] as const,
    workspace: ["users", "workspace"] as const,
  },
};
