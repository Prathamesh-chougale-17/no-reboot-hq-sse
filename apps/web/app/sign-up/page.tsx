import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/auth-shell';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { getCurrentUser } from '@/lib/auth';

const getSafeRedirectTo = (value: string | undefined) =>
  value && value.startsWith('/') && !value.startsWith('//') ? value : undefined;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirectTo?: string; invitationId?: string }>;
}) {
  const [currentUser, resolvedSearchParams] = await Promise.all([
    getCurrentUser(),
    searchParams ?? Promise.resolve(undefined),
  ]);
  const redirectTo = getSafeRedirectTo(
    resolvedSearchParams && typeof resolvedSearchParams.redirectTo === 'string'
      ? resolvedSearchParams.redirectTo
      : undefined,
  );
  const invitationId =
    resolvedSearchParams && typeof resolvedSearchParams.invitationId === 'string'
      ? resolvedSearchParams.invitationId
      : undefined;

  const invitationRedirect = invitationId
    ? `/accept-invite?invitationId=${encodeURIComponent(invitationId)}`
    : undefined;
  const signedInRedirect = redirectTo ?? invitationRedirect ?? '/onboarding';

  if (currentUser) {
    redirect(signedInRedirect as never);
  }

  return (
    <AuthShell
      eyebrow="Authentication"
      title="Create your platform account"
      description="Create your account first. Workspace setup or invitation acceptance happens immediately after."
      alternateHref="/sign-in"
      alternateLabel="Already have an account? Sign in"
    >
      <SignUpForm redirectTo={redirectTo} invitationId={invitationId} />
    </AuthShell>
  );
}
