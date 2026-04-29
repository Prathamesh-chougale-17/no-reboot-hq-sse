import { AuthShell } from '@/components/auth/auth-shell';
import { AcceptInvitePanel } from '@/components/auth/accept-invite-panel';
import { getCurrentUser } from '@/lib/auth';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams?: Promise<{ invitationId?: string }>;
}) {
  const [currentUser, resolvedSearchParams] = await Promise.all([
    getCurrentUser(),
    searchParams ?? Promise.resolve(undefined),
  ]);
  const invitationId =
    resolvedSearchParams && typeof resolvedSearchParams.invitationId === 'string'
      ? resolvedSearchParams.invitationId
      : undefined;

  return (
    <AuthShell
      eyebrow="Organization Invite"
      title="Accept your invitation"
      description="Invitations attach your account to an existing organization and activate the assigned workspace role."
      alternateHref="/sign-in"
      alternateLabel="Back to sign in"
    >
      <AcceptInvitePanel invitationId={invitationId} viewer={currentUser} />
    </AuthShell>
  );
}
