export const queryKeys = {
  health: ['health'] as const,
  invitations: {
    preview: (invitationId: string) => ['invitations', invitationId, 'preview'] as const,
  },
  me: ['me'] as const,
  onboarding: ['onboarding'] as const,
  users: {
    audit: (limit: number) => ['users', 'audit', limit] as const,
    workspace: ['users', 'workspace'] as const,
  },
};
