import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Recovery"
      title="Reset your password"
      description="We will send a secure reset link using the auth mailer configured for this environment."
      alternateHref="/sign-in"
      alternateLabel="Back to sign in"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
