import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const token =
    resolvedSearchParams && typeof resolvedSearchParams.token === 'string'
      ? resolvedSearchParams.token
      : undefined;

  return (
    <AuthShell
      eyebrow="Recovery"
      title="Choose a new password"
      description="This completes the password reset flow issued by Better Auth."
      alternateHref="/sign-in"
      alternateLabel="Return to sign in"
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
